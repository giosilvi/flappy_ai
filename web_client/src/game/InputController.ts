/**
 * Input controller - handles keyboard and touch input
 */

import type { GameAction } from './config'

export type InputCallback = (action: GameAction) => void

export class InputController {
  private callback: InputCallback | null = null
  private enabled: boolean = false
  private boundKeyHandler: (e: KeyboardEvent) => void
  private boundTouchHandler: (e: TouchEvent) => void
  private boundClickHandler: (e: MouseEvent) => void
  private target: HTMLElement | null = null

  constructor() {
    this.boundKeyHandler = this.handleKeyDown.bind(this)
    this.boundTouchHandler = this.handleTouch.bind(this)
    this.boundClickHandler = this.handleClick.bind(this)
  }

  /**
   * Start listening for input
   */
  enable(target: HTMLElement, callback: InputCallback): void {
    this.callback = callback
    this.target = target
    this.enabled = true

    document.addEventListener('keydown', this.boundKeyHandler)
    target.addEventListener('touchstart', this.boundTouchHandler, { passive: true })
    target.addEventListener('click', this.boundClickHandler)
  }

  /**
   * Stop listening for input
   */
  disable(): void {
    this.enabled = false
    this.callback = null

    document.removeEventListener('keydown', this.boundKeyHandler)
    if (this.target) {
      this.target.removeEventListener('touchstart', this.boundTouchHandler)
      this.target.removeEventListener('click', this.boundClickHandler)
    }
    this.target = null
  }

  /**
   * Check if input is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled || !this.callback) return

    // Flap on space, up arrow, or W
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault()
      this.callback(1)
    }
  }

  private handleTouch(_e: TouchEvent): void {
    if (!this.enabled || !this.callback) return
    this.callback(1)
  }

  private handleClick(e: MouseEvent): void {
    if (!this.enabled || !this.callback) return

    e.preventDefault()
    this.callback(1)
  }
}






