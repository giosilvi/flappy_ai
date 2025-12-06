/**
 * Unified Training Metrics Types
 * Consistent metrics interface for all training modes (single/parallel, visualized/headless)
 */

import type { BackendType } from './backendUtils'

/**
 * Core training metrics - emitted at a fixed rate regardless of training speed
 */
export interface TrainingMetrics {
  // Episode tracking (aggregated across all parallel instances)
  episode: number              // Total episodes completed across all envs
  episodeReward: number        // Last completed episode reward (any env)
  episodeLength: number        // Last completed episode length (any env)
  avgReward: number            // Rolling average reward (last 50 episodes)
  avgLength: number            // Rolling average length (last 50 episodes)

  // Training state
  epsilon: number              // Current exploration rate
  loss: number                 // Latest training loss
  bufferSize: number           // Replay buffer size
  totalSteps: number           // Total environment steps across all envs
  learningRate: number         // Current learning rate

  // Performance
  stepsPerSecond: number       // Environment steps per second (all envs combined)
  episodesPerSecond?: number   // Episodes completed per second (optional for backward compat)

  // Phase indicators
  isWarmup: boolean            // True during warmup phase (collecting experience)
  isAutoEval?: boolean         // True when running automatic evaluation (optional)
  autoEvalTrial?: number       // Current eval trial number
  autoEvalTrials?: number      // Total eval trials

  // Parallel training info (optional for backward compatibility)
  numInstances?: number        // Number of parallel game instances
  backend?: BackendType        // TF.js backend in use
}

/**
 * Default metrics for initialization
 */
export const DefaultTrainingMetrics: TrainingMetrics = {
  episode: 0,
  episodeReward: 0,
  episodeLength: 0,
  avgReward: 0,
  avgLength: 0,
  epsilon: 1.0,
  loss: 0,
  bufferSize: 0,
  totalSteps: 0,
  learningRate: 0.0005,
  stepsPerSecond: 0,
  episodesPerSecond: 0,
  isWarmup: true,
  isAutoEval: false,
  numInstances: 1,
  backend: 'cpu',
}

/**
 * Auto-evaluation results
 */
export interface AutoEvalResult {
  avgScore: number
  maxScore: number
  minScore: number
  medianScore?: number         // Optional for backward compatibility
  scores: number[]
  episode: number              // Episode at which eval was run
  numTrials?: number           // Number of eval trials (optional)
  isAutoEval?: boolean         // True when result came from auto-eval
}

/**
 * Weight health metrics for monitoring training stability
 */
export interface WeightHealthMetrics {
  weightDelta: number          // L2 norm of weight changes per training step
  avgGradSign: number          // Average gradient sign (-1 to 1)
  gradientNorm: number         // Gradient norm before clipping
  timestamp: number            // When these metrics were captured
}

/**
 * Unified stats snapshot - emitted at fixed intervals (e.g., every 500ms)
 */
export interface StatsSnapshot {
  metrics: TrainingMetrics
  weightHealth?: WeightHealthMetrics
  timestamp: number
}

/**
 * Episode completion event
 */
export interface EpisodeCompleteEvent {
  envIndex: number             // Which parallel env finished
  score: number
  reward: number
  length: number
  timestamp: number
}

/**
 * Metrics collector configuration
 */
export interface MetricsConfig {
  emitIntervalMs: number       // How often to emit metrics (default: 500ms)
  rollingWindowSize: number    // Size of rolling average window (default: 50)
  warmupSize: number           // Buffer size before training starts (default: 10000)
}

export const DefaultMetricsConfig: MetricsConfig = {
  emitIntervalMs: 500,
  rollingWindowSize: 50,
  warmupSize: 10000,
}

/**
 * Metrics collector - aggregates stats from parallel environments
 */
export class MetricsCollector {
  private config: MetricsConfig
  private metrics: TrainingMetrics
  private recentRewards: number[] = []
  private recentLengths: number[] = []
  private lastEmitTime: number = 0
  private stepsSinceLastEmit: number = 0
  private episodesSinceLastEmit: number = 0

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DefaultMetricsConfig, ...config }
    this.metrics = { ...DefaultTrainingMetrics }
    this.lastEmitTime = performance.now()
  }

  /**
   * Record an episode completion
   */
  recordEpisode(reward: number, length: number, _score: number): void {
    this.metrics.episode++
    this.metrics.episodeReward = reward
    this.metrics.episodeLength = length
    this.episodesSinceLastEmit++

    // Update rolling averages
    this.recentRewards.push(reward)
    this.recentLengths.push(length)
    if (this.recentRewards.length > this.config.rollingWindowSize) {
      this.recentRewards.shift()
      this.recentLengths.shift()
    }

    this.metrics.avgReward = this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length
    this.metrics.avgLength = this.recentLengths.reduce((a, b) => a + b, 0) / this.recentLengths.length
  }

  /**
   * Record environment steps
   */
  recordSteps(count: number): void {
    this.metrics.totalSteps += count
    this.stepsSinceLastEmit += count
  }

  /**
   * Update training metrics
   */
  updateTrainingMetrics(update: Partial<TrainingMetrics>): void {
    Object.assign(this.metrics, update)
  }

  /**
   * Check if it's time to emit metrics
   */
  shouldEmit(): boolean {
    const now = performance.now()
    return now - this.lastEmitTime >= this.config.emitIntervalMs
  }

  /**
   * Get current metrics and reset interval counters
   */
  emit(): TrainingMetrics {
    const now = performance.now()
    const elapsed = now - this.lastEmitTime

    // Calculate rates
    this.metrics.stepsPerSecond = (this.stepsSinceLastEmit / elapsed) * 1000
    this.metrics.episodesPerSecond = (this.episodesSinceLastEmit / elapsed) * 1000

    // Update warmup status
    this.metrics.isWarmup = this.metrics.bufferSize < this.config.warmupSize

    // Reset interval counters
    this.stepsSinceLastEmit = 0
    this.episodesSinceLastEmit = 0
    this.lastEmitTime = now

    return { ...this.metrics }
  }

  /**
   * Get current metrics without resetting counters
   */
  getMetrics(): TrainingMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = { ...DefaultTrainingMetrics }
    this.recentRewards = []
    this.recentLengths = []
    this.stepsSinceLastEmit = 0
    this.episodesSinceLastEmit = 0
    this.lastEmitTime = performance.now()
  }
}
