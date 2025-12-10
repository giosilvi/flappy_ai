/**
 * Experience Replay Buffer for DQN
 * Stores transitions and provides random batch sampling
 */

export interface Transition {
  state: number[]
  action: number
  reward: number
  nextState: number[]
  done: boolean
}

export class ReplayBuffer {
  private buffer: Transition[] = []
  private maxSize: number
  private position: number = 0

  constructor(maxSize: number = 100000) {
    this.maxSize = maxSize
  }

  /**
   * Add a transition to the buffer
   */
  add(transition: Transition): void {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(transition)
    } else {
      this.buffer[this.position] = transition
    }
    this.position = (this.position + 1) % this.maxSize
  }

  /**
   * Sample a random batch of transitions
   */
  sample(batchSize: number): Transition[] {
    const batch: Transition[] = []
    const indices = new Set<number>()

    while (indices.size < Math.min(batchSize, this.buffer.length)) {
      indices.add(Math.floor(Math.random() * this.buffer.length))
    }

    for (const idx of indices) {
      batch.push(this.buffer[idx])
    }

    return batch
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length
  }

  /**
   * Check if buffer has enough samples for training
   */
  canSample(batchSize: number): boolean {
    return this.buffer.length >= batchSize
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = []
    this.position = 0
  }

  /**
   * Resize the buffer capacity, preserving the most recent transitions
   * - Growing: just increases maxSize, existing data stays
   * - Shrinking: keeps the most recent min(newCapacity, currentSize) transitions
   */
  resize(newCapacity: number): void {
    if (newCapacity === this.maxSize) return

    if (newCapacity > this.maxSize) {
      // Growing: just update maxSize, data and position remain valid
      this.maxSize = newCapacity
      return
    }

    // Shrinking: keep the most recent min(newCapacity, currentSize) transitions
    const keepCount = Math.min(newCapacity, this.buffer.length)
    if (keepCount === 0) {
      this.buffer = []
      this.position = 0
      this.maxSize = newCapacity
      return
    }

    // Extract most recent items in order (oldest first for new circular buffer)
    // position points to where next write will go, so newest is at (position - 1)
    const newBuffer: Transition[] = []
    const startIdx = (this.position - keepCount + this.buffer.length) % this.buffer.length
    for (let i = 0; i < keepCount; i++) {
      newBuffer.push(this.buffer[(startIdx + i) % this.buffer.length])
    }

    this.buffer = newBuffer
    this.maxSize = newCapacity
    // If we kept exactly newCapacity items, buffer is full, position wraps to 0
    // Otherwise position is at the end of the kept items
    this.position = keepCount % newCapacity
  }
}











