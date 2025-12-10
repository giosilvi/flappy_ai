/**
 * Game Registry
 * Maps gameId to environment and renderer factories
 */

import type { IVectorizedEnv, EnvFactory, BaseRewardConfig, BaseObservationConfig } from '@/rl/IVectorizedEnv'

// Import game-specific modules
import { VectorizedEnv as FlappyEnv } from './flappy/VectorizedEnv'
import { Renderer as FlappyRenderer } from './flappy/Renderer'
import { TiledRenderer as FlappyTiledRenderer } from './flappy/TiledRenderer'
import { DefaultRewardConfig as FlappyDefaultRewardConfig, DefaultObservationConfig as FlappyDefaultObservationConfig, type RewardConfig as FlappyRewardConfig, type ObservationConfig as FlappyObservationConfig } from './flappy/config'
import type { RawGameState as FlappyGameState } from './flappy/GameState'
import { getObservationDim, ObservationLabels } from './flappy/GameState'

/**
 * Game metadata for display
 */
export interface GameInfo {
  id: string
  name: string
  description: string
  thumbnail?: string
  inputDim: number  // Default input dimension (with default observation config)
  outputDim: number
  defaultObservationConfig?: Record<string, boolean>  // Optional observation feature flags
}

/**
 * Game module interface - what each game exports
 */
export interface GameModule<
  TGameState = unknown,
  TRewardConfig extends BaseRewardConfig = BaseRewardConfig
> {
  createEnv: EnvFactory<TRewardConfig>
  createRenderer: (canvas: HTMLCanvasElement) => { render: (state: TGameState) => void; destroy?: () => void }
  createTiledRenderer: (canvas: HTMLCanvasElement, cols: number, rows: number) => {
    render: (states: TGameState[], rewards?: number[], cumulativeRewards?: number[]) => void
    setInstanceCount: (count: number) => void
    destroy?: () => void
  }
  defaultRewardConfig: TRewardConfig
  info: GameInfo
}

/**
 * Flappy Bird game module
 */
const flappyModule: GameModule<FlappyGameState, FlappyRewardConfig> = {
  createEnv: (numEnvs, rewardConfig, observationConfig) => {
    return new FlappyEnv(
      numEnvs,
      { ...FlappyDefaultRewardConfig, ...rewardConfig },
      { ...FlappyDefaultObservationConfig, ...(observationConfig as Partial<FlappyObservationConfig> | undefined) }
    ) as unknown as IVectorizedEnv
  },
  createRenderer: (canvas) => {
    return new FlappyRenderer(canvas)
  },
  createTiledRenderer: (canvas, cols, rows) => {
    return new FlappyTiledRenderer(canvas, cols, rows)
  },
  defaultRewardConfig: FlappyDefaultRewardConfig,
  info: {
    id: 'flappy',
    name: 'Flappy Bird',
    description: 'Navigate through pipes by flapping at the right moment',
    thumbnail: '/assets/sprites/yellowbird-midflap.png',
    inputDim: getObservationDim(FlappyDefaultObservationConfig),
    outputDim: 2,
    defaultObservationConfig: FlappyDefaultObservationConfig as unknown as Record<string, boolean>,
  },
}

/**
 * Registry of all available games
 */
const gameRegistry: Record<string, GameModule> = {
  flappy: flappyModule as unknown as GameModule,
}

/**
 * Get a game module by ID
 */
export function getGame(gameId: string): GameModule | undefined {
  return gameRegistry[gameId]
}

/**
 * Get all available games
 */
export function getAllGames(): GameInfo[] {
  return Object.values(gameRegistry).map(m => m.info)
}

/**
 * Check if a game exists
 */
export function hasGame(gameId: string): boolean {
  return gameId in gameRegistry
}

/**
 * Default game ID
 */
export const DEFAULT_GAME_ID = 'flappy'

/**
 * Compute input dimension for a given observation config
 * This is game-specific; for now we only support flappy
 */
export function computeInputDim(gameId: string, observationConfig?: BaseObservationConfig): number {
  if (gameId === 'flappy') {
    const obs = (observationConfig || FlappyDefaultObservationConfig) as FlappyObservationConfig
    return getObservationDim(obs)
  }
  // Fall back to default from game info
  const game = getGame(gameId)
  return game?.info?.inputDim ?? 6
}

/**
 * Get human-friendly observation labels for a given game and observation config.
 * Falls back to generic labels if game does not provide a mapping.
 */
export function getObservationLabels(gameId: string, observationConfig?: BaseObservationConfig): string[] {
  if (gameId === 'flappy') {
    const cfg = (observationConfig || FlappyDefaultObservationConfig) as FlappyObservationConfig
    const friendly: Record<(typeof ObservationLabels)[number], string> = {
      birdY: 'y',
      birdVel: 'vel',
      dx1: 'dx₁',
      dy1: 'dy₁',
      dx2: 'dx₂',
      dy2: 'dy₂',
      gapVel1: 'gapV₁',
      gapVel2: 'gapV₂',
      gapSize1: 'gap',
    }
    const labels: string[] = []
    for (const key of ObservationLabels) {
      if ((cfg as unknown as Record<string, boolean>)[key]) {
        labels.push(friendly[key])
      }
    }
    if (labels.length === 0) labels.push('f1')
    return labels
  }

  // Fallback: use observationConfig keys or generic labels
  if (observationConfig) {
    const keys = Object.keys(observationConfig).filter(k => (observationConfig as Record<string, boolean>)[k])
    if (keys.length > 0) return keys
  }
  return ['f1']
}

// Re-export flappy as the default game for backwards compatibility
export * from './flappy'
