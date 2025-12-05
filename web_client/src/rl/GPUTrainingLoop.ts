/**
 * GPU Training Loop - orchestrates RL training with GPU acceleration
 * Uses GPUDQNAgent for TensorFlow.js WebGPU/WebGL training with multi-bird support
 */

import { GameEngine, type RewardConfig, type StepResult } from '@/game'
import { GPUDQNAgent, type GPUDQNConfig } from './GPUDQNAgent'
import type { TrainingMetrics, AutoEvalResult } from './types'

export interface GPUTrainingCallbacks {
  onStep?: (metrics: TrainingMetrics, qValues: number[]) => void
  onEpisodeEnd?: (metrics: TrainingMetrics) => void
  onTrainingStart?: () => void
  onTrainingStop?: () => void
  onGPUReady?: (backend: string, gpuAvailable: boolean) => void
  onAutoEvalResult?: (result: AutoEvalResult) => void
}

const WARMUP_SIZE = 10000

export class GPUTrainingLoop {
  private engine: GameEngine
  private agent: GPUDQNAgent | null = null
  private callbacks: GPUTrainingCallbacks
  private agentConfig: Partial<GPUDQNConfig>
  private initialized: boolean = false

  // Fast mode state
  private fastModeActive: boolean = false
  private lastWorkerMetrics: TrainingMetrics | null = null

  // Training state
  private isRunning: boolean = false
  private speedFactor: number = 1.0

  // Current episode state (for normal mode rendering)
  private currentState: number[] = []
  private episodeReward: number = 0
  private episodeLength: number = 0
  private episode: number = 0

  // Metrics tracking
  private recentRewards: number[] = []
  private recentLengths: number[] = []
  private readonly metricsWindow = 50
  private lastStepTime: number = 0
  private stepsSinceLastMetric: number = 0
  private stepsPerSecond: number = 0

  constructor(
    engine: GameEngine,
    agentConfig: Partial<GPUDQNConfig> = {},
    callbacks: GPUTrainingCallbacks = {}
  ) {
    this.engine = engine
    this.agentConfig = agentConfig
    this.callbacks = callbacks
  }

  /**
   * Initialize the GPU agent
   */
  init(): void {
    if (this.initialized) return

    console.log('[GPUTrainingLoop] Initializing with GPU Worker...')

    // Create the GPU agent
    this.agent = new GPUDQNAgent(this.agentConfig)

    // Listen for worker metrics (fast mode)
    this.agent.onFastMetrics((metrics) => {
      this.lastWorkerMetrics = metrics
      this.callbacks.onStep?.(metrics, this.agent?.getLastQValues() ?? [0, 0])
    })

    this.agent.onAutoEvalResult((result) => {
      this.callbacks.onAutoEvalResult?.(result)
    })

    this.initialized = true
    console.log('[GPUTrainingLoop] Initialized!')
  }

  /**
   * Start training
   */
  start(): void {
    if (this.isRunning) return

    this.init()

    this.isRunning = true
    this.currentState = this.engine.reset()
    this.episodeReward = 0
    this.episodeLength = 0
    this.lastStepTime = performance.now()

    this.callbacks.onTrainingStart?.()
  }

  /**
   * Stop training
   */
  stop(): void {
    this.isRunning = false
    if (this.fastModeActive) {
      this.setFastMode(false)
    }
    this.callbacks.onTrainingStop?.()
  }

  /**
   * Execute one training step (for normal mode with rendering)
   */
  step(): { result: StepResult; episodeEnded: boolean; finalReward?: number; finalLength?: number } | null {
    if (!this.isRunning || !this.agent) return null

    if (this.fastModeActive) {
      return null
    }

    const action = this.agent.act(this.currentState, true) as 0 | 1
    const result = this.engine.step(action)

    this.agent.remember({
      state: this.currentState,
      action,
      reward: result.reward,
      nextState: result.observation,
      done: result.done,
    })

    this.episodeReward += result.reward
    this.episodeLength++
    this.stepsSinceLastMetric++

    // Calculate steps per second
    const now = performance.now()
    const elapsed = now - this.lastStepTime
    if (elapsed >= 1000) {
      this.stepsPerSecond = (this.stepsSinceLastMetric / elapsed) * 1000
      this.stepsSinceLastMetric = 0
      this.lastStepTime = now
    }

    const qValues = this.agent.getLastQValues()
    this.callbacks.onStep?.(this.getMetrics(), qValues)

    if (result.done) {
      this.episode++
      const finalEpisodeReward = this.episodeReward
      const finalEpisodeLength = this.episodeLength

      this.recentRewards.push(finalEpisodeReward)
      this.recentLengths.push(finalEpisodeLength)
      if (this.recentRewards.length > this.metricsWindow) {
        this.recentRewards.shift()
        this.recentLengths.shift()
      }

      this.callbacks.onEpisodeEnd?.(this.getMetrics())

      this.currentState = this.engine.reset()
      this.episodeReward = 0
      this.episodeLength = 0

      return {
        result,
        episodeEnded: true,
        finalReward: finalEpisodeReward,
        finalLength: finalEpisodeLength,
      }
    }

    this.currentState = result.observation
    return { result, episodeEnded: false }
  }

