/**
 * Unified DQN Manager
 * Single entry point for all DQN training and evaluation operations
 * Manages Web Worker communication and provides a clean API for the UI
 */

import { VALID_INSTANCE_COUNTS, MAX_VISUALIZED_INSTANCES, type ValidInstanceCount } from '../games/flappy/VectorizedEnv'
import type { TFDQNConfig } from './TFDQNAgent'
import { DefaultTFDQNConfig } from './TFDQNAgent'
import type { TrainingMetrics, AutoEvalResult, WeightHealthMetrics } from './types'
import { DefaultTrainingMetrics } from './types'
import type { BackendType } from './backendUtils'
import type { BaseGameState } from './IVectorizedEnv'

// Import worker message types
type WorkerMessage =
  | { type: 'init'; config: Partial<TFDQNConfig>; numEnvs: number; backend: BackendType | 'auto'; gameId?: string }
  | { type: 'setNumEnvs'; count: number }
  | { type: 'startTraining'; visualize: boolean }
  | { type: 'stopTraining' }
  | { type: 'startEval'; numEnvs: number; autoRestart: boolean }
  | { type: 'stopEval' }
  | { type: 'setFrameLimit'; enabled: boolean }
  | { type: 'requestWeights' }
  | { type: 'setWeights'; data: { layerWeights: number[][][] } }
  | { type: 'setEpsilon'; value: number }
  | { type: 'setAutoDecay'; enabled: boolean }
  | { type: 'setEpsilonDecaySteps'; steps: number }
  | { type: 'setLearningRate'; value: number }
  | { type: 'setLRScheduler'; enabled: boolean }
  | { type: 'setGamma'; value: number }
  | { type: 'setRewardConfig'; config: Partial<Record<string, number>> }
  | { type: 'reset' }
  | { type: 'setAutoEval'; enabled: boolean; trials?: number; interval?: number }

type WorkerResponse =
  | { type: 'ready'; backend: BackendType }
  | { type: 'metrics'; data: TrainingMetrics }
  | { type: 'gameStates'; states: BaseGameState[]; rewards?: number[]; cumulativeRewards?: number[] }
  | { type: 'weights'; data: { layerWeights: number[][][] } }
  | { type: 'autoEvalResult'; result: AutoEvalResult }
  | { type: 'weightHealth'; data: WeightHealthMetrics }
  | { type: 'episodeEnd'; score: number; reward: number; length: number; envIndex: number }
  | { type: 'network'; data: { input: number[]; qValues: number[]; selectedAction: number; greedyAction: number; epsilon: number; isExploring: boolean } }
  | { type: 'error'; message: string }

export type UnifiedDQNMode = 'idle' | 'training' | 'eval' | 'autoEval'

export interface UnifiedDQNCallbacks {
  onMetrics?: (metrics: TrainingMetrics) => void
  onGameStates?: (states: BaseGameState[], rewards?: number[], cumulativeRewards?: number[]) => void
  onAutoEvalResult?: (result: AutoEvalResult) => void
  onWeightHealth?: (health: WeightHealthMetrics) => void
  onEpisodeEnd?: (stats: { score: number; reward: number; length: number; envIndex: number }) => void
  onNetwork?: (data: { input: number[]; qValues: number[]; selectedAction: number; greedyAction: number; epsilon: number; isExploring: boolean }) => void
  onReady?: (backend: BackendType) => void
  onError?: (message: string) => void
  onModeChange?: (mode: UnifiedDQNMode) => void
}

export interface UnifiedDQNConfig {
  agentConfig: Partial<TFDQNConfig>
  numInstances: number  // Will be validated to valid instance count
  backend: BackendType | 'auto'
  visualize: boolean
  frameLimit30: boolean
  gameId: string  // Game identifier (e.g., 'flappy')
}

const DEFAULT_CONFIG: UnifiedDQNConfig = {
  agentConfig: {},
  numInstances: 1,
  backend: 'auto',
  visualize: true,
  frameLimit30: false,
  gameId: 'flappy',
}

