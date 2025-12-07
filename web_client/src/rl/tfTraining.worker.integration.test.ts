import { describe, expect, it } from 'vitest'
import { Worker } from 'node:worker_threads'
import type { WorkerOptions } from 'node:worker_threads'
import { buildSync } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { WorkerResponse, WorkerMessage } from './tfTraining.worker'

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

class BundledWorker extends Worker {
  constructor(_url: string | URL, options?: WorkerOptions) {
    super(workerBundlePath, { ...options })
  }
}

// Force CPU backend for deterministic CI/test runs
process.env.TFJS_BACKEND = 'cpu'

function createWorker(): Worker {
  return new BundledWorker(new URL('./tfTraining.worker.ts', import.meta.url))
}

function waitForMessage<T extends WorkerResponse['type']>(
  worker: Worker,
  targetType: T,
  timeoutMs = 60000
): Promise<Extract<WorkerResponse, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for message type: ${targetType}`))
    }, timeoutMs)

    const handler = (msg: WorkerResponse) => {
      if (msg.type === targetType) {
        cleanup()
        resolve(msg as Extract<WorkerResponse, { type: T }>)
      }
    }

    const errorHandler = (err: Error) => {
      cleanup()
      reject(err)
    }

    function cleanup() {
      clearTimeout(timer)
      worker.off('message', handler)
      worker.off('error', errorHandler)
    }

    worker.on('message', handler)
    worker.on('error', errorHandler)
  })
}

describe('tfTraining.worker integration (real env, gameId aware)', () => {
  it(
    'initializes with gameId and produces eval results without mocks',
    async () => {
      const worker = createWorker()

      worker.on('error', (err) => {
        // Surface initialization errors clearly in test output
        console.error('worker error', err)
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error('worker exited with code', code)
        }
      })

      const ready = waitForMessage(worker, 'ready', 60000)

      const initMessage: WorkerMessage = {
        type: 'init',
        config: {
          // Keep defaults but add a tiny epsilon decay for quick progress
          epsilonDecaySteps: 50,
          bufferSize: 512,
          targetUpdateFreq: 10,
          learningRate: 0.0005,
        },
        numEnvs: 2,
        backend: 'cpu',
        gameId: 'flappy',
      }

      worker.postMessage(initMessage)

      await ready

      // Kick off a short training burst to ensure metrics flow
      const metricsMsg = waitForMessage(worker, 'metrics', 30000)
      worker.postMessage({ type: 'startTraining', visualize: false } satisfies WorkerMessage)
      const metrics = await metricsMsg
      worker.postMessage({ type: 'stopTraining' } satisfies WorkerMessage)

      expect(metrics.data.totalSteps).toBeGreaterThan(0)
      expect(metrics.data.bufferSize).toBeGreaterThan(0)

      // Run a manual eval (no auto-restart) so it finishes on its own and returns results
      const autoEvalResult = waitForMessage(worker, 'autoEvalResult', 60000)
      worker.postMessage({
        type: 'startEval',
        numEnvs: 2,
        autoRestart: false,
      } satisfies WorkerMessage)

      const evalResult = await autoEvalResult

      expect(evalResult.result.numTrials).toBeGreaterThan(0)
      expect(evalResult.result.maxScore).toBeGreaterThanOrEqual(evalResult.result.minScore)

      worker.terminate()
    },
    90000
  )
})
