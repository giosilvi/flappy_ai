/**
 * Vectorized Environment Manager
 * Manages N parallel game instances for efficient batch training
 */

import { GameEngine } from './GameEngine'
import type { RewardConfig, ObservationConfig } from './config'
import { DefaultRewardConfig, DefaultObservationConfig } from './config'
import type { RawGameState } from './GameState'

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

export interface EpisodeStats {
  envIndex: number
  score: number
  reward: number
  length: number
}

/**
 * Vectorized Environment
 * Manages multiple GameEngine instances for parallel training/evaluation
 */
export class VectorizedEnv {
  private engines: GameEngine[]
  private numEnvs: number
  private rewardConfig: RewardConfig
  private observationConfig: ObservationConfig

  // Per-environment episode tracking
  private episodeRewards: number[]
  private episodeLengths: number[]
  private episodeCounts: number[]
  
  // Per-environment last step reward (for visualization)
  private lastStepRewards: number[]

  // Callbacks for episode completion
  private onEpisodeComplete?: (stats: EpisodeStats) => void

  constructor(
    numEnvs: number,
    rewardConfig: RewardConfig = DefaultRewardConfig,
    observationConfig: ObservationConfig = DefaultObservationConfig
  ) {
    this.numEnvs = numEnvs
    this.rewardConfig = rewardConfig
    this.observationConfig = observationConfig
    this.engines = []
    this.episodeRewards = []
    this.episodeLengths = []
    this.episodeCounts = []
    this.lastStepRewards = []

    // Create all game engines
    for (let i = 0; i < numEnvs; i++) {
      this.engines.push(new GameEngine(rewardConfig, observationConfig))
      this.episodeRewards.push(0)
      this.episodeLengths.push(0)
      this.episodeCounts.push(0)
      this.lastStepRewards.push(0)
    }

    console.log(`[VectorizedEnv] Created ${numEnvs} parallel environments`)
  }

  /**
   * Reset all environments and return initial observations
   */
  resetAll(): number[][] {
    const observations: number[][] = []

    for (let i = 0; i < this.numEnvs; i++) {
      observations.push(this.engines[i].reset())
      this.episodeRewards[i] = 0
      this.episodeLengths[i] = 0
      this.lastStepRewards[i] = 0
    }

    return observations
  }

  /**
   * Reset specific environments by index
   */
  resetIndices(indices: number[]): void {
    for (const i of indices) {
      if (i >= 0 && i < this.numEnvs) {
        this.engines[i].reset()
        this.episodeRewards[i] = 0
        this.episodeLengths[i] = 0
        this.lastStepRewards[i] = 0
      }
    }
  }

  /**
   * Step all environments with given actions
   * @param actions - Array of actions, one per environment (0 = idle, 1 = flap)
   * @param autoReset - If true, automatically reset environments that are done (training mode)
   */
  stepAll(actions: number[], autoReset: boolean = true): VectorizedStepResult {
    if (actions.length !== this.numEnvs) {
      throw new Error(`Expected ${this.numEnvs} actions, got ${actions.length}`)
    }

    const observations: number[][] = []
    const rewards: number[] = []
    const dones: boolean[] = []
    const scores: number[] = []
    const infos: { score: number; episode: number; steps: number }[] = []
    const completedEpisodes: EpisodeStats[] = []

    for (let i = 0; i < this.numEnvs; i++) {
      const result = this.engines[i].step(actions[i] as 0 | 1)

      // Track last step reward for visualization
      this.lastStepRewards[i] = result.reward

      // Track episode stats
      this.episodeRewards[i] += result.reward
      this.episodeLengths[i]++

      if (result.done) {
        // Episode completed - record stats
        completedEpisodes.push({
          envIndex: i,
          score: result.info.score,
          reward: this.episodeRewards[i],
          length: this.episodeLengths[i],
        })

        this.episodeCounts[i]++

        if (autoReset) {
          // Auto-reset for training mode
          const newObs = this.engines[i].reset()
          observations.push(newObs)
          this.episodeRewards[i] = 0
          this.episodeLengths[i] = 0
          this.lastStepRewards[i] = 0
        } else {
          // Keep terminal observation for eval mode
          observations.push(result.observation)
        }
      } else {
        observations.push(result.observation)
      }

      rewards.push(result.reward)
      dones.push(result.done)
      scores.push(result.info.score)
      infos.push(result.info)
    }

    // Notify about completed episodes
    if (this.onEpisodeComplete) {
      for (const stats of completedEpisodes) {
        this.onEpisodeComplete(stats)
      }
    }

    return { observations, rewards, dones, scores, infos }
  }

  /**
   * Get current observations from all environments
   */
  getObservations(): number[][] {
    return this.engines.map(engine => engine.getObservation())
  }

  /**
   * Get raw game states from all environments (for visualization)
   */
  getStates(): RawGameState[] {
    return this.engines.map(engine => engine.getState() as RawGameState)
  }

  /**
   * Get states with reward information for visualization
   */
  getStatesWithRewards(): Array<{ state: RawGameState; reward: number; cumulativeReward: number }> {
    return this.engines.map((engine, i) => ({
      state: engine.getState() as RawGameState,
      reward: this.lastStepRewards[i],
      cumulativeReward: this.episodeRewards[i],
    }))
  }