/**
 * Unified DQN Manager
 * Provides a clean interface for training and evaluation
 */
export class UnifiedDQN {
  private worker: Worker | null = null
  private config: UnifiedDQNConfig
  private callbacks: UnifiedDQNCallbacks = {}
  private mode: UnifiedDQNMode = 'idle'
  private ready: boolean = false
  private currentBackend: BackendType = 'cpu'
  private lastMetrics: TrainingMetrics = { ...DefaultTrainingMetrics }
  private lastWeights: { layerWeights: number[][][] } | null = null

  constructor(config: Partial<UnifiedDQNConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the worker and TensorFlow.js
   */
  async init(callbacks: UnifiedDQNCallbacks = {}): Promise<void> {
    this.callbacks = callbacks

    // Clone config to avoid posting Vue proxies / non-cloneable objects to the worker
    const safeAgentConfig: Partial<TFDQNConfig> = JSON.parse(
      JSON.stringify(this.config.agentConfig || {})
    )

    // Create worker
    this.worker = new Worker(
      new URL('./tfTraining.worker.ts', import.meta.url),
      { type: 'module' }
    )

    // Set up message handler
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(e.data)
    }

    this.worker.onerror = (error) => {
      console.error('[UnifiedDQN] Worker error:', error)
      this.callbacks.onError?.(`Worker error: ${error.message}`)
    }

    // Send initialization message
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'))
      }, 30000)

      const originalOnReady = this.callbacks.onReady
      this.callbacks.onReady = (backend) => {
        clearTimeout(timeout)
        this.ready = true
        this.currentBackend = backend
        originalOnReady?.(backend)
        resolve()
      }

      this.postMessage({
        type: 'init',
        config: safeAgentConfig,
        numEnvs: this.config.numInstances,
        backend: this.config.backend,
        gameId: this.config.gameId,
      })
    })
  }

  /**
   * Handle messages from worker
   */
  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'ready':
        this.currentBackend = msg.backend
        this.callbacks.onReady?.(msg.backend)
        break

      case 'metrics':
        this.lastMetrics = msg.data
        this.callbacks.onMetrics?.(msg.data)
        break

      case 'gameStates':
        this.callbacks.onGameStates?.(msg.states, msg.rewards, msg.cumulativeRewards)
        break

      case 'weights':
        this.lastWeights = msg.data
        break

      case 'autoEvalResult':
        this.callbacks.onAutoEvalResult?.(msg.result)
        break

      case 'weightHealth':
        this.callbacks.onWeightHealth?.(msg.data)
        break

      case 'episodeEnd':
        this.callbacks.onEpisodeEnd?.({
          score: msg.score,
          reward: msg.reward,
          length: msg.length,
          envIndex: msg.envIndex,
        })
        break

      case 'network':
        this.callbacks.onNetwork?.(msg.data)
        break

      case 'error':
        console.error('[UnifiedDQN] Worker error:', msg.message)
        this.callbacks.onError?.(msg.message)
        break
    }
  }

  /**
   * Post message to worker with type checking
   */
  private postMessage(msg: WorkerMessage): void {
    if (!this.worker) {
      console.warn('[UnifiedDQN] Worker not initialized')
      return
    }
    this.worker.postMessage(msg)
  }

  // ===== Configuration =====
  setFrameLimit(enabled: boolean): void {
    this.config.frameLimit30 = enabled
    this.postMessage({ type: 'setFrameLimit', enabled })
  }

  /**
   * Configure auto-eval
   */
  setAutoEval(enabled: boolean, trials?: number, interval?: number): void {
    this.postMessage({ type: 'setAutoEval', enabled, trials, interval })
  }

  /**
   * Set the number of parallel game instances
   * Valid values: 1, 4, 16, 64, 256, 1024
   */
  setNumInstances(count: ValidInstanceCount): void {
    if (!VALID_INSTANCE_COUNTS.includes(count)) {
      console.warn(`[UnifiedDQN] Invalid instance count: ${count}, must be one of ${VALID_INSTANCE_COUNTS.join(', ')}`)
      return
    }

    this.config.numInstances = count
    this.postMessage({ type: 'setNumEnvs', count })

    // Auto-disable visualization if count exceeds max
    if (count > MAX_VISUALIZED_INSTANCES && this.config.visualize) {
      this.config.visualize = false
      console.log(`[UnifiedDQN] Visualization auto-disabled (${count} > ${MAX_VISUALIZED_INSTANCES})`)
    }
  }

  /**
   * Enable or disable visualization
   * Automatically disabled when instances > MAX_VISUALIZED_INSTANCES
   */
  setVisualization(enabled: boolean): void {
    if (enabled && this.config.numInstances > MAX_VISUALIZED_INSTANCES) {
      console.warn(`[UnifiedDQN] Cannot enable visualization with ${this.config.numInstances} instances (max: ${MAX_VISUALIZED_INSTANCES})`)
      return
    }
    this.config.visualize = enabled
  }

  // ===== Training Mode =====

  /**
   * Start training mode
   */
  startTraining(): void {
    if (!this.ready) {
      console.warn('[UnifiedDQN] Not ready, call init() first')
      return
    }

    this.mode = 'training'
    this.callbacks.onModeChange?.('training')

    const visualize = this.config.visualize && this.config.numInstances <= MAX_VISUALIZED_INSTANCES
    this.postMessage({ type: 'setFrameLimit', enabled: this.config.frameLimit30 })
    this.postMessage({ type: 'startTraining', visualize })
  }

  /**
   * Stop training mode
   */
  stopTraining(): void {
    this.mode = 'idle'
    this.callbacks.onModeChange?.('idle')
    this.postMessage({ type: 'stopTraining' })
  }

  // ===== Evaluation Mode =====

  /**
   * Start automatic evaluation (100 parallel instances, continuous)
   */
  startAutoEval(): void {
    if (!this.ready) {
      console.warn('[UnifiedDQN] Not ready, call init() first')
      return
    }

    this.mode = 'autoEval'
    this.callbacks.onModeChange?.('autoEval')
    const autoEvalEnvs = Math.min(this.config.numInstances ?? 64, 64)
    this.postMessage({ type: 'startEval', numEnvs: autoEvalEnvs, autoRestart: true })
  }

  /**
   * Start manual evaluation mode
   * @param numInstances Number of eval instances (1-100)
   */
  startManualEval(numInstances: number = 1): void {
    if (!this.ready) {
      console.warn('[UnifiedDQN] Not ready, call init() first')
      return
    }

    const clampedCount = Math.max(1, Math.min(64, numInstances))
    this.mode = 'eval'
    this.callbacks.onModeChange?.('eval')
    this.postMessage({ type: 'startEval', numEnvs: clampedCount, autoRestart: false })
  }

  /**
   * Stop evaluation mode
   */
  stopEval(): void {
    this.mode = 'idle'
    this.callbacks.onModeChange?.('idle')
    this.postMessage({ type: 'stopEval' })
  }

  // ===== Hyperparameter Control =====

  setEpsilon(value: number): void {
    this.postMessage({ type: 'setEpsilon', value })
  }

  setAutoDecay(enabled: boolean): void {
    this.postMessage({ type: 'setAutoDecay', enabled })
  }

  setEpsilonDecaySteps(steps: number): void {
    this.postMessage({ type: 'setEpsilonDecaySteps', steps })
  }

  setLearningRate(value: number): void {
    this.postMessage({ type: 'setLearningRate', value })
  }

  setLRScheduler(enabled: boolean): void {
    this.postMessage({ type: 'setLRScheduler', enabled })
  }

  setGamma(value: number): void {
    this.postMessage({ type: 'setGamma', value })
  }

  setRewardConfig(config: Partial<Record<string, number>>): void {
    this.postMessage({ type: 'setRewardConfig', config })
  }

  // ===== Model I/O =====

  /**
   * Request weights from worker (async)
   */
  requestWeights(): Promise<{ layerWeights: number[][][] }> {
    return new Promise((resolve) => {
      this.postMessage({ type: 'requestWeights' })
      
      // Wait for weights response
      const checkWeights = setInterval(() => {
        if (this.lastWeights) {
          clearInterval(checkWeights)
          resolve(this.lastWeights)
          this.lastWeights = null
        }
      }, 50)

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkWeights)
        resolve({ layerWeights: [] })
      }, 5000)
    })
  }

  /**
   * Load weights into the agent
   */
  loadWeights(data: { layerWeights: number[][][] }): void {
    this.postMessage({ type: 'setWeights', data })
  }

  /**
   * Save checkpoint to JSON
   */
  async saveCheckpoint(): Promise<string> {
    const weights = await this.requestWeights()
    const checkpoint = {
      type: 'flappy-ai-checkpoint-v3',
      createdAt: new Date().toISOString(),
      architecture: {
        hiddenLayers: this.config.agentConfig.hiddenLayers || DefaultTFDQNConfig.hiddenLayers,
      },
      info: {
        epsilon: this.lastMetrics.epsilon,
        episode: this.lastMetrics.episode,
        totalSteps: this.lastMetrics.totalSteps,
        backend: this.currentBackend,
      },
      network: weights,
    }
    return JSON.stringify(checkpoint, null, 2)
  }

  /**
   * Load checkpoint from JSON
   */
  loadCheckpoint(json: string): boolean {
    try {
      const checkpoint = JSON.parse(json)
      
      // Validate checkpoint format
      const validTypes = ['flappy-ai-checkpoint-v1', 'flappy-ai-checkpoint-v2', 'flappy-ai-checkpoint-v3']
      if (!checkpoint || !validTypes.includes(checkpoint.type)) {
        console.warn('[UnifiedDQN] Invalid checkpoint format')
        return false
      }

      // Load weights
      if (checkpoint.network?.layerWeights) {
        this.loadWeights(checkpoint.network)
      } else if (checkpoint.network?.weights) {
        // Handle v1/v2 format
        this.loadWeights({ layerWeights: checkpoint.network.weights })
      }

      // Restore epsilon
      if (checkpoint.info?.epsilon !== undefined) {
        this.setEpsilon(checkpoint.info.epsilon)
      }

      return true
    } catch (e) {
      console.error('[UnifiedDQN] Failed to load checkpoint:', e)
      return false
    }
  }

  // ===== State =====

  /**
   * Reset the agent and environments
   */
  reset(): void {
    this.mode = 'idle'
    this.callbacks.onModeChange?.('idle')
    this.lastMetrics = { ...DefaultTrainingMetrics }
    this.postMessage({ type: 'reset' })
  }

  /**
   * Get current mode
   */
  getMode(): UnifiedDQNMode {
    return this.mode
  }

  /**
   * Get current backend
   */
  getBackend(): BackendType {
    return this.currentBackend
  }

  /**
   * Get current configuration
   */
  getConfig(): UnifiedDQNConfig {
    return { ...this.config }
  }

  /**
   * Get last received metrics
   */
  getLastMetrics(): TrainingMetrics {
    return { ...this.lastMetrics }
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.ready
  }

  /**
   * Check if visualization is enabled and valid
   */
  canVisualize(): boolean {
    return this.config.visualize && this.config.numInstances <= MAX_VISUALIZED_INSTANCES
  }

  /**
   * Dispose of worker resources
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.ready = false
    this.mode = 'idle'
  }
}

// Re-export constants for convenience
export { VALID_INSTANCE_COUNTS, MAX_VISUALIZED_INSTANCES }
export type { ValidInstanceCount }

