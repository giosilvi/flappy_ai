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
}








