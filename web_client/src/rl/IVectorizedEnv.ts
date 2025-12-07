/**
 * Interface for Vectorized Environments
 * Games implement this interface to be compatible with the RL training system
 */

/**
 * Result from stepping all environments
 */
export interface VectorizedStepResult {
  observations: number[][]
  rewards: number[]
  dones: boolean[]
  scores: number[]
  infos: {
    score: number
    episode: number
    steps: number
  }[]
}

/**
 * Statistics for a completed episode
 */
export interface EpisodeStats {
  envIndex: number
  score: number
  reward: number
  length: number
}

/**
 * Base game state interface - games extend this with their specific state
 */
export interface BaseGameState {
  done: boolean
  score: number
}

/**
 * Base reward configuration - games extend this with their specific rewards
 */
export interface BaseRewardConfig {
  stepPenalty: number
  deathPenalty: number
}

/**
 * Interface for vectorized environments
 * Each game implements this to provide parallel environment management
 */
export interface IVectorizedEnv<
  TGameState extends BaseGameState = BaseGameState,
  TRewardConfig extends BaseRewardConfig = BaseRewardConfig
> {
  /**
   * Reset all environments and return initial observations
   */
  resetAll(): number[][]

  /**
   * Step all environments with given actions
   * @param actions - Array of actions, one per environment
   * @param autoReset - If true, automatically reset environments that are done
   */
  stepAll(actions: number[], autoReset?: boolean): VectorizedStepResult

  /**
   * Get current observations from all environments
   */
  getObservations(): number[][]

  /**
   * Get raw game states from all environments (for visualization)
   */
  getStates(): TGameState[]

  /**
   * Resize the environment (change number of parallel instances)
   */
  resize(newNumEnvs: number): void

  /**
   * Get number of environments
   */
  getNumEnvs(): number

  /**
   * Count number of active (not done) environments
   */
  countActive(): number

  /**
   * Set callback for episode completion
   */
  setOnEpisodeComplete(callback: ((stats: EpisodeStats) => void) | null): void

  /**
   * Clear the episode completion callback
   */
  clearOnEpisodeComplete(): void

  /**
   * Update reward configuration for all environments
   */
  setRewardConfig(config: Partial<TRewardConfig>): void

  /**
   * Get scores from all environments
   */
  getScores(): number[]

  /**
   * Get states with reward information for visualization
   */
  getStatesWithRewards(): Array<{ state: TGameState; reward: number; cumulativeReward: number }>

  /**
   * Get aggregate statistics across all environments
   */
  getAggregateStats(): {
    totalEpisodes: number
    avgReward: number
    avgLength: number
  }
}

/**
 * Factory function type for creating environments
 */
export type EnvFactory<TRewardConfig extends BaseRewardConfig = BaseRewardConfig> = (
  numEnvs: number,
  rewardConfig?: Partial<TRewardConfig>
) => IVectorizedEnv
