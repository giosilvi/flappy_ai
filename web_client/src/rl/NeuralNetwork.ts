/**
 * Neural Network implementation with Adam optimizer
 * Pure TypeScript - no external dependencies
 */

export interface LayerConfig {
  inputSize: number
  outputSize: number
  activation: 'relu' | 'linear'
}

export interface NetworkConfig {
  layers: LayerConfig[]
  learningRate: number
}

interface AdamState {
  // First moment (mean of gradients)
  mWeights: number[][][]
  mBiases: number[][]
  // Second moment (variance of gradients)
  vWeights: number[][][]
  vBiases: number[][]
  // Timestep
  t: number
}

interface Layer {
  weights: number[][]  // [inputSize][outputSize]
  biases: number[]     // [outputSize]
  activation: 'relu' | 'linear'
  // For backprop
  lastInput?: number[]
  lastOutput?: number[]
  lastPreActivation?: number[]
}

export class NeuralNetwork {
  private layers: Layer[] = []
  private learningRate: number
  private adam: AdamState

  // Adam hyperparameters
  private static readonly BETA1 = 0.9      // Exponential decay rate for first moment
  private static readonly BETA2 = 0.999    // Exponential decay rate for second moment
  private static readonly EPSILON = 1e-8   // Small constant for numerical stability
  private static readonly GRAD_CLIP = 5.0  // Gradient clipping threshold (same as Python)
  private static readonly WEIGHT_CLIP = 100.0 // Max weight magnitude

  constructor(config: NetworkConfig) {
    this.learningRate = config.learningRate
    
    // Initialize layers
    for (const layerConfig of config.layers) {
      this.layers.push({
        weights: this.initWeights(layerConfig.inputSize, layerConfig.outputSize),
        biases: new Array(layerConfig.outputSize).fill(0),
        activation: layerConfig.activation,
      })
    }

    // Initialize Adam state
    this.adam = this.initAdamState()
  }

  /**
   * Initialize Adam optimizer state (zeros for all moments)
   */
  private initAdamState(): AdamState {
    const mWeights: number[][][] = []
    const mBiases: number[][] = []
    const vWeights: number[][][] = []
    const vBiases: number[][] = []

    for (const layer of this.layers) {
      const inputSize = layer.weights.length
      const outputSize = layer.biases.length

      // Initialize m and v to zeros with same shape as weights/biases
      const mW: number[][] = []
      const vW: number[][] = []
      for (let i = 0; i < inputSize; i++) {
        mW[i] = new Array(outputSize).fill(0)
        vW[i] = new Array(outputSize).fill(0)
      }
      mWeights.push(mW)
      vWeights.push(vW)
      mBiases.push(new Array(outputSize).fill(0))
      vBiases.push(new Array(outputSize).fill(0))
    }

    return { mWeights, mBiases, vWeights, vBiases, t: 0 }
  }

  /**
   * Xavier/Glorot initialization (same as PyTorch default)
   */
  private initWeights(inputSize: number, outputSize: number): number[][] {
    const scale = Math.sqrt(2.0 / (inputSize + outputSize))
    const weights: number[][] = []
    
    for (let i = 0; i < inputSize; i++) {
      weights[i] = []
      for (let j = 0; j < outputSize; j++) {
        weights[i][j] = (Math.random() * 2 - 1) * scale
      }
    }
    
    return weights
  }

  /**
   * Forward pass - returns output
   */
  forward(input: number[]): number[] {
    let current = input

    // Check for NaN in input
    if (input.some(x => !Number.isFinite(x))) {
      console.warn('[NN] NaN/Inf detected in input, returning zeros')
      return new Array(this.layers[this.layers.length - 1].biases.length).fill(0)
    }

    for (const layer of this.layers) {
      layer.lastInput = [...current]
      
      // Matrix multiplication: output = input @ weights + biases
      const preActivation: number[] = []
      for (let j = 0; j < layer.biases.length; j++) {
        let sum = layer.biases[j]
        for (let i = 0; i < current.length; i++) {
          sum += current[i] * layer.weights[i][j]
        }
        // Clamp to prevent overflow
        preActivation[j] = Math.max(-1e6, Math.min(1e6, sum))
      }
      
      layer.lastPreActivation = preActivation
      
      // Apply activation
      const output = preActivation.map(x => 
        layer.activation === 'relu' ? Math.max(0, x) : x
      )
      
      layer.lastOutput = output
      current = output
    }

    // Final NaN check
    if (current.some(x => !Number.isFinite(x))) {
      console.warn('[NN] NaN/Inf detected in output, resetting weights')
      this.resetWeights()
      return new Array(current.length).fill(0)
    }

    return current
  }

