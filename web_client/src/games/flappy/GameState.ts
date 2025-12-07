/**
 * Game state types and observation helpers
 */

import { GameConfig, type ObservationConfig } from './config'

/**
 * Raw game state - internal representation
 */
export interface RawGameState {
  // Bird state
  birdY: number
  birdVelY: number
  birdRotation: number

  // Pipe state (next two pipes)
  pipes: PipeState[]

  // Floor scroll position (for rendering)
  floorX: number

  // Game progress
  score: number
  done: boolean
  frameCount: number
}

export interface PipeState {
  x: number
  gapCenterY: number
  gapSize: number // Per-pipe gap size for progressive difficulty
  gapVelY?: number // For moving gaps
  passed: boolean
}

/**
 * Create initial game state
 */
export function createInitialState(): RawGameState {
  return {
    birdY: GameConfig.BIRD.INITIAL_Y,
    birdVelY: 0,
    birdRotation: 0,
    pipes: [],
    floorX: 0,
    score: 0,
    done: false,
    frameCount: 0,
  }
}

/**
 * Convert raw state to normalized observation vector for RL
 * Matches Python implementation exactly for consistency
 */
export function stateToObservation(
  state: RawGameState,
  config: ObservationConfig
): number[] {
  const obs: number[] = []

  // Bird Y position normalized by viewport height
  if (config.birdY) {
    obs.push(state.birdY / GameConfig.VIEWPORT_HEIGHT)
  }

  // Bird velocity normalized by max velocity
  if (config.birdVel) {
    const velyCap = Math.max(
      Math.abs(GameConfig.BIRD.MAX_VELOCITY_DOWN),
      Math.abs(GameConfig.BIRD.MAX_VELOCITY_UP)
    )
    const clampedVel = clamp(state.birdVelY, -velyCap, velyCap)
    obs.push(clampedVel / velyCap)
  }

  // Get next two pipes (or default if not enough pipes)
  const pipe1 = state.pipes[0] || createDefaultPipe(1)
  const pipe2 = state.pipes[1] || createDefaultPipe(2)

  // Pipe 1 features
  if (config.dx1) {
    obs.push((pipe1.x - GameConfig.BIRD.X) / GameConfig.WIDTH)
  }
  if (config.dy1) {
    obs.push((pipe1.gapCenterY - state.birdY) / GameConfig.VIEWPORT_HEIGHT)
  }

  // Pipe 2 features
  if (config.dx2) {
    obs.push((pipe2.x - GameConfig.BIRD.X) / GameConfig.WIDTH)
  }
  if (config.dy2) {
    obs.push((pipe2.gapCenterY - state.birdY) / GameConfig.VIEWPORT_HEIGHT)
  }

  // Gap velocities (for moving gaps mode)
  if (config.gapVel1) {
    obs.push((pipe1.gapVelY || 0) / GameConfig.VIEWPORT_HEIGHT)
  }
  if (config.gapVel2) {
    obs.push((pipe2.gapVelY || 0) / GameConfig.VIEWPORT_HEIGHT)
  }

  return obs
}

/**
 * Get the dimension of observation vector based on config
 */
export function getObservationDim(config: ObservationConfig): number {
  let dim = 0
  if (config.birdY) dim++
  if (config.birdVel) dim++
  if (config.dx1) dim++
  if (config.dy1) dim++
  if (config.dx2) dim++
  if (config.dy2) dim++
  if (config.gapVel1) dim++
  if (config.gapVel2) dim++
  return dim
}

/**
 * Create a default pipe state for when no pipes are visible
 */
function createDefaultPipe(index: number): PipeState {
  return {
    x: GameConfig.WIDTH + GameConfig.PIPE.SPAWN_DISTANCE * index,
    gapCenterY: GameConfig.VIEWPORT_HEIGHT / 2,
    gapSize: GameConfig.PIPE.INITIAL_GAP,
    gapVelY: 0,
    passed: false,
  }
}

/**
 * Utility: clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}






