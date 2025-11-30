/**
 * DQN Agent - handles action selection and training
 * Uses custom NeuralNetwork (no TensorFlow.js)
 */

import { NeuralNetwork, createDQNNetwork } from './NeuralNetwork'
import { ReplayBuffer, type Transition } from './ReplayBuffer'

export interface DQNConfig {
  // Network architecture
  inputDim: number
  hiddenLayers: number[]
  actionDim: number

  // Training hyperparameters
  learningRate: number
  gamma: number // Discount factor
  batchSize: number
  bufferSize: number

  // Epsilon-greedy
  epsilonStart: number
  epsilonEnd: number
  epsilonDecaySteps: number

  // Target network
  targetUpdateFreq: number
}

export const DefaultDQNConfig: DQNConfig = {
  inputDim: 6,
  hiddenLayers: [64, 64],
  actionDim: 2,

  learningRate: 0.001,  // Standard LR
  gamma: 0.99,
  batchSize: 32,
  bufferSize: 50000,

  epsilonStart: 0.5,
  epsilonEnd: 0.05,  // Keep some exploration
  epsilonDecaySteps: 150000,

  targetUpdateFreq: 200,  // Update target network less frequently
}

export class DQNAgent {
  private config: DQNConfig
  private policyNetwork: NeuralNetwork
  private targetNetwork: NeuralNetwork
  private replayBuffer: ReplayBuffer

  // Training state
  private steps: number = 0
  private epsilon: number
  private autoDecayEnabled: boolean = true
  private decayStartEpsilon: number
  private decayStartStep: number = 0

  // Metrics
  private lastLoss: number = 0
  private lastQValues: number[] = [0, 0]

  constructor(config: Partial<DQNConfig> = {}) {
    this.config = { ...DefaultDQNConfig, ...config }
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart
    this.decayStartStep = 0
    this.replayBuffer = new ReplayBuffer(this.config.bufferSize)

    // Create networks
    this.policyNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.targetNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    // Copy weights to target
    this.targetNetwork.copyWeightsFrom(this.policyNetwork)

    console.log('[DQNAgent] Created with custom NeuralNetwork')
    console.log('[DQNAgent] Layer sizes:', this.policyNetwork.getLayerSizes())
    
    // Test prediction
    const testInput = new Array(this.config.inputDim).fill(0.5)
    const testOutput = this.policyNetwork.predict(testInput)
    console.log('[DQNAgent] Test prediction:', testOutput)
  }

  /**
   * Select action using epsilon-greedy policy
   */
  act(state: number[], training: boolean = true): number {
    if (training) {
      this.steps++
      if (this.autoDecayEnabled) {
        this.updateEpsilon()
      }
    }

    // Epsilon-greedy
    if (training && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.config.actionDim)
    }

    // Greedy action
    this.lastQValues = this.policyNetwork.predict(state)
    return this.lastQValues[0] > this.lastQValues[1] ? 0 : 1
  }

  /**
   * Store transition in replay buffer
   */
  remember(transition: Transition): void {
    this.replayBuffer.add(transition)
  }

  /**
   * Train on a batch from replay buffer
   * Returns true if training happened
   */
  replay(): boolean {
    if (!this.replayBuffer.canSample(this.config.batchSize)) {
      return false
    }

    const batch = this.replayBuffer.sample(this.config.batchSize)
    this.lastLoss = this.trainOnBatch(batch)

    // Update target network periodically
    if (this.steps % this.config.targetUpdateFreq === 0) {
      this.targetNetwork.copyWeightsFrom(this.policyNetwork)
    }

    return true
  }

  /**
   * Train on a batch of transitions
   */
  private trainOnBatch(batch: Transition[]): number {
    const states: number[][] = []
    const actions: number[] = []
    const targets: number[] = []

    for (const t of batch) {
      states.push(t.state)
      actions.push(t.action)

      // Compute target Q-value
      const nextQValues = this.targetNetwork.predict(t.nextState)
      const maxNextQ = Math.max(...nextQValues)
      const target = t.reward + (t.done ? 0 : this.config.gamma * maxNextQ)
      targets.push(target)
    }

    return this.policyNetwork.trainBatch(states, actions, targets)
  }

  /**
   * Update epsilon based on decay schedule
   */
  private updateEpsilon(): void {
    const stepsSinceDecayStart = this.steps - this.decayStartStep
    const frac = Math.min(1.0, stepsSinceDecayStart / this.config.epsilonDecaySteps)
    this.epsilon =
      this.decayStartEpsilon +
      frac * (this.config.epsilonEnd - this.decayStartEpsilon)
  }

  // ===== Getters and Setters =====

  getEpsilon(): number {
    return this.epsilon
  }

  setEpsilon(value: number): void {
    this.epsilon = Math.max(0, Math.min(1, value))
  }

  getAutoDecay(): boolean {
    return this.autoDecayEnabled
  }

  setAutoDecay(enabled: boolean): void {
    if (enabled && !this.autoDecayEnabled) {
      this.decayStartEpsilon = this.epsilon
      this.decayStartStep = this.steps
    }
    this.autoDecayEnabled = enabled
  }

  getLearningRate(): number {
    return this.config.learningRate
  }

  setLearningRate(lr: number): void {
    this.config.learningRate = lr
    this.policyNetwork.setLearningRate(lr)
  }

  getGamma(): number {
    return this.config.gamma
  }

  setGamma(value: number): void {
    this.config.gamma = Math.max(0, Math.min(1, value))
  }

  getSteps(): number {
    return this.steps
  }

  getLastLoss(): number {
    return this.lastLoss
  }

  getLastQValues(): number[] {
    return this.lastQValues
  }

  getBufferSize(): number {
    return this.replayBuffer.size()
  }

  /**
   * Get activations for visualization (simplified - no weights)
   */
  getNetworkVisualization(state: number[]): {
    activations: number[][]
    qValues: number[]
    selectedAction: number
  } {
    // Run forward pass to get Q-values and activations
    const qValues = this.policyNetwork.predict(state)
    const activations = this.policyNetwork.getActivations()
    const selectedAction = qValues[0] > qValues[1] ? 0 : 1

    return {
      activations,
      qValues,
      selectedAction,
    }
  }

  /**
   * Reset training state
   */
  reset(): void {
    this.steps = 0
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart
    this.decayStartStep = 0
    this.lastLoss = 0
    this.replayBuffer.clear()

    // Reinitialize networks
    this.policyNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.targetNetwork = createDQNNetwork(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.targetNetwork.copyWeightsFrom(this.policyNetwork)
  }

  /**
   * Save model weights
   */
  save(): { weights: number[][][], biases: number[][] } {
    return this.policyNetwork.toJSON()
  }

  /**
   * Load model weights
   */
  load(data: { weights: number[][][], biases: number[][] }): void {
    this.policyNetwork.loadJSON(data)
    this.targetNetwork.copyWeightsFrom(this.policyNetwork)
  }
}
