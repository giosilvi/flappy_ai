import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { UnifiedDQN } from './UnifiedDQN'
import type { TrainingMetrics } from './types'
import { Worker as NodeWorker } from 'node:worker_threads'
import type { WorkerOptions } from 'node:worker_threads'
import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// Pre-bundle the training worker to a temporary ESM file so Node workers can run TS code without mocks
const workerEntry = fileURLToPath(new URL('./tfTraining.worker.ts', import.meta.url))
const workerOutDir = path.resolve(path.dirname(workerEntry), '.vitest-tf-worker')
mkdirSync(workerOutDir, { recursive: true })
const workerBundlePath = path.join(workerOutDir, 'tfTraining.worker.mjs')

buildSync({
  entryPoints: [workerEntry],
  outfile: workerBundlePath,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['@tensorflow/*', '@tensorflow/tfjs', '@tensorflow/tfjs-backend-webgpu'],
  banner: {
    js: `
      import { parentPort } from 'node:worker_threads';
      const self = globalThis;
      self.postMessage = (msg) => parentPort?.postMessage?.(msg);
      self.onmessage = null;
      parentPort?.on?.('message', (data) => self.onmessage?.({ data }));
    `,
  },
})

class BundledWorker extends NodeWorker {
  private messageHandler?: (event: { data: unknown }) => void

  constructor(_url: string | URL, options?: WorkerOptions) {
    super(workerBundlePath, { ...options })

    this.on('message', (data: unknown) => {
      this.messageHandler?.({ data })
    })
  }

  set onmessage(handler: ((event: { data: unknown }) => void) | null) {
    this.messageHandler = handler || undefined
  }

  get onmessage(): ((event: { data: unknown }) => void) | null {
    return this.messageHandler || null
  }
}

// Ensure a real Worker implementation is available (no mocks)
if (typeof globalThis.Worker === 'undefined') {
  // Bind the bundled worker to the global Worker used by UnifiedDQN
  const workerShim = BundledWorker as unknown as typeof globalThis.Worker
  ;(globalThis as unknown as { Worker: typeof globalThis.Worker }).Worker = workerShim
}

// Keep tests on CPU to avoid GPU/WebGL requirements in CI
process.env.TFJS_BACKEND = 'cpu'

describe('UnifiedDQN integration (flappy, no mocks)', () => {
  let dqn: UnifiedDQN
  const metrics: TrainingMetrics[] = []
  const modes: string[] = []
  const errors: string[] = []

  beforeAll(async () => {
    dqn = new UnifiedDQN({
      backend: 'cpu',
      numInstances: 1,
      visualize: false,
      frameLimit30: false,
      gameId: 'flappy',
    })

    await dqn.init({
      onMetrics: (m) => metrics.push(m),
      onModeChange: (mode) => modes.push(mode),
      onError: (msg) => errors.push(msg),
    })
  }, 60000)

  afterAll(() => {
    dqn.stopTraining()
    dqn.dispose()
  })

  it(
    'runs a short training loop and emits metrics with real env/backend',
    async () => {
      expect(dqn.isReady()).toBe(true)
      expect(dqn.getConfig().gameId).toBe('flappy')

      dqn.startTraining()

      // Allow the worker loop to produce at least one metrics emission (500ms interval)
      await new Promise((resolve) => setTimeout(resolve, 1200))

      dqn.stopTraining()

      const last = dqn.getLastMetrics()
      expect(errors.length).toBe(0)
      expect(modes).toContain('training')
      expect(last.totalSteps).toBeGreaterThan(0)
      expect(last.bufferSize).toBeGreaterThan(0)
      expect(metrics.length).toBeGreaterThan(0)
    },
    70000
  )
})