  /**
   * Reset weights and Adam state if NaN detected
   */
  private resetWeights(): void {
    for (const layer of this.layers) {
      const inputSize = layer.weights.length
      const outputSize = layer.biases.length
      layer.weights = this.initWeights(inputSize, outputSize)
      layer.biases = new Array(outputSize).fill(0)
    }
    // Reset Adam state too
    this.adam = this.initAdamState()
  }

  /**
   * Predict Q-values for a state
   */
  predict(state: number[]): number[] {
    return this.forward(state)
  }

  /**
   * Train on a single sample using Adam optimizer
   * Uses Huber loss (smooth L1) with gradient clipping
   */
  trainStep(
    state: number[],
    action: number,
    target: number
  ): number {
    // Check for invalid target
    if (!Number.isFinite(target)) {
      console.warn('[NN] Invalid target value:', target)
      return 0
    }

    // Forward pass
    const qValues = this.forward(state)
    
    // Compute loss (only for the action taken)
    const predicted = qValues[action]
    const error = target - predicted
    
    // Skip if error is invalid
    if (!Number.isFinite(error)) {
      console.warn('[NN] Invalid error in training')
      return 0
    }
    
    // Huber loss (smooth L1)
    const loss = Math.abs(error) < 1 
      ? 0.5 * error * error 
      : Math.abs(error) - 0.5

    // Increment Adam timestep
    this.adam.t++

    // Backward pass
    // Gradient of Huber loss (clipped to [-1, 1])
    let gradOutput = Math.abs(error) < 1 ? -error : -Math.sign(error)
    
    // Only backprop through the action we took
    const outputGrad = new Array(qValues.length).fill(0)
    outputGrad[action] = gradOutput

    // Backprop through layers (reverse order)
    let currentGrad = outputGrad
    
    for (let l = this.layers.length - 1; l >= 0; l--) {
      const layer = this.layers[l]
      const input = layer.lastInput!
      const preAct = layer.lastPreActivation!
      
      // Gradient through activation
      const gradPreAct = currentGrad.map((g, i) => {
        if (layer.activation === 'relu') {
          return preAct[i] > 0 ? g : 0
        }
        return g // linear
      })
      
      // Clip gradients (like PyTorch grad_clip)
      const clippedGradPreAct = gradPreAct.map(g => 
        Math.max(-NeuralNetwork.GRAD_CLIP, Math.min(NeuralNetwork.GRAD_CLIP, g))
      )
      
      // Compute input gradient for next layer BEFORE updating weights
      const inputGrad = new Array(input.length).fill(0)
      for (let i = 0; i < input.length; i++) {
        for (let j = 0; j < layer.biases.length; j++) {
          inputGrad[i] += layer.weights[i][j] * clippedGradPreAct[j]
        }
      }

      // Apply Adam update for biases
      for (let j = 0; j < layer.biases.length; j++) {
        const g = clippedGradPreAct[j]
        
        // Update biased first moment estimate
        this.adam.mBiases[l][j] = NeuralNetwork.BETA1 * this.adam.mBiases[l][j] + (1 - NeuralNetwork.BETA1) * g
        // Update biased second moment estimate
        this.adam.vBiases[l][j] = NeuralNetwork.BETA2 * this.adam.vBiases[l][j] + (1 - NeuralNetwork.BETA2) * g * g
        
        // Bias correction
        const mHat = this.adam.mBiases[l][j] / (1 - Math.pow(NeuralNetwork.BETA1, this.adam.t))
        const vHat = this.adam.vBiases[l][j] / (1 - Math.pow(NeuralNetwork.BETA2, this.adam.t))
        
        // Update bias
        layer.biases[j] -= this.learningRate * mHat / (Math.sqrt(vHat) + NeuralNetwork.EPSILON)
        
        // Clip bias
        layer.biases[j] = Math.max(-NeuralNetwork.WEIGHT_CLIP, Math.min(NeuralNetwork.WEIGHT_CLIP, layer.biases[j]))
      }
      
      // Apply Adam update for weights
      for (let i = 0; i < input.length; i++) {
        for (let j = 0; j < layer.biases.length; j++) {
          const g = input[i] * clippedGradPreAct[j]
          
          // Update biased first moment estimate
          this.adam.mWeights[l][i][j] = NeuralNetwork.BETA1 * this.adam.mWeights[l][i][j] + (1 - NeuralNetwork.BETA1) * g
          // Update biased second moment estimate
          this.adam.vWeights[l][i][j] = NeuralNetwork.BETA2 * this.adam.vWeights[l][i][j] + (1 - NeuralNetwork.BETA2) * g * g
          
          // Bias correction
          const mHat = this.adam.mWeights[l][i][j] / (1 - Math.pow(NeuralNetwork.BETA1, this.adam.t))
          const vHat = this.adam.vWeights[l][i][j] / (1 - Math.pow(NeuralNetwork.BETA2, this.adam.t))
          
          // Update weight
          layer.weights[i][j] -= this.learningRate * mHat / (Math.sqrt(vHat) + NeuralNetwork.EPSILON)
          
          // Clip weight
          layer.weights[i][j] = Math.max(-NeuralNetwork.WEIGHT_CLIP, Math.min(NeuralNetwork.WEIGHT_CLIP, layer.weights[i][j]))
        }
      }
      
      // Clip input gradient for next layer
      currentGrad = inputGrad.map(g => 
        Math.max(-NeuralNetwork.GRAD_CLIP, Math.min(NeuralNetwork.GRAD_CLIP, g))
      )
    }

    return loss
  }