  /**
   * Get states only for environments that are not done
   */
  getActiveStates(): { states: RawGameState[]; indices: number[] } {
    const states: RawGameState[] = []
    const indices: number[] = []

    for (let i = 0; i < this.numEnvs; i++) {
      const state = this.engines[i].getState() as RawGameState
      if (!state.done) {
        states.push(state)
        indices.push(i)
      }
    }

    return { states, indices }
  }

  /**
   * Check which environments are done
   */
  getDoneMask(): boolean[] {
    return this.engines.map(engine => engine.getState().done)
  }

  /**
   * Count number of active (not done) environments
   */
  countActive(): number {
    return this.engines.filter(e => !e.getState().done).length
  }

  /**
   * Set callback for episode completion
   */
  setOnEpisodeComplete(callback: ((stats: EpisodeStats) => void) | null): void {
    this.onEpisodeComplete = callback ?? undefined
  }

  /**
   * Clear the episode completion callback
   */
  clearOnEpisodeComplete(): void {
    this.onEpisodeComplete = undefined
  }

  /**
   * Update reward configuration for all environments
   */
  setRewardConfig(config: Partial<RewardConfig>): void {
    this.rewardConfig = { ...this.rewardConfig, ...config }
    for (const engine of this.engines) {
      engine.setRewardConfig(config)
    }
  }

  /**
   * Get current episode stats for all environments
   */
  getEpisodeStats(): {
    rewards: number[]
    lengths: number[]
    counts: number[]
  } {
    return {
      rewards: [...this.episodeRewards],
      lengths: [...this.episodeLengths],
      counts: [...this.episodeCounts],
    }
  }

  /**
   * Get aggregate statistics across all environments
   */
  getAggregateStats(): {
    totalEpisodes: number
    avgReward: number
    avgLength: number
  } {
    const totalEpisodes = this.episodeCounts.reduce((a, b) => a + b, 0)
    const avgReward = this.episodeRewards.reduce((a, b) => a + b, 0) / this.numEnvs
    const avgLength = this.episodeLengths.reduce((a, b) => a + b, 0) / this.numEnvs

    return { totalEpisodes, avgReward, avgLength }
  }

  /**
   * Resize the environment (change number of parallel instances)
   */
  resize(newNumEnvs: number): void {
    if (newNumEnvs === this.numEnvs) return

    if (newNumEnvs > this.numEnvs) {
      // Add more environments
      for (let i = this.numEnvs; i < newNumEnvs; i++) {
        this.engines.push(new GameEngine(this.rewardConfig, this.observationConfig))
        this.engines[i].reset()
        this.episodeRewards.push(0)
        this.episodeLengths.push(0)
        this.episodeCounts.push(0)
        this.lastStepRewards.push(0)
      }
    } else {
      // Remove environments
      this.engines = this.engines.slice(0, newNumEnvs)
      this.episodeRewards = this.episodeRewards.slice(0, newNumEnvs)
      this.episodeLengths = this.episodeLengths.slice(0, newNumEnvs)
      this.episodeCounts = this.episodeCounts.slice(0, newNumEnvs)
      this.lastStepRewards = this.lastStepRewards.slice(0, newNumEnvs)
    }

    this.numEnvs = newNumEnvs
    console.log(`[VectorizedEnv] Resized to ${newNumEnvs} environments`)
  }

  /**
   * Get number of environments
   */
  getNumEnvs(): number {
    return this.numEnvs
  }

  /**
   * Get scores from all environments
   */
  getScores(): number[] {
    return this.engines.map(e => e.getInfo().score)
  }
}

/**
 * Valid instance counts (4x growth): 1, 4, 16, 64, 256, 1024
 */
export const VALID_INSTANCE_COUNTS = [1, 4, 16, 64, 256, 1024] as const
export type ValidInstanceCount = typeof VALID_INSTANCE_COUNTS[number]

/**
 * Maximum instances that can be visualized (4x4 grid)
 */
export const MAX_VISUALIZED_INSTANCES = 16

/**
 * Check if an instance count is valid
 */
export function isValidInstanceCount(count: number): count is ValidInstanceCount {
  return VALID_INSTANCE_COUNTS.includes(count as ValidInstanceCount)
}

/**
 * Get the next valid instance count (4x growth)
 */
export function getNextInstanceCount(current: ValidInstanceCount): ValidInstanceCount {
  const idx = VALID_INSTANCE_COUNTS.indexOf(current)
  if (idx < VALID_INSTANCE_COUNTS.length - 1) {
    return VALID_INSTANCE_COUNTS[idx + 1]
  }
  return current
}

/**
 * Get the previous valid instance count (4x shrink)
 */
export function getPrevInstanceCount(current: ValidInstanceCount): ValidInstanceCount {
  const idx = VALID_INSTANCE_COUNTS.indexOf(current)
  if (idx > 0) {
    return VALID_INSTANCE_COUNTS[idx - 1]
  }
  return current
}

