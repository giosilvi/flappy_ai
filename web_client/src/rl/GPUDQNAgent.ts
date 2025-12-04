/**
 * GPU-accelerated DQN Agent
 * Uses TensorFlow.js with WebGPU/WebGL backend for GPU acceleration
 * Supports multi-bird parallel simulation
 */

import type { RewardConfig } from '@/game'
import { NeuralNetwork, createDQNNetwork } from './NeuralNetwork'
import type { Transition } from './ReplayBuffer'
import type { TrainingMetrics, AutoEvalResult } from './types'
import { isWebGPUSupported } from './NeuralNetworkTF'

export interface GPUDQNConfig {
  // Network architecture
  inputDim: number
  hiddenLayers: number[]
  actionDim: number

  // Training hyperparameters
  learningRate: number
  gamma: number
  batchSize: number
  bufferSize: number

  // Epsilon-greedy
  epsilonStart: number
  epsilonEnd: number
  epsilonDecaySteps: number

  // Target network
  targetUpdateFreq: number

  // GPU-specific
  numBirds: number  // Number of parallel bird simulations
}

export const DefaultGPUDQNConfig: GPUDQNConfig = {
  inputDim: 6,
  hiddenLayers: [64, 64],
  actionDim: 2,

  // Match CPU defaults for apples-to-apples behaviour
  learningRate: 0.001,
  gamma: 0.99,
  batchSize: 256,  // GPU will still auto-scale based on birds
  bufferSize: 200000,

  epsilonStart: 0.5,
  epsilonEnd: 0.05,
  epsilonDecaySteps: 150000,

  targetUpdateFreq: 500,  // Worker uses env-step based updates

  numBirds: 100,
}

export class GPUDQNAgent {
  private config: GPUDQNConfig
  private worker: Worker | null = null
  private inferenceNetwork: NeuralNetwork  // Local CPU network for main-thread inference
  private workerReady: boolean = false
  private gpuAvailable: boolean = false
  private gpuBackend: string = 'cpu'

  // Training state (tracked on main thread)
  private steps: number = 0
  private epsilon: number
  private autoDecayEnabled: boolean = true
  private decayStartEpsilon: number
  private decayStartStep: number = 0

  // Metrics from worker
  private lastLoss: number = 0
  private bufferSize: number = 0
  private lastQValues: number[] = [0, 0]
  private lastWorkerMetrics: TrainingMetrics | null = null
  private fastMetricsCallback?: (metrics: TrainingMetrics) => void
  private autoEvalCallback?: (result: AutoEvalResult) => void

  // Pending experiences while worker initializes
  private pendingExperiences: Transition[] = []

  constructor(config: Partial<GPUDQNConfig> = {}) {
    this.config = { ...DefaultGPUDQNConfig, ...config }
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart
    this.decayStartStep = 0

    // Create local inference network (CPU, for main thread)
    this.inferenceNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    // Initialize GPU worker
    this.initWorker()

    console.log('[GPUDQNAgent] Created with config:', {
      numBirds: this.config.numBirds,
      batchSize: this.config.batchSize,
      bufferSize: this.config.bufferSize,
    })
  }

  /**
   * Initialize the GPU Web Worker
   */
  private initWorker(): void {
    try {
      this.worker = new Worker(
        new URL('./gpu.worker.ts', import.meta.url),
        { type: 'module' }
      )

      console.log('[GPUDQNAgent] GPU Worker created')

      this.worker.onmessage = (e) => {
        const message = e.data

        switch (message.type) {
          case 'ready':
            console.log(`[GPUDQNAgent] Worker ready with backend: ${message.backend}`)
            this.workerReady = true
            this.gpuAvailable = message.gpuAvailable
            this.gpuBackend = message.backend

            // Send any pending experiences
            if (this.pendingExperiences.length > 0) {
              console.log(`[GPUDQNAgent] Sending ${this.pendingExperiences.length} pending experiences`)
              for (const exp of this.pendingExperiences) {
                try {
                  // Ensure experience is serializable
                  const serializableExp = JSON.parse(JSON.stringify(exp))
                  this.worker?.postMessage({ type: 'experience', transition: serializableExp })
                } catch (err) {
                  console.error('[GPUDQNAgent] Failed to send experience:', err, exp)
                }
              }
            }
            this.pendingExperiences = []
            console.log('[GPUDQNAgent] Ready handler completed')
            break

          case 'weights':
            // Update local inference network with weights from worker
            this.inferenceNetwork.loadJSON(message.data)
            this.lastLoss = message.loss || 0
            break

          case 'fastMetrics':
            this.lastLoss = message.metrics.loss
            this.bufferSize = message.metrics.bufferSize
            this.lastWorkerMetrics = message.metrics
            this.fastMetricsCallback?.(message.metrics)
            break

        case 'autoEvalResult':
          this.autoEvalCallback?.(message.result)
          break

          case 'error':
            console.error('[GPUDQNAgent] Worker error:', message.message)
            break
        }
      }

      this.worker.onerror = (error) => {
        console.error('[GPUDQNAgent] Worker error:', error)
        this.workerReady = false
      }

      // Initialize worker with config
      const serializableConfig = JSON.parse(JSON.stringify(this.config))
      this.worker.postMessage({ type: 'init', config: serializableConfig })
    } catch (error) {
      console.error('[GPUDQNAgent] Failed to create worker:', error)
      this.worker = null
    }
  }