  /**
   * Get current training metrics
   */
  getMetrics(): TrainingMetrics {
    if (this.fastModeActive && this.lastWorkerMetrics) {
      return this.lastWorkerMetrics
    }

    if (this.fastModeActive) {
      return {
        episode: this.episode,
        episodeReward: 0,
        episodeLength: 0,
        avgReward: 0,
        avgLength: 0,
        epsilon: this.agent?.getEpsilon() ?? 1.0,
        loss: 0,
        bufferSize: 0,
        stepsPerSecond: 0,
        totalSteps: this.agent?.getSteps() ?? 0,
        isWarmup: true,
        learningRate: this.agent?.getLearningRate() ?? 0.0005,
        numBirds: this.agent?.getNumBirds() ?? 1,
        gpuBackend: this.agent?.getGPUBackend() ?? 'unknown',
      }
    }

    const avgReward =
      this.recentRewards.length > 0
        ? this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length
        : 0

    const avgLength =
      this.recentLengths.length > 0
        ? this.recentLengths.reduce((a, b) => a + b, 0) / this.recentLengths.length
        : 0

    const bufferSize = this.agent?.getBufferSize() ?? 0
    return {
      episode: this.episode,
      episodeReward: this.episodeReward,
      episodeLength: this.episodeLength,
      avgReward,
      avgLength,
      epsilon: this.agent?.getEpsilon() ?? 1.0,
      loss: this.agent?.getLastLoss() ?? 0,
      bufferSize,
      stepsPerSecond: this.stepsPerSecond,
      totalSteps: this.agent?.getSteps() ?? 0,
      isWarmup: bufferSize < WARMUP_SIZE,
      learningRate: this.agent?.getLearningRate() ?? 0.0005,
      numBirds: this.agent?.getNumBirds() ?? 1,
      gpuBackend: this.agent?.getGPUBackend() ?? 'unknown',
    }
  }

  /**
   * Enable/disable fast mode (GPU accelerated, no rendering)
   */
  setFastMode(enabled: boolean): void {
    if (!this.agent) return

    if (enabled && !this.fastModeActive) {
      if (!this.agent.isUsingWorker()) {
        console.warn('[GPUTrainingLoop] Fast mode requires worker support')
        return
      }
      this.agent.syncWeightsToWorker()
      this.fastModeActive = true
      this.agent.startFastTraining(this.episode, this.agent.getSteps())
    } else if (!enabled && this.fastModeActive) {
      this.fastModeActive = false
      this.agent.stopFastTraining()

      if (this.agent.isUsingWorker()) {
        this.agent.requestWeights()
      }

      if (this.lastWorkerMetrics) {
        this.episode = this.lastWorkerMetrics.episode
        this.agent.syncEpsilonFromWorker(this.lastWorkerMetrics.epsilon)
      }

      this.lastWorkerMetrics = null
      this.episodeReward = 0
      this.episodeLength = 0
      this.stepsPerSecond = 0
      this.currentState = this.engine.reset()
    }
  }

  /**
   * Get current game state for rendering
   */
  getCurrentState(): number[] {
    return this.currentState
  }

  /**
   * Get network visualization
   */
  getNetworkVisualization(): {
    activations: number[][]
    qValues: number[]
    selectedAction: number
  } {
    if (this.fastModeActive) {
      return {
        activations: [],
        qValues: [0, 0],
        selectedAction: 0,
      }
    }

    const state = this.currentState.length > 0 ? this.currentState : [0, 0, 0, 0, 0, 0]

    if (!this.agent) {
      return {
        activations: [state, [], [], [0, 0]],
        qValues: [0, 0],
        selectedAction: 0,
      }
    }
    return this.agent.getNetworkVisualization(state)
  }

  getIsRunning(): boolean {
    return this.isRunning
  }

  isFastModeActive(): boolean {
    return this.fastModeActive
  }

  // ===== Hyperparameter setters =====

  setSpeedFactor(factor: number): void {
    this.speedFactor = Math.max(0.25, Math.min(10, factor))
  }

  getSpeedFactor(): number {
    return this.speedFactor
  }

  setEpsilon(value: number): void {
    this.agent?.setEpsilon(value)
  }

  setAutoDecay(enabled: boolean): void {
    this.agent?.setAutoDecay(enabled)
  }

  getEpsilonDecaySteps(): number {
    return this.agent?.getEpsilonDecaySteps() ?? 100000
  }

  setEpsilonDecaySteps(steps: number): void {
    this.agent?.setEpsilonDecaySteps(steps)
  }

  setLearningRate(lr: number): void {
    this.agent?.setLearningRate(lr)
  }

  setGamma(value: number): void {
    this.agent?.setGamma(value)
  }

  setRewardConfig(config: Partial<RewardConfig>): void {
    this.engine.setRewardConfig(config)
    this.agent?.setRewardConfig(config)
  }

  // ===== GPU-specific setters =====

  setNumBirds(value: number): void {
    this.agent?.setNumBirds(value)
  }

  getNumBirds(): number {
    return this.agent?.getNumBirds() ?? 1
  }

  isGPUAvailable(): boolean {
    return this.agent?.isGPUAvailable() ?? false
  }

  getGPUBackend(): string {
    return this.agent?.getGPUBackend() ?? 'unknown'
  }

  /**
   * Reset training
   */
  reset(): void {
    this.stop()
    this.agent?.reset()
    this.episode = 0
    this.episodeReward = 0
    this.episodeLength = 0
    this.recentRewards = []
    this.recentLengths = []
    this.stepsPerSecond = 0
    this.currentState = this.engine.reset()
  }

  /**
   * Get the agent for saving/loading
   */
  getAgent(): GPUDQNAgent | null {
    return this.agent
  }

  /**
   * Save model weights
   */
  save(): { weights: number[][][]; biases: number[][] } | null {
    return this.agent?.save() ?? null
  }

  /**
   * Load model weights
   */
  load(data: { weights: number[][][]; biases: number[][] }): void {
    this.agent?.load(data)
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop()
    this.agent?.terminate()
    this.agent = null
    this.initialized = false
  }
}

