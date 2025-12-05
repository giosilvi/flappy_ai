/**
 * Tiled Renderer
 * Renders multiple game instances as tiles in a single canvas
 * Supports 1, 4, or 16 instances (4x growth for clean grid layouts)
 */

import { GameConfig } from './config'
import type { RawGameState } from './GameState'

interface SpriteSet {
  background: HTMLImageElement
  floor: HTMLImageElement
  bird: HTMLImageElement[]
  pipeUp: HTMLImageElement
  pipeDown: HTMLImageElement
  digits: HTMLImageElement[]
  gameOver: HTMLImageElement
}

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
    const basePath = '/assets/sprites'

    const loadImage = (path: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = `${basePath}/${path}`
      })
    }

    const [
      background,
      floor,
      bird0, bird1, bird2,
      pipeGreen,
      gameOver,
      d0, d1, d2, d3, d4, d5, d6, d7, d8, d9,
    ] = await Promise.all([
      loadImage('background-day.png'),
      loadImage('base.png'),
      loadImage('yellowbird-upflap.png'),
      loadImage('yellowbird-midflap.png'),
      loadImage('yellowbird-downflap.png'),
      loadImage('pipe-green.png'),
      loadImage('gameover.png'),
      loadImage('0.png'),
      loadImage('1.png'),
      loadImage('2.png'),
      loadImage('3.png'),
      loadImage('4.png'),
      loadImage('5.png'),
      loadImage('6.png'),
      loadImage('7.png'),
      loadImage('8.png'),
      loadImage('9.png'),
    ])

    this.sprites = {
      background,
      floor,
      bird: [bird0, bird1, bird2, bird1],
      pipeUp: this.flipImageVertically(pipeGreen),
      pipeDown: pipeGreen,
      digits: [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9],
      gameOver,
    }

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
    for (const pipe of state.pipes) {
      const gapTop = pipe.gapCenterY - GameConfig.PIPE.GAP / 2
      const gapBottom = pipe.gapCenterY + GameConfig.PIPE.GAP / 2
      const upperY = gapTop - this.sprites.pipeUp.height
      this.ctx.drawImage(this.sprites.pipeUp, pipe.x, upperY)
      this.ctx.drawImage(this.sprites.pipeDown, pipe.x, gapBottom)
    }

    // Draw floor
    const floorY = GameConfig.VIEWPORT_HEIGHT
    this.ctx.drawImage(this.sprites.floor, state.floorX, floorY)
    this.ctx.drawImage(this.sprites.floor, state.floorX + this.sprites.floor.width, floorY)

    // Draw bird
    if (this.frameCount % GameConfig.BIRD.FRAME_RATE === 0) {
      this.birdFrames[index] = (this.birdFrames[index] + 1) % this.sprites.bird.length
    }
    const birdImg = this.sprites.bird[this.birdFrames[index] || 0]
    const birdX = GameConfig.BIRD.X
    const birdY = state.birdY

    this.ctx.save()
    this.ctx.translate(birdX + birdImg.width / 2, birdY + birdImg.height / 2)
    this.ctx.rotate((state.birdRotation * Math.PI) / 180)
    this.ctx.drawImage(birdImg, -birdImg.width / 2, -birdImg.height / 2)
    this.ctx.restore()

    // Draw score (smaller for tiles)
    this.drawScore(state.score, scale < 0.5 ? 0.7 : 1.0)

    // Draw game over overlay if done
    if (state.done) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
      this.ctx.fillRect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT)
      
      const goX = (GameConfig.WIDTH - this.sprites.gameOver.width) / 2
      const goY = GameConfig.HEIGHT / 2 - this.sprites.gameOver.height
      this.ctx.drawImage(this.sprites.gameOver, goX, goY)
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

    const scoreStr = score.toString()
    const digitWidth = this.sprites.digits[0].width * sizeScale
    const digitHeight = this.sprites.digits[0].height * sizeScale
    const totalWidth = scoreStr.length * digitWidth
    const startX = (GameConfig.WIDTH - totalWidth) / 2
    const startY = 20

    for (let i = 0; i < scoreStr.length; i++) {
      const digit = parseInt(scoreStr[i], 10)
      this.ctx.drawImage(
        this.sprites.digits[digit],
        startX + i * digitWidth,
        startY,
        digitWidth,
        digitHeight
      )
    }
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
    const ctx = this.ctx
    
    // Anchor to tile's bottom-right corner with fixed pixel offset
    const offsetFromRight = 12  // Fixed pixels from right edge
    const offsetFromBottom = 24  // Fixed pixels from bottom edge
    
    const screenX = tileOffsetX + tileWidth - offsetFromRight
    const screenY = tileOffsetY + tileHeight - offsetFromBottom
    
    // Fixed font sizes (not scaled) - matching original size for 1 instance
    const fontSize = 18
    const labelSize = 11
    const cumSize = 15
    
    // Helper to draw text with dark outline (like Flappy Bird score)
    const drawOutlinedText = (text: string, tx: number, ty: number, fillColor: string, fontSize: number) => {
      ctx.font = `bold ${fontSize}px Arial, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      
      const offset = 2  // Fixed outline offset (matching original)
      
      // Dark outline (draw text offset in all directions)
      ctx.fillStyle = '#543847'
      ctx.fillText(text, tx - offset, ty)
      ctx.fillText(text, tx + offset, ty)
      ctx.fillText(text, tx, ty - offset)
      ctx.fillText(text, tx, ty + offset)
      ctx.fillText(text, tx - offset / 2, ty - offset / 2)
      ctx.fillText(text, tx + offset / 2, ty - offset / 2)
      ctx.fillText(text, tx - offset / 2, ty + offset / 2)
      ctx.fillText(text, tx + offset / 2, ty + offset / 2)
      
      // Main fill
      ctx.fillStyle = fillColor
      ctx.fillText(text, tx, ty)
    }
    
    // Format reward with sign and fixed decimals
    const sign = reward >= 0 ? '+' : ''
    const rewardText = `${sign}${reward.toFixed(3)}`
    
    // Color based on reward value
    let color: string
    if (reward > 0.5) {
      color = '#7fff00' // Chartreuse for big positive
    } else if (reward > 0) {
      color = '#98fb98' // Pale green for small positive
    } else if (reward > -0.1) {
      color = '#fff8dc' // Cornsilk/cream for small negative
    } else if (reward > -0.5) {
      color = '#ffa500' // Orange for medium negative
    } else {
      color = '#ff6347' // Tomato red for big negative
    }
    
    ctx.save()
    
    // Label (spacing in screen space)
    drawOutlinedText('REWARD', screenX, screenY - 20, '#ffffff', labelSize)
    
    // Instant reward
    drawOutlinedText(rewardText, screenX, screenY, color, fontSize)
    
    // Cumulative reward below (slightly smaller)
    if (cumulativeReward !== undefined) {
      const cumSign = cumulativeReward >= 0 ? '+' : ''
      const cumText = `Σ ${cumSign}${cumulativeReward.toFixed(2)}`
      const cumColor = cumulativeReward >= 0 ? '#98fb98' : '#ff6347'
      
      drawOutlinedText(cumText, screenX, screenY + 20, cumColor, cumSize)
    }
    
    ctx.restore()
  }

  /**
   * Flip an image vertically (for upper pipe)
   */
  private flipImageVertically(img: HTMLImageElement): HTMLImageElement {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
    ctx.drawImage(img, 0, 0)

    const flipped = new Image()
    flipped.src = canvas.toDataURL()
    return flipped
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