  /**
   * Select action using epsilon-greedy policy
   * Runs on main thread for immediate response
   */
  act(state: number[], training: boolean = true): number {
    if (training) {
      this.steps++
      if (this.autoDecayEnabled) {
        this.updateEpsilon()
      }
    }

    // Always compute Q-values for visualization
    this.lastQValues = this.inferenceNetwork.predict(state)

    // Epsilon-greedy exploration
    if (training && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.config.actionDim)
    }

    // Greedy action
    return this.lastQValues[0] > this.lastQValues[1] ? 0 : 1
  }

  /**
   * Store transition - sends to worker
   */
  remember(transition: Transition): void {
    this.bufferSize = Math.min(this.bufferSize + 1, this.config.bufferSize)

    if (this.worker && this.workerReady) {
      try {
        const serializableTransition = {
          state: [...transition.state],
          action: transition.action,
          reward: transition.reward,
          nextState: [...transition.nextState],
          done: transition.done,
        }
        this.worker.postMessage({ type: 'experience', transition: serializableTransition })
      } catch (error) {
        console.warn('[GPUDQNAgent] Failed to send to worker')
      }
    } else if (this.worker) {
      // Worker exists but not ready: queue
      this.pendingExperiences.push(transition)
      if (this.pendingExperiences.length > this.config.bufferSize) {
        this.pendingExperiences.shift()
      }
    }
  }

  /**
   * Train the network - worker handles this automatically
   */
  replay(): boolean {
    return this.worker !== null && this.workerReady
  }

  /**
   * Update epsilon based on decay schedule
   */
  private updateEpsilon(): void {
    const stepsSinceDecayStart = this.steps - this.decayStartStep
    const frac = Math.min(1.0, stepsSinceDecayStart / this.config.epsilonDecaySteps)
    this.epsilon =
      this.decayStartEpsilon +
      frac * (this.config.epsilonEnd - this.decayStartEpsilon)
  }

  // ===== Getters and Setters =====

  getEpsilon(): number {
    return this.epsilon
  }

  setEpsilon(value: number): void {
    this.epsilon = Math.max(0, Math.min(1, value))
    this.worker?.postMessage({ type: 'setEpsilon', value: this.epsilon })
  }

  getAutoDecay(): boolean {
    return this.autoDecayEnabled
  }

  setAutoDecay(enabled: boolean): void {
    if (enabled && !this.autoDecayEnabled) {
      this.decayStartEpsilon = this.epsilon
      this.decayStartStep = this.steps
    }
    this.autoDecayEnabled = enabled
    this.worker?.postMessage({ type: 'setAutoDecay', enabled })
  }

  getEpsilonDecaySteps(): number {
    return this.config.epsilonDecaySteps
  }

  setEpsilonDecaySteps(steps: number): void {
    this.config.epsilonDecaySteps = Math.max(10000, steps)
  }

  getLearningRate(): number {
    return this.config.learningRate
  }

  setLearningRate(lr: number): void {
    this.config.learningRate = lr
    this.inferenceNetwork.setLearningRate(lr)
    this.worker?.postMessage({ type: 'setLearningRate', value: lr })
  }

  getGamma(): number {
    return this.config.gamma
  }

  setGamma(value: number): void {
    this.config.gamma = Math.max(0, Math.min(1, value))
    this.worker?.postMessage({ type: 'setGamma', value: this.config.gamma })
  }

  getSteps(): number {
    return this.steps
  }

  getLastLoss(): number {
    return this.lastLoss
  }

  getLastQValues(): number[] {
    return this.lastQValues
  }

  getBufferSize(): number {
    return this.bufferSize
  }

  getNumBirds(): number {
    return this.config.numBirds
  }

  setNumBirds(value: number): void {
    const clamped = Math.max(1, Math.min(10000, value))
    this.config.numBirds = clamped
    
    // Auto-adjust batch size based on numBirds for optimal GPU utilization
    this.config.batchSize = this.getOptimalBatchSize(clamped)
    
    this.worker?.postMessage({ type: 'setNumBirds', value: clamped })
  }

  getBatchSize(): number {
    return this.config.batchSize
  }

  setBatchSize(value: number): void {
    const clamped = Math.max(32, Math.min(4096, value))
    this.config.batchSize = clamped
    this.worker?.postMessage({ type: 'setBatchSize', value: clamped })
  }

  /**
   * Calculate optimal batch size based on number of birds
   * Kept moderate for learning stability
   */
  private getOptimalBatchSize(birds: number): number {
    if (birds >= 2000) return 512       // Large: good GPU utilization
    if (birds >= 500) return 256        // Medium: balanced
    if (birds >= 100) return 128        // Standard: stable learning
    return 64                           // Small: conservative
  }

  isGPUAvailable(): boolean {
    return this.gpuAvailable
  }

  getGPUBackend(): string {
    return this.gpuBackend
  }

  onFastMetrics(callback: (metrics: TrainingMetrics) => void): void {
    this.fastMetricsCallback = callback
  }

  onAutoEvalResult(callback: (result: AutoEvalResult) => void): void {
    this.autoEvalCallback = callback
  }

  syncWeightsToWorker(): void {
    if (this.worker && this.workerReady) {
      const weights = this.inferenceNetwork.toJSON()
      this.worker.postMessage({ type: 'setWeights', data: weights })
    }
  }

  startFastTraining(startingEpisode: number = 0, startingTotalSteps: number = 0): void {
    if (this.worker && this.workerReady) {
      this.worker.postMessage({ type: 'setEpsilon', value: this.epsilon })
      this.worker.postMessage({ type: 'setAutoDecay', enabled: this.autoDecayEnabled })
      this.worker.postMessage({ type: 'startFast', startingEpisode, startingTotalSteps })
    }
  }

  stopFastTraining(): void {
    if (this.worker && this.workerReady) {
      this.worker.postMessage({ type: 'stopFast' })
    }
  }

  syncEpsilonFromWorker(workerEpsilon: number): void {
    this.epsilon = workerEpsilon
    this.decayStartEpsilon = workerEpsilon
    this.decayStartStep = this.steps
  }

  getWorkerMetrics(): TrainingMetrics | null {
    return this.lastWorkerMetrics
  }

  setRewardConfig(config: Partial<RewardConfig>): void {
    if (this.worker && this.workerReady) {
      this.worker.postMessage({ type: 'setRewardConfig', config })
    }
  }

  setAutoEval(enabled: boolean, interval?: number, trials?: number): void {
    this.worker?.postMessage({ type: 'setAutoEval', enabled, interval, trials })
  }

  /**
   * Get activations for visualization
   */
  getNetworkVisualization(state: number[]): {
    activations: number[][]
    qValues: number[]
    selectedAction: number
  } {
    const qValues = this.inferenceNetwork.predict(state)
    const activations = this.inferenceNetwork.getActivations()
    const selectedAction = qValues[0] > qValues[1] ? 0 : 1

    return {
      activations,
      qValues,
      selectedAction,
    }
  }

  /**
   * Reset training state
   */
  reset(): void {
    this.steps = 0
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart
    this.decayStartStep = 0
    this.lastLoss = 0
    this.bufferSize = 0
    this.pendingExperiences = []

    // Reinitialize local inference network
    this.inferenceNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    // Reset worker
    this.worker?.postMessage({ type: 'reset' })
  }

  /**
   * Request latest weights from worker
   */
  requestWeights(): void {
    this.worker?.postMessage({ type: 'requestWeights' })
  }

  /**
   * Save model weights
   */
  save(): { weights: number[][][]; biases: number[][] } {
    return this.inferenceNetwork.toJSON()
  }

  /**
   * Load model weights
   */
  load(data: { weights: number[][][]; biases: number[][] }): void {
    this.inferenceNetwork.loadJSON(data)

    if (this.worker && this.workerReady) {
      this.worker.postMessage({ type: 'setWeights', data })
    }
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' })
      this.worker.terminate()
      this.worker = null
      this.workerReady = false
    }
  }

  /**
   * Check if using worker
   */
  isUsingWorker(): boolean {
    return this.worker !== null && this.workerReady
  }
}

/**
 * Check if WebGPU is supported in this browser
 */
export function checkGPUSupport(): { webgpu: boolean; webgl: boolean } {
  const webgpu = isWebGPUSupported()
  const webgl = (() => {
    try {
      const canvas = document.createElement('canvas')
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
      return false
    }
  })()

  return { webgpu, webgl }
}

