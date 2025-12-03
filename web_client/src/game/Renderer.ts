/**
 * Game renderer - draws sprites to canvas
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
  message: HTMLImageElement
}

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

    // Set canvas size
    this.canvas.width = GameConfig.WIDTH
    this.canvas.height = GameConfig.HEIGHT

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false
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
      bird0,
      bird1,
      bird2,
      pipeGreen,
      gameOver,
      message,
      d0, d1, d2, d3, d4, d5, d6, d7, d8, d9,
    ] = await Promise.all([
      loadImage('background-day.png'),
      loadImage('base.png'),
      loadImage('yellowbird-upflap.png'),
      loadImage('yellowbird-midflap.png'),
      loadImage('yellowbird-downflap.png'),
      loadImage('pipe-green.png'),
      loadImage('gameover.png'),
      loadImage('message.png'),
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
      bird: [bird0, bird1, bird2, bird1], // Animation cycle: up, mid, down, mid
      pipeUp: this.flipImageVertically(pipeGreen),
      pipeDown: pipeGreen,
      digits: [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9],
      gameOver,
      message,
    }

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

    // Use floor position from game state (synced with game logic, not render frames)
    const floorX = state.floorX

    // Draw two copies of floor for seamless scrolling
    const floorY = GameConfig.VIEWPORT_HEIGHT
    this.ctx.drawImage(this.sprites.floor, floorX, floorY)
    this.ctx.drawImage(
      this.sprites.floor,
      floorX + this.sprites.floor.width,
      floorY
    )
  }

  private drawPipes(state: RawGameState): void {
    if (!this.sprites) return

    for (const pipe of state.pipes) {
      const gapTop = pipe.gapCenterY - GameConfig.PIPE.GAP / 2
      const gapBottom = pipe.gapCenterY + GameConfig.PIPE.GAP / 2

      // Upper pipe (flipped)
      const upperY = gapTop - this.sprites.pipeUp.height
      this.ctx.drawImage(this.sprites.pipeUp, pipe.x, upperY)

      // Lower pipe
      this.ctx.drawImage(this.sprites.pipeDown, pipe.x, gapBottom)
    }
  }

  private drawBird(state: RawGameState): void {
    if (!this.sprites) return

    // Animate bird wings
    if (this.frameCount % GameConfig.BIRD.FRAME_RATE === 0) {
      this.birdFrame = (this.birdFrame + 1) % this.sprites.bird.length
    }

    const birdImg = this.sprites.bird[this.birdFrame]
    const birdX = GameConfig.BIRD.X
    const birdY = state.birdY

    // Apply rotation
    this.ctx.save()
    this.ctx.translate(
      birdX + birdImg.width / 2,
      birdY + birdImg.height / 2
    )
    this.ctx.rotate((state.birdRotation * Math.PI) / 180)
    this.ctx.drawImage(
      birdImg,
      -birdImg.width / 2,
      -birdImg.height / 2
    )
    this.ctx.restore()
  }

  private drawScore(score: number): void {
    if (!this.sprites) return

    const scoreStr = score.toString()
    const digitWidth = this.sprites.digits[0].width
    const totalWidth = scoreStr.length * digitWidth
    const startX = (GameConfig.WIDTH - totalWidth) / 2
    const startY = 30

    for (let i = 0; i < scoreStr.length; i++) {
      const digit = parseInt(scoreStr[i], 10)
      this.ctx.drawImage(
        this.sprites.digits[digit],
        startX + i * digitWidth,
        startY
      )
    }
  }

  private drawMessage(): void {
    if (!this.sprites) return

    const msgX = (GameConfig.WIDTH - this.sprites.message.width) / 2
    const msgY = (GameConfig.HEIGHT - this.sprites.message.height) / 2 - 50

    this.ctx.drawImage(this.sprites.message, msgX, msgY)
  }

  private drawGameOver(): void {
    if (!this.sprites) return

    const goX = (GameConfig.WIDTH - this.sprites.gameOver.width) / 2
    const goY = (GameConfig.HEIGHT - this.sprites.gameOver.height) / 2 - 50

    // Semi-transparent overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    this.ctx.fillRect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT)

    this.ctx.drawImage(this.sprites.gameOver, goX, goY)
  }

  /**
   * Draw reward indicator in bottom right (over ground texture)
   * Styled to match Flappy Bird's score aesthetic with outline
   */
  private drawReward(reward: number, cumulativeReward?: number): void {
    const ctx = this.ctx
    
    // Position: bottom right, above the floor
    const x = GameConfig.WIDTH - 12
    const y = GameConfig.HEIGHT - 24
    
    // Helper to draw text with dark outline (like Flappy Bird score)
    const drawOutlinedText = (text: string, tx: number, ty: number, fillColor: string, fontSize: number) => {
      ctx.font = `bold ${fontSize}px Arial, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      
      // Dark outline (draw text offset in all directions)
      ctx.fillStyle = '#543847'
      ctx.fillText(text, tx - 2, ty)
      ctx.fillText(text, tx + 2, ty)
      ctx.fillText(text, tx, ty - 2)
      ctx.fillText(text, tx, ty + 2)
      ctx.fillText(text, tx - 1, ty - 1)
      ctx.fillText(text, tx + 1, ty - 1)
      ctx.fillText(text, tx - 1, ty + 1)
      ctx.fillText(text, tx + 1, ty + 1)
      
      // Main fill
      ctx.fillStyle = fillColor
      ctx.fillText(text, tx, ty)
    }
    
    // Format reward with sign and fixed decimals
    const sign = reward >= 0 ? '+' : ''
    const rewardText = `${sign}${reward.toFixed(3)}`
    
    // Color based on reward value (brighter, more readable)
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
    
    // Label
    drawOutlinedText('REWARD', x, y - 20, '#ffffff', 11)
    
    // Instant reward
    drawOutlinedText(rewardText, x, y, color, 18)
    
    // Cumulative reward below (slightly smaller)
    if (cumulativeReward !== undefined) {
      const cumSign = cumulativeReward >= 0 ? '+' : ''
      const cumText = `Σ ${cumSign}${cumulativeReward.toFixed(2)}`
      const cumColor = cumulativeReward >= 0 ? '#98fb98' : '#ff6347'
      
      drawOutlinedText(cumText, x, y + 20, cumColor, 15)
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






