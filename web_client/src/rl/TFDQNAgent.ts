/**
 * TensorFlow.js-based DQN Agent
 * Unified implementation for training and evaluation with GPU/CPU support
 */

import * as tf from '@tensorflow/tfjs'

export interface TFDQNConfig {
  inputDim: number
  hiddenLayers: number[]
  actionDim: number
  learningRate: number
  gamma: number
  batchSize: number
  bufferSize: number
  epsilonStart: number
  epsilonEnd: number
  epsilonDecaySteps: number
  targetUpdateFreq: number
}

export const DefaultTFDQNConfig: TFDQNConfig = {
  inputDim: 6,
  hiddenLayers: [64, 64],
  actionDim: 2,
  learningRate: 0.0005,
  gamma: 0.99,
  batchSize: 64,
  bufferSize: 50000,
  epsilonStart: 0.5,
  epsilonEnd: 0.05,
  epsilonDecaySteps: 100000,
  targetUpdateFreq: 500,
}

/**
 * Create a DQN model using TensorFlow.js
 */
function createDQNModel(
  inputDim: number,
  hiddenLayers: number[],
  actionDim: number,
  learningRate: number
): tf.LayersModel {
  const model = tf.sequential()

  // Input layer + first hidden layer
  model.add(tf.layers.dense({
    inputShape: [inputDim],
    units: hiddenLayers[0],
    activation: 'relu',
    kernelInitializer: 'glorotUniform',
  }))

  // Additional hidden layers
  for (let i = 1; i < hiddenLayers.length; i++) {
    model.add(tf.layers.dense({
      units: hiddenLayers[i],
      activation: 'relu',
      kernelInitializer: 'glorotUniform',
    }))
  }

  // Output layer (linear activation for Q-values)
  model.add(tf.layers.dense({
    units: actionDim,
    activation: 'linear',
    kernelInitializer: 'glorotUniform',
  }))

  // Compile with Adam optimizer and Huber loss (smooth L1)
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: tf.losses.huberLoss,
  })

  return model
}

/**
 * TensorFlow.js DQN Agent
 * Supports batched inference for parallel environments
 */
export class TFDQNAgent {
  private config: TFDQNConfig
  private policyNetwork: tf.LayersModel
  private targetNetwork: tf.LayersModel
  private optimizer: tf.Optimizer

  // Training state
  private trainingSteps: number = 0
  private totalEnvSteps: number = 0  // Total environment steps (for epsilon decay)
  private epsilon: number
  private autoDecayEnabled: boolean = true
  private decayStartEpsilon: number
  private decayStartEnvStep: number = 0  // Env step when decay started

  // LR scheduler state
  private lrSchedulerEnabled: boolean = false
  private lrSchedulerBestAvgReward: number = -Infinity
  private lrSchedulerPatienceCounter: number = 0
  private readonly LR_SCHEDULER_PATIENCE: number = 20
  private readonly LR_DECAY_FACTOR: number = 0.5
  private readonly LR_MIN: number = 0.00001

  // Metrics
  private lastLoss: number = 0
  private lastQValues: number[] = [0, 0]

  constructor(config: Partial<TFDQNConfig> = {}) {
    this.config = { ...DefaultTFDQNConfig, ...config }
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart

    console.log(`[TFDQNAgent] Constructor: epsilonStart=${this.config.epsilonStart}, epsilonEnd=${this.config.epsilonEnd}, epsilonDecaySteps=${this.config.epsilonDecaySteps}`)

    // Create policy and target networks
    this.policyNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.targetNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    // Initialize target network with same weights as policy
    this.syncTargetNetwork()

    // Create optimizer for manual training
    this.optimizer = tf.train.adam(this.config.learningRate)

    console.log('[TFDQNAgent] Created with config:', this.config)
  }

  /**
   * Select action for a single state using epsilon-greedy policy
   */
  act(state: number[], training: boolean = true): number {
    // Note: epsilon is updated via recordEnvSteps() in the training loop, not here

    // Get Q-values
    const qValues = this.predictSingle(state)
    this.lastQValues = qValues

    // Epsilon-greedy exploration
    if (training && Math.random() < this.epsilon) {
      // Biased exploration: 20% flap, 80% no-flap (flapping has momentum)
      return Math.random() < 0.2 ? 1 : 0
    }

    // Greedy action
    return qValues[0] > qValues[1] ? 0 : 1
  }

