/**
 * Tiled Renderer
 * Renders multiple game instances as tiles in a single canvas
 * Supports 1, 4, or 16 instances (4x growth for clean grid layouts)
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

interface TileLayout {
  cols: number
  rows: number
  tileWidth: number
  tileHeight: number
  scale: number
}

/**
 * Calculate grid layout for a given number of instances
 * Uses 4x growth: 1 (1x1), 4 (2x2), 16 (4x4)
 */
function calculateLayout(numInstances: number, canvasWidth: number, canvasHeight: number): TileLayout {
  let cols: number
  let rows: number

  if (numInstances === 1) {
    cols = 1
    rows = 1
  } else if (numInstances <= 4) {
    cols = 2
    rows = 2
  } else if (numInstances <= 16) {
    cols = 4
    rows = 4
  } else {
    // Should not happen - max 16 visualized
    cols = 4
    rows = 4
  }

  const tileWidth = Math.floor(canvasWidth / cols)
  const tileHeight = Math.floor(canvasHeight / rows)

  // Scale factor relative to original game size
  const scaleX = tileWidth / GameConfig.WIDTH
  const scaleY = tileHeight / GameConfig.HEIGHT
  const scale = Math.min(scaleX, scaleY)

  return { cols, rows, tileWidth, tileHeight, scale }
}