  /**
   * Train on a batch of samples
   */
  trainBatch(
    states: number[][],
    actions: number[],
    targets: number[]
  ): number {
    let totalLoss = 0
    
    for (let i = 0; i < states.length; i++) {
      totalLoss += this.trainStep(states[i], actions[i], targets[i])
    }
    
    return totalLoss / states.length
  }

  /**
   * Get all weights for visualization
   */
  getWeights(): number[][][] {
    return this.layers.map(l => l.weights)
  }

  /**
   * Get all biases
   */
  getBiases(): number[][] {
    return this.layers.map(l => l.biases)
  }

  /**
   * Get activations from last forward pass
   */
  getActivations(): number[][] {
    const activations: number[][] = []
    
    if (this.layers[0].lastInput) {
      activations.push(this.layers[0].lastInput)
    }
    
    for (const layer of this.layers) {
      if (layer.lastOutput) {
        activations.push(layer.lastOutput)
      }
    }
    
    return activations
  }

  /**
   * Get layer info for visualization
   */
  getLayerSizes(): number[] {
    const sizes: number[] = []
    
    if (this.layers.length > 0) {
      sizes.push(this.layers[0].weights.length) // input size
    }
    
    for (const layer of this.layers) {
      sizes.push(layer.biases.length)
    }
    
    return sizes
  }

  /**
   * Copy weights from another network (for target network updates)
   * Note: Does NOT copy Adam state - target network doesn't train
   */
  copyWeightsFrom(source: NeuralNetwork): void {
    const sourceWeights = source.getWeights()
    const sourceBiases = source.getBiases()
    
    for (let l = 0; l < this.layers.length; l++) {
      // Deep copy weights
      for (let i = 0; i < this.layers[l].weights.length; i++) {
        for (let j = 0; j < this.layers[l].weights[i].length; j++) {
          this.layers[l].weights[i][j] = sourceWeights[l][i][j]
        }
      }
      
      // Deep copy biases
      for (let j = 0; j < this.layers[l].biases.length; j++) {
        this.layers[l].biases[j] = sourceBiases[l][j]
      }
    }
  }

  /**
   * Set learning rate
   */
  setLearningRate(lr: number): void {
    this.learningRate = lr
  }

  /**
   * Get current learning rate
   */
  getLearningRate(): number {
    return this.learningRate
  }

  /**
   * Serialize weights to JSON (for checkpoints)
   */
  toJSON(): { weights: number[][][], biases: number[][] } {
    return {
      // Return deep copies so callers can't mutate internal state
      weights: this.layers.map(layer => layer.weights.map(row => [...row])),
      biases: this.layers.map(layer => [...layer.biases]),
    }
  }

  /**
   * Load weights from JSON
   * Note: Resets Adam state since we're loading pretrained weights
   */
  loadJSON(data: { weights: number[][][], biases: number[][] }): void {
    for (let l = 0; l < this.layers.length; l++) {
      // Deep copy to avoid shared references between networks
      this.layers[l].weights = data.weights[l].map(row => [...row])
      this.layers[l].biases = [...data.biases[l]]
    }
    // Reset Adam state when loading new weights
    this.adam = this.initAdamState()
  }
}

/**
 * Create a DQN-style network
 */
export function createDQNNetwork(
  inputDim: number,
  hiddenLayers: number[],
  outputDim: number,
  learningRate: number
): NeuralNetwork {
  const layers: LayerConfig[] = []
  
  // First hidden layer
  layers.push({
    inputSize: inputDim,
    outputSize: hiddenLayers[0],
    activation: 'relu',
  })
  
  // Additional hidden layers
  for (let i = 1; i < hiddenLayers.length; i++) {
    layers.push({
      inputSize: hiddenLayers[i - 1],
      outputSize: hiddenLayers[i],
      activation: 'relu',
    })
  }
  
  // Output layer
  layers.push({
    inputSize: hiddenLayers[hiddenLayers.length - 1],
    outputSize: outputDim,
    activation: 'linear',
  })
  
  return new NeuralNetwork({ layers, learningRate })
}