  /**
   * Select actions for multiple states (batched inference)
   * Returns array of actions, one per state
   */
  actBatch(states: number[][], training: boolean = true): number[] {
    // Note: epsilon is updated via recordEnvSteps() in the training loop, not here

    // Batched prediction
    const qValuesBatch = this.predictBatch(states)

    // Select actions
    return qValuesBatch.map((qValues) => {
      if (training && Math.random() < this.epsilon) {
        return Math.random() < 0.2 ? 1 : 0
      }
      return qValues[0] > qValues[1] ? 0 : 1
    })
  }

  /**
   * Predict Q-values for a single state
   */
  predictSingle(state: number[]): number[] {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state], [1, this.config.inputDim])
      const prediction = this.policyNetwork.predict(stateTensor) as tf.Tensor
      return Array.from(prediction.dataSync())
    })
  }

  /**
   * Predict Q-values for a batch of states
   */
  predictBatch(states: number[][]): number[][] {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d(states, [states.length, this.config.inputDim])
      const prediction = this.policyNetwork.predict(stateTensor) as tf.Tensor
      const data = prediction.arraySync() as number[][]
      return data
    })
  }

  /**
   * Train on a batch of transitions
   * Returns the average loss
   */
  trainBatch(
    states: number[][],
    actions: number[],
    rewards: number[],
    nextStates: number[][],
    dones: boolean[]
  ): number {
    const batchSize = states.length

    const loss = tf.tidy(() => {
      // Convert to tensors
      const statesTensor = tf.tensor2d(states, [batchSize, this.config.inputDim])
      const nextStatesTensor = tf.tensor2d(nextStates, [batchSize, this.config.inputDim])
      const rewardsTensor = tf.tensor1d(rewards)
      const donesTensor = tf.tensor1d(dones.map(d => d ? 0 : 1)) // 0 if done, 1 otherwise

      // Compute target Q-values using target network
      const nextQValues = this.targetNetwork.predict(nextStatesTensor) as tf.Tensor
      const maxNextQ = nextQValues.max(1)
      const targets = rewardsTensor.add(
        donesTensor.mul(tf.scalar(this.config.gamma)).mul(maxNextQ)
      )

      // Get current Q-values for the taken actions
      const currentQValues = this.policyNetwork.predict(statesTensor) as tf.Tensor

      // Create target Q-values (only update the action taken)
      const actionIndices = tf.tensor1d(actions, 'int32')
      const batchIndices = tf.range(0, batchSize, 1, 'int32')
      const indices = tf.stack([batchIndices, actionIndices], 1)

      // Scatter update to create target tensor
      const targetQValues = currentQValues.clone()
      const targetValues = tf.tensorScatterUpdate(
        targetQValues,
        indices,
        targets
      )

      // Compute Huber loss
      const lossValue = tf.losses.huberLoss(targetValues, currentQValues)
      return lossValue.dataSync()[0]
    })

    // Perform gradient descent
    this.optimizerStep(states, actions, rewards, nextStates, dones)

    this.trainingSteps++
    this.lastLoss = loss

    // Update target network periodically
    if (this.trainingSteps % this.config.targetUpdateFreq === 0) {
      this.syncTargetNetwork()
    }

    return loss
  }

  /**
   * Perform optimizer step with gradient clipping
   */
  private optimizerStep(
    states: number[][],
    actions: number[],
    rewards: number[],
    nextStates: number[][],
    dones: boolean[]
  ): void {
    const batchSize = states.length

    tf.tidy(() => {
      const statesTensor = tf.tensor2d(states, [batchSize, this.config.inputDim])
      const nextStatesTensor = tf.tensor2d(nextStates, [batchSize, this.config.inputDim])
      const rewardsTensor = tf.tensor1d(rewards)
      const donesTensor = tf.tensor1d(dones.map(d => d ? 0 : 1))

      // Compute targets
      const nextQValues = this.targetNetwork.predict(nextStatesTensor) as tf.Tensor
      const maxNextQ = nextQValues.max(1)
      const targets = rewardsTensor.add(
        donesTensor.mul(tf.scalar(this.config.gamma)).mul(maxNextQ)
      )

      // Use optimizer.minimize to avoid gatherND gradients
      const actionTensor = tf.tensor1d(actions, 'int32')
      const lossFn = () => {
        const currentQValues = this.policyNetwork.predict(statesTensor) as tf.Tensor
        const actionOneHot = tf.oneHot(actionTensor, this.config.actionDim) as tf.Tensor2D
        const predictedQ = tf.sum(tf.mul(currentQValues, actionOneHot), 1)
        const lossTensor = tf.losses.huberLoss(targets, predictedQ) as tf.Scalar
        return lossTensor
      }

      this.optimizer.minimize(lossFn, /* returnCost */ false)
    })
  }

  /**
   * Copy weights from policy network to target network
   */
  syncTargetNetwork(): void {
    const policyWeights = this.policyNetwork.getWeights()
    this.targetNetwork.setWeights(policyWeights)
  }

  /**
   * Update epsilon based on decay schedule (uses total env steps for consistent decay across instance counts)
   */
  private updateEpsilon(): void {
    if (!this.autoDecayEnabled) return

    const stepsSinceDecayStart = this.totalEnvSteps - this.decayStartEnvStep
    const frac = Math.min(1.0, stepsSinceDecayStart / this.config.epsilonDecaySteps)
    const newEpsilon = this.decayStartEpsilon + frac * (this.config.epsilonEnd - this.decayStartEpsilon)
    
    this.epsilon = newEpsilon
  }

  /**
   * Record environment steps (call this from training loop)
   */
  recordEnvSteps(count: number): void {
    this.totalEnvSteps += count
    this.updateEpsilon()
  }

  /**
   * Get total environment steps
   */
  getTotalEnvSteps(): number {
    return this.totalEnvSteps
  }

  // ===== Getters and Setters =====

  getEpsilon(): number {
    return this.epsilon
  }

  setEpsilon(value: number): void {
    const newEpsilon = Math.max(0, Math.min(1, value))
    // If auto-decay is enabled and epsilon is being changed externally,
    // reset the decay anchors so decay continues from the new value
    // (prevents recalculation from overwriting the restored epsilon)
    if (this.autoDecayEnabled && newEpsilon !== this.epsilon) {
      this.decayStartEpsilon = newEpsilon
      this.decayStartEnvStep = this.totalEnvSteps
    }
    this.epsilon = newEpsilon
  }

  getAutoDecay(): boolean {
    return this.autoDecayEnabled
  }

  setAutoDecay(enabled: boolean): void {
    console.log(`[TFDQNAgent] setAutoDecay(${enabled}): was=${this.autoDecayEnabled}, totalEnvSteps=${this.totalEnvSteps}, currentEpsilon=${this.epsilon}`)
    if (enabled && !this.autoDecayEnabled) {
      this.decayStartEpsilon = this.epsilon
      this.decayStartEnvStep = this.totalEnvSteps
      console.log(`[TFDQNAgent] Reset decay: decayStartEpsilon=${this.decayStartEpsilon}, decayStartEnvStep=${this.decayStartEnvStep}`)
    }
    this.autoDecayEnabled = enabled
  }

  getEpsilonDecaySteps(): number {
    return this.config.epsilonDecaySteps
  }

  setEpsilonDecaySteps(steps: number): void {
    const newSteps = Math.max(1000, steps)
    // When decay steps change, reset the decay progress to start from current epsilon
    // This prevents epsilon from collapsing to minimum when reducing decay steps
    if (this.autoDecayEnabled && newSteps !== this.config.epsilonDecaySteps) {
      this.decayStartEpsilon = this.epsilon
      this.decayStartEnvStep = this.totalEnvSteps
    }
    this.config.epsilonDecaySteps = newSteps
  }

  getLearningRate(): number {
    return this.config.learningRate
  }

  setLearningRate(lr: number): void {
    this.config.learningRate = lr
    // Recreate optimizer with new learning rate
    this.optimizer = tf.train.adam(lr)
  }

  getLRSchedulerEnabled(): boolean {
    return this.lrSchedulerEnabled
  }

  setLRScheduler(enabled: boolean): void {
    this.lrSchedulerEnabled = enabled
    if (enabled) {
      // Reset scheduler state when enabled
      this.lrSchedulerBestAvgReward = -Infinity
      this.lrSchedulerPatienceCounter = 0
    }
  }

  /**
   * Update LR scheduler based on average reward (call periodically during training)
   * @returns true if learning rate was reduced
   */
  updateLRScheduler(avgReward: number): boolean {
    if (!this.lrSchedulerEnabled) return false

    if (avgReward > this.lrSchedulerBestAvgReward) {
      // Improvement - reset patience
      this.lrSchedulerBestAvgReward = avgReward
      this.lrSchedulerPatienceCounter = 0
      return false
    }

    // No improvement
    this.lrSchedulerPatienceCounter++

    if (this.lrSchedulerPatienceCounter >= this.LR_SCHEDULER_PATIENCE) {
      // Plateau detected - reduce learning rate
      const newLR = Math.max(this.LR_MIN, this.config.learningRate * this.LR_DECAY_FACTOR)
      if (newLR < this.config.learningRate) {
        console.log(`[TFDQNAgent] LR scheduler: reducing LR from ${this.config.learningRate} to ${newLR}`)
        this.setLearningRate(newLR)
        this.lrSchedulerPatienceCounter = 0
        return true
      }
    }

    return false
  }

  getGamma(): number {
    return this.config.gamma
  }

  setGamma(value: number): void {
    this.config.gamma = Math.max(0, Math.min(1, value))
  }

  getTrainingSteps(): number {
    return this.trainingSteps
  }

  getLastLoss(): number {
    return this.lastLoss
  }

  getLastQValues(): number[] {
    return this.lastQValues
  }

  getConfig(): TFDQNConfig {
    return { ...this.config }
  }

  /**
   * Save model weights to JSON format
   */
  async save(): Promise<{ weights: { layerWeights: number[][][] }; config: TFDQNConfig }> {
    return {
      weights: this.getWeightsJSON(),
      config: this.config,
    }
  }

  /**
   * Export weights as a serializable object for checkpoints
   */
  getWeightsJSON(): { layerWeights: number[][][] } {
    const weights = this.policyNetwork.getWeights()
    const layerWeights: number[][][] = []

    for (const w of weights) {
      const data = w.arraySync()
      if (Array.isArray(data)) {
        layerWeights.push(data as number[][])
      }
    }

    return { layerWeights }
  }

  /**
   * Load weights from a serializable object
   */
  loadWeightsJSON(data: { layerWeights: number[][][] }): void {
    const currentWeights = this.policyNetwork.getWeights()
    const newWeights: tf.Tensor[] = []

    let dataIdx = 0
    for (const w of currentWeights) {
      const shape = w.shape
      if (dataIdx < data.layerWeights.length) {
        newWeights.push(tf.tensor(data.layerWeights[dataIdx], shape))
        dataIdx++
      } else {
        newWeights.push(w.clone())
      }
    }

    this.policyNetwork.setWeights(newWeights)
    this.syncTargetNetwork()

    // Dispose old tensors
    newWeights.forEach(t => t.dispose())
  }

  /**
   * Reset the agent to initial state
   */
  reset(): void {
    this.trainingSteps = 0
    this.totalEnvSteps = 0
    this.epsilon = this.config.epsilonStart
    this.decayStartEpsilon = this.config.epsilonStart
    this.decayStartEnvStep = 0
    this.lastLoss = 0
    this.lastQValues = [0, 0]

    // Recreate networks
    this.policyNetwork.dispose()
    this.targetNetwork.dispose()

    this.policyNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.targetNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    )

    this.syncTargetNetwork()
  }

  /**
   * Dispose TensorFlow resources
   */
  dispose(): void {
    this.policyNetwork.dispose()
    this.targetNetwork.dispose()
  }
}

