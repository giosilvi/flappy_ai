/**
 * Game Registry
 * Maps gameId to environment and renderer factories
 */

import type { IVectorizedEnv, EnvFactory, BaseRewardConfig } from '@/rl/IVectorizedEnv'

// Import game-specific modules
import { VectorizedEnv as FlappyEnv } from './flappy/VectorizedEnv'
import { Renderer as FlappyRenderer } from './flappy/Renderer'
import { TiledRenderer as FlappyTiledRenderer } from './flappy/TiledRenderer'
import { DefaultRewardConfig as FlappyDefaultRewardConfig, type RewardConfig as FlappyRewardConfig } from './flappy/config'
import type { RawGameState as FlappyGameState } from './flappy/GameState'

/**
 * Game metadata for display
 */
export interface GameInfo {
  id: string
  name: string
  description: string
  thumbnail?: string
  inputDim: number
  outputDim: number
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
  createEnv: (numEnvs, rewardConfig) => {
    return new FlappyEnv(numEnvs, { ...FlappyDefaultRewardConfig, ...rewardConfig }) as unknown as IVectorizedEnv
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
    inputDim: 6,
    outputDim: 2,
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

// Re-export flappy as the default game for backwards compatibility
export * from './flappy'
