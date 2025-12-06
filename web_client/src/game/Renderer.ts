/**
 * Game renderer - draws sprites to canvas (single instance)
 */

import { GameConfig } from './config'
import type { RawGameState } from './GameState'
import {
  SpriteSet,
  loadAllSprites,
  drawRewardIndicator,
  drawScore as drawSharedScore,
  drawPipes as drawSharedPipes,
  drawFloor as drawSharedFloor,
  drawBird as drawSharedBird,
  drawGameOver as drawSharedGameOver,
} from './renderShared'

export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sprites: SpriteSet | null = null
  private birdFrame: number = 0
  private frameCount: number = 0
  private loaded: boolean = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D context')
    }
    this.ctx = ctx

    // Set canvas to native game resolution - CSS handles display scaling
    this.canvas.width = GameConfig.WIDTH
    this.canvas.height = GameConfig.HEIGHT

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false
  }

  /**
   * Load all game sprites
   */
  async loadSprites(): Promise<void> {
    this.sprites = await loadAllSprites(true) // include message sprite
    this.loaded = true
  }

  /**
   * Check if sprites are loaded
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Render a frame of the game
   * @param state - Current game state
   * @param showMessage - Whether to show welcome message
   * @param reward - Optional per-frame reward value to display during training
   * @param cumulativeReward - Optional cumulative episode reward
   */
  render(state: RawGameState, showMessage: boolean = false, reward?: number, cumulativeReward?: number): void {
    if (!this.sprites) return

    this.frameCount++

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw background
    this.drawBackground()

    // Draw pipes
    this.drawPipes(state)

    // Draw floor (scrolling - uses state.floorX for sync with game logic)
    this.drawFloor(state)

    // Draw bird
    this.drawBird(state)

    // Draw score
    this.drawScore(state.score)

    // Draw reward indicator during training (over the ground)
    if (reward !== undefined) {
      this.drawReward(reward, cumulativeReward)
    }

    // Draw message overlay if in welcome state
    if (showMessage) {
      this.drawMessage()
    }

    // Draw game over if dead
    if (state.done) {
      this.drawGameOver()
    }
  }

  private drawBackground(): void {
    if (!this.sprites) return
    this.ctx.drawImage(this.sprites.background, 0, 0)
  }

  private drawFloor(state: RawGameState): void {
    if (!this.sprites) return

    drawSharedFloor(this.ctx, this.sprites, state.floorX)
  }

  private drawPipes(state: RawGameState): void {
    if (!this.sprites) return

    drawSharedPipes(this.ctx, this.sprites, state.pipes)
  }

  private drawBird(state: RawGameState): void {
    if (!this.sprites) return

    const birdX = GameConfig.BIRD.X
    const birdY = state.birdY
    this.birdFrame = drawSharedBird(
      this.ctx,
      this.sprites,
      this.birdFrame,
      this.frameCount,
      birdX,
      birdY,
      state.birdRotation
    )
  }

  private drawScore(score: number): void {
    if (!this.sprites) return

    drawSharedScore(this.ctx, this.sprites, score, GameConfig.WIDTH, 30, 1)
  }

  private drawMessage(): void {
    if (!this.sprites || !this.sprites.message) return

    const msgX = (GameConfig.WIDTH - this.sprites.message.width) / 2
    const msgY = (GameConfig.HEIGHT - this.sprites.message.height) / 2 - 50

    this.ctx.drawImage(this.sprites.message, msgX, msgY)
  }

  private drawGameOver(): void {
    if (!this.sprites) return

    drawSharedGameOver(
      this.ctx,
      this.sprites,
      GameConfig.WIDTH,
      GameConfig.HEIGHT,
      0.3,
      -50
    )
  }

  /**
   * Draw reward indicator in bottom right (over ground texture)
   */
  private drawReward(reward: number, cumulativeReward?: number): void {
    // Position: bottom right, above the floor
    const x = GameConfig.WIDTH - 12
    const y = GameConfig.HEIGHT - 24
    drawRewardIndicator(this.ctx, reward, cumulativeReward, x, y)
  }

  /**
   * Reset animation state (for new game)
   */
  resetFloor(): void {
    this.birdFrame = 0
    this.frameCount = 0
  }

  /**
   * Get canvas for external use
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }
}






