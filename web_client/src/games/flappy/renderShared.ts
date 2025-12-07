/**
 * Shared rendering utilities for Renderer and TiledRenderer
 */

import { GameConfig } from './config'

// ============ Types ============

export interface SpriteSet {
  background: HTMLImageElement
  floor: HTMLImageElement
  bird: HTMLImageElement[]
  pipeUp: HTMLImageElement
  pipeDown: HTMLImageElement
  digits: HTMLImageElement[]
  gameOver: HTMLImageElement
  message?: HTMLImageElement // Only used by single-instance Renderer
}

// ============ Constants ============

export const SPRITE_BASE_PATH = '/assets/sprites'

export const REWARD_FONT = {
  LABEL: 11,
  VALUE: 18,
  CUMULATIVE: 15,
}

// ============ Image Loading ============

/**
 * Load a single image from path
 */
export function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `${SPRITE_BASE_PATH}/${path}`
  })
}

/**
 * Flip an image vertically (for upper pipe)
 */
export function flipImageVertically(img: HTMLImageElement): HTMLImageElement {
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
 * Load all game sprites (common set)
 * @param includeMessage - Whether to load the welcome message sprite
 */
export async function loadAllSprites(includeMessage: boolean = false): Promise<SpriteSet> {
  const imagePromises = [
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
  ]

  if (includeMessage) {
    imagePromises.push(loadImage('message.png'))
  }

  const images = await Promise.all(imagePromises)

  const [
    background,
    floor,
    bird0, bird1, bird2,
    pipeGreen,
    gameOver,
    d0, d1, d2, d3, d4, d5, d6, d7, d8, d9,
    ...rest
  ] = images

  const message = includeMessage ? rest[0] : undefined

  return {
    background,
    floor,
    bird: [bird0, bird1, bird2, bird1], // Animation cycle: up, mid, down, mid
    pipeUp: flipImageVertically(pipeGreen),
    pipeDown: pipeGreen,
    digits: [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9],
    gameOver,
    message,
  }
}

// ============ Text Drawing ============

/**
 * Draw text with black outline and drop shadow
 */
export function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  fontSize: number,
  align: CanvasTextAlign = 'right',
  baseline: CanvasTextBaseline = 'bottom'
): void {
  ctx.save()
  ctx.font = `bold ${fontSize}px Arial, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = baseline

  // Thin black outline (no shadow)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#000000'
  ctx.shadowColor = 'transparent'
  ctx.strokeText(text, x, y)

  // Single drop shadow to bottom-right, then fill
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 2
  ctx.shadowBlur = 0
  ctx.fillStyle = fillColor
  ctx.fillText(text, x, y)
  ctx.restore()
}

// ============ Reward Formatting ============

/**
 * Get color for reward value
 */
export function getRewardColor(reward: number): string {
  if (reward > 0.5) {
    return '#7fff00' // Chartreuse for big positive
  } else if (reward > 0) {
    return '#98fb98' // Pale green for small positive
  } else if (reward > -0.1) {
    return '#fff8dc' // Cornsilk/cream for small negative
  } else if (reward > -0.5) {
    return '#ffa500' // Orange for medium negative
  } else {
    return '#ff6347' // Tomato red for big negative
  }
}

/**
 * Format reward value with sign
 */
export function formatReward(reward: number, decimals: number = 3): string {
  const sign = reward >= 0 ? '+' : ''
  return `${sign}${reward.toFixed(decimals)}`
}

/**
 * Draw full reward indicator (label + value + cumulative)
 */
export function drawRewardIndicator(
  ctx: CanvasRenderingContext2D,
  reward: number,
  cumulativeReward: number | undefined,
  x: number,
  y: number
): void {
  ctx.save()

  // Label
  drawOutlinedText(ctx, 'REWARD', x, y - 20, '#ffffff', REWARD_FONT.LABEL)

  // Instant reward
  const color = getRewardColor(reward)
  const rewardText = formatReward(reward, 3)
  drawOutlinedText(ctx, rewardText, x, y, color, REWARD_FONT.VALUE)

  // Cumulative reward below
  if (cumulativeReward !== undefined) {
    const cumText = `Σ ${formatReward(cumulativeReward, 2)}`
    const cumColor = cumulativeReward >= 0 ? '#98fb98' : '#ff6347'
    drawOutlinedText(ctx, cumText, x, y + 20, cumColor, REWARD_FONT.CUMULATIVE)
  }

  ctx.restore()
}

// ============ Sprite Drawing ============

/**
 * Draw score digits centered horizontally
 */
export function drawScore(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  score: number,
  canvasWidth: number,
  topY: number,
  sizeScale: number = 1
): void {
  const scoreStr = score.toString()
  const digitWidth = sprites.digits[0].width * sizeScale
  const digitHeight = sprites.digits[0].height * sizeScale
  const totalWidth = scoreStr.length * digitWidth
  const startX = (canvasWidth - totalWidth) / 2

  for (let i = 0; i < scoreStr.length; i++) {
    const digit = parseInt(scoreStr[i], 10)
    ctx.drawImage(
      sprites.digits[digit],
      startX + i * digitWidth,
      topY,
      digitWidth,
      digitHeight
    )
  }
}

/**
 * Draw pipes based on gap and positions
 */
export function drawPipes(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  pipes: { x: number; gapCenterY: number; gapSize: number }[]
): void {
  for (const pipe of pipes) {
    // Use per-pipe gapSize for progressive difficulty
    const gapTop = pipe.gapCenterY - pipe.gapSize / 2
    const gapBottom = pipe.gapCenterY + pipe.gapSize / 2
    const upperY = gapTop - sprites.pipeUp.height
    ctx.drawImage(sprites.pipeUp, pipe.x, upperY)
    ctx.drawImage(sprites.pipeDown, pipe.x, gapBottom)
  }
}

/**
 * Draw scrolling floor using current x offset
 */
export function drawFloor(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  floorX: number
): void {
  const floorY = GameConfig.VIEWPORT_HEIGHT
  ctx.drawImage(sprites.floor, floorX, floorY)
  ctx.drawImage(sprites.floor, floorX + sprites.floor.width, floorY)
}

/**
 * Draw animated bird with rotation, returning updated frame index
 */
export function drawBird(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  currentFrame: number,
  frameCount: number,
  x: number,
  y: number,
  rotationDeg: number
): number {
  let nextFrame = currentFrame
  if (frameCount % GameConfig.BIRD.FRAME_RATE === 0) {
    nextFrame = (currentFrame + 1) % sprites.bird.length
  }

  const birdImg = sprites.bird[nextFrame]
  ctx.save()
  ctx.translate(x + birdImg.width / 2, y + birdImg.height / 2)
  ctx.rotate((rotationDeg * Math.PI) / 180)
  ctx.drawImage(birdImg, -birdImg.width / 2, -birdImg.height / 2)
  ctx.restore()

  return nextFrame
}

/**
 * Draw game over overlay with configurable alpha and Y offset
 * offsetY is applied to the centered image position
 */
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteSet,
  canvasWidth: number,
  canvasHeight: number,
  overlayAlpha: number,
  offsetY: number
): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  const goX = (canvasWidth - sprites.gameOver.width) / 2
  const goY = (canvasHeight - sprites.gameOver.height) / 2 + offsetY
  ctx.drawImage(sprites.gameOver, goX, goY)
}