export class TiledRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private sprites: SpriteSet | null = null
  private loaded: boolean = false
  private numInstances: number = 1
  private layout: TileLayout

  // Animation state per tile
  private birdFrames: number[] = []
  private frameCount: number = 0

  // Canvas dimensions
  private canvasWidth: number
  private canvasHeight: number

  constructor(canvas: HTMLCanvasElement, canvasWidth: number = 576, canvasHeight: number = 768) {
    this.canvas = canvas
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D context')
    }
    this.ctx = ctx

    // Only set canvas size if different (avoid overwriting Renderer's setup)
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth
      this.canvas.height = canvasHeight
    }

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false

    // Initial layout
    this.layout = calculateLayout(1, canvasWidth, canvasHeight)
  }

  /**
   * Load all game sprites
   */
  async loadSprites(): Promise<void> {
    this.sprites = await loadAllSprites(false) // no message sprite needed
    this.loaded = true
  }

  /**
   * Set the number of instances to render
   */
  setInstanceCount(count: number): void {
    this.numInstances = count
    this.layout = calculateLayout(count, this.canvasWidth, this.canvasHeight)

    // Reset bird frames array
    this.birdFrames = new Array(count).fill(0)
    this.frameCount = 0

    console.log(`[TiledRenderer] Layout: ${this.layout.cols}x${this.layout.rows}, scale: ${this.layout.scale.toFixed(2)}`)
  }

  /**
   * Render multiple game states as tiles
   * @param states - Game states for each instance
   * @param rewards - Optional instant reward for each instance
   * @param cumulativeRewards - Optional cumulative episode reward for each instance
   */
  render(states: RawGameState[], rewards?: number[], cumulativeRewards?: number[]): void {
    if (!this.sprites || !this.loaded) return

    this.frameCount++

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Render each tile
    const instancesToRender = Math.min(states.length, this.numInstances)
    for (let i = 0; i < instancesToRender; i++) {
      const reward = rewards?.[i]
      const cumulativeReward = cumulativeRewards?.[i]
      this.renderTile(i, states[i], reward, cumulativeReward)
    }

    // Fill remaining tiles with placeholder if needed
    for (let i = instancesToRender; i < this.numInstances; i++) {
      this.renderEmptyTile(i)
    }

  }

  /**
   * Render a single game instance in its tile
   */
  private renderTile(index: number, state: RawGameState, reward?: number, cumulativeReward?: number): void {
    if (!this.sprites) return

    const { cols, tileWidth, tileHeight, scale } = this.layout
    const col = index % cols
    const row = Math.floor(index / cols)
    const offsetX = col * tileWidth
    const offsetY = row * tileHeight

    // Save context and apply tile transform
    this.ctx.save()
    this.ctx.translate(offsetX, offsetY)
    this.ctx.scale(scale, scale)

    // Clip to tile bounds
    this.ctx.beginPath()
    this.ctx.rect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT)
    this.ctx.clip()

    // Draw background
    this.ctx.drawImage(this.sprites.background, 0, 0)

    // Draw pipes
    drawSharedPipes(this.ctx, this.sprites, state.pipes)

    // Draw floor
    drawSharedFloor(this.ctx, this.sprites, state.floorX)

    // Draw bird
    const birdX = GameConfig.BIRD.X
    const birdY = state.birdY

    this.birdFrames[index] = drawSharedBird(
      this.ctx,
      this.sprites,
      this.birdFrames[index] || 0,
      this.frameCount,
      birdX,
      birdY,
      state.birdRotation
    )

    // Draw score (slightly larger when more tiles to keep readability)
    this.drawScore(state.score, this.getScoreScale())

    // Draw game over overlay if done
    if (state.done) {
      drawSharedGameOver(
        this.ctx,
        this.sprites,
        GameConfig.WIDTH,
        GameConfig.HEIGHT,
        0.4,
        -this.sprites.gameOver.height / 2
      )
    }

    // Draw tile index label
    this.drawTileLabel(index, scale)

    // Draw 1px black border around tile (only when multiple instances)
    if (this.numInstances > 1) {
      this.ctx.strokeStyle = '#000000'
      this.ctx.lineWidth = 1 / scale  // 1px in screen space
      this.ctx.strokeRect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT)
    }

    this.ctx.restore()

    // Draw reward in screen space (fixed size, not scaled)
    if (reward !== undefined) {
      this.drawRewardUnscaled(reward, cumulativeReward, offsetX, offsetY, tileWidth, tileHeight)
    }
  }

  /**
   * Render an empty placeholder tile
   */
  private renderEmptyTile(index: number): void {
    const { cols, tileWidth, tileHeight, scale } = this.layout
    const col = index % cols
    const row = Math.floor(index / cols)
    const offsetX = col * tileWidth
    const offsetY = row * tileHeight

    this.ctx.save()
    this.ctx.translate(offsetX, offsetY)

    // Dark background
    this.ctx.fillStyle = '#1a1a2e'
    this.ctx.fillRect(0, 0, tileWidth, tileHeight)

    // Label
    this.ctx.fillStyle = '#4a4a6a'
    this.ctx.font = `${Math.floor(16 * scale)}px Arial`
    this.ctx.textAlign = 'center'
    this.ctx.fillText(`#${index + 1}`, tileWidth / 2, tileHeight / 2)

    // Draw 1px black border
    if (this.numInstances > 1) {
      this.ctx.strokeStyle = '#000000'
      this.ctx.lineWidth = 1
      this.ctx.strokeRect(0, 0, tileWidth, tileHeight)
    }

    this.ctx.restore()
  }

  /**
   * Draw score in the tile
   */
  private drawScore(score: number, sizeScale: number = 1.0): void {
    if (!this.sprites) return

    drawSharedScore(this.ctx, this.sprites, score, GameConfig.WIDTH, 20, sizeScale)
  }

  /**
   * Scale score digits based on number of tiles:
   * 1 tile -> 1.0, 4 tiles -> 1.1, 16 tiles -> 1.25
   */
  private getScoreScale(): number {
    if (this.numInstances <= 1) return 1
    if (this.numInstances <= 4) return 1.1
    return 1.25
  }

  /**
   * Draw tile index label
   */
  private drawTileLabel(index: number, scale: number): void {
    // Only show labels when there are multiple tiles
    if (this.numInstances <= 1) return

    const fontSize = Math.max(10, Math.floor(14 / scale))
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    this.ctx.fillRect(2, 2, 24, 16)
    
    this.ctx.fillStyle = '#ffffff'
    this.ctx.font = `bold ${fontSize}px Arial`
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    this.ctx.fillText(`#${index + 1}`, 5, 4)
  }

  /**
   * Draw reward indicator in bottom right (fixed size, not scaled)
   * Draws in screen space after context restore
   * Anchored to tile's bottom-right corner with fixed pixel offset
   */
  private drawRewardUnscaled(
    reward: number, 
    cumulativeReward: number | undefined, 
    tileOffsetX: number, 
    tileOffsetY: number, 
    tileWidth: number,
    tileHeight: number
  ): void {
    // Anchor to tile's bottom-right corner with fixed pixel offset
    const offsetFromRight = 12
    const offsetFromBottom = 24
    
    const screenX = tileOffsetX + tileWidth - offsetFromRight
    const screenY = tileOffsetY + tileHeight - offsetFromBottom
    
    drawRewardIndicator(this.ctx, reward, cumulativeReward, screenX, screenY)
  }

  /**
   * Check if sprites are loaded
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * Get current tile layout info
   */
  getLayout(): TileLayout {
    return { ...this.layout }
  }

  /**
   * Get canvas dimensions
   */
  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvasWidth, height: this.canvasHeight }
  }
}

