/**
 * TensorFlow.js Neural Network implementation
 * Uses WebGPU/WebGL backend for GPU acceleration
 * Same interface as NeuralNetwork.ts for interchangeability
 */

import * as tf from '@tensorflow/tfjs'
// Explicitly register WebGPU backend (when available in browser)
import '@tensorflow/tfjs-backend-webgpu'

export interface TFNetworkConfig {
  inputDim: number
  hiddenLayers: number[]
  outputDim: number
  learningRate: number
}

/**
 * Check if WebGPU is available and initialize TensorFlow.js with optimal backend
 */
export async function initTensorFlow(): Promise<{ backend: string; gpuAvailable: boolean }> {
  // Try WebGPU first (fastest), but only if navigator.gpu exists
  if ('gpu' in navigator) {
    try {
      await tf.setBackend('webgpu')
      await tf.ready()
      console.log('[TF] Using WebGPU backend')
      return { backend: 'webgpu', gpuAvailable: true }
    } catch (e) {
      console.log('[TF] WebGPU backend init failed, falling back to WebGL...', e)
    }
  } else {
    console.log('[TF] navigator.gpu not present, skipping WebGPU and trying WebGL...')
  }

  // Fall back to WebGL
  try {
    await tf.setBackend('webgl')
    await tf.ready()
    console.log('[TF] Using WebGL backend')
    return { backend: 'webgl', gpuAvailable: true }
  } catch (e) {
    console.log('[TF] WebGL not available, using CPU')
  }

  // Fall back to CPU
  await tf.setBackend('cpu')
  await tf.ready()
  console.log('[TF] Using CPU backend')
  return { backend: 'cpu', gpuAvailable: false }
}

/**
 * Check if GPU is available without initializing
 */
export function isWebGPUSupported(): boolean {
  return 'gpu' in navigator
}

export class NeuralNetworkTF {
  private model: tf.LayersModel
  private optimizer: tf.Optimizer
  private config: TFNetworkConfig
  private lastActivations: number[][] = []
  private trainStepCount: number = 0
  private static readonly GRAD_CLIP = 5.0

  constructor(config: TFNetworkConfig) {
    this.config = config
    this.model = this.buildModel()
    this.optimizer = tf.train.adam(config.learningRate, 0.9, 0.999, 1e-8)
  }

  private buildModel(): tf.LayersModel {
    const model = tf.sequential()

    // First hidden layer
    model.add(tf.layers.dense({
      inputShape: [this.config.inputDim],
      units: this.config.hiddenLayers[0],
      activation: 'relu',
      kernelInitializer: 'glorotNormal',
    }))

    // Additional hidden layers
    for (let i = 1; i < this.config.hiddenLayers.length; i++) {
      model.add(tf.layers.dense({
        units: this.config.hiddenLayers[i],
        activation: 'relu',
        kernelInitializer: 'glorotNormal',
      }))
    }

    // Output layer (linear activation for Q-values)
    model.add(tf.layers.dense({
      units: this.config.outputDim,
      activation: 'linear',
      kernelInitializer: 'glorotNormal',
    }))

    return model
  }

  /**
   * Forward pass for a single state - returns Q-values
   */
  predict(state: number[]): number[] {
    return tf.tidy(() => {
      const input = tf.tensor2d([state], [1, state.length])
      const output = this.model.predict(input) as tf.Tensor
      return Array.from(output.dataSync())
    })
  }

  /**
   * Batch forward pass - returns Q-values for multiple states
   * This is where GPU shines!
   */
  predictBatch(states: number[][]): number[][] {
    return tf.tidy(() => {
      const input = tf.tensor2d(states)
      const output = this.model.predict(input) as tf.Tensor
      const data = output.arraySync() as number[][]
      // Convert to pure JS arrays (not TypedArrays)
      return data.map(row => Array.from(row))
    })
  }

  /**
   * Get activations for visualization (simplified version)
   * Note: TF.js doesn't expose intermediate activations easily,
   * so we build a model that outputs all layer activations
   */
  getActivations(): number[][] {
    return this.lastActivations
  }

  /**
   * Forward pass that also captures activations for visualization
   */
  forwardWithActivations(state: number[]): number[] {
    return tf.tidy(() => {
      const input = tf.tensor2d([state], [1, state.length])
      
      // Store input as first activation
      this.lastActivations = [[...state]]
      
      // Get intermediate outputs by applying layers sequentially
      let current: tf.Tensor = input
      for (let i = 0; i < this.model.layers.length; i++) {
        current = this.model.layers[i].apply(current) as tf.Tensor
        this.lastActivations.push(Array.from(current.dataSync()))
      }
      
      return this.lastActivations[this.lastActivations.length - 1]
    })
  }

  /**
   * Train on a batch of transitions using Huber loss
   * Returns average loss
   */
  trainBatch(
    states: number[][],
    actions: number[],
    targets: number[]
  ): number {
    // Create tensors outside tidy so they persist through minimize()
    const statesTensor = tf.tensor2d(states)
    const targetsTensor = tf.tensor1d(targets)
    // One-hot encode actions for masking (supports gradients unlike gatherND)
    const actionMask = tf.oneHot(tf.tensor1d(actions, 'int32'), this.config.outputDim)
    
    let lossValue: number = 0
    
    try {
      const { value, grads } = tf.variableGrads(() => {
        const predictions = this.model.predict(statesTensor) as tf.Tensor2D
        const selectedQValues = predictions.mul(actionMask).sum(1)
        return tf.losses.huberLoss(targetsTensor, selectedQValues)
      })

      lossValue = value.dataSync()[0]

      const clippedGrads: Record<string, tf.Tensor> = {}
      for (const key of Object.keys(grads)) {
        clippedGrads[key] = tf.clipByValue(
          grads[key],
          -NeuralNetworkTF.GRAD_CLIP,
          NeuralNetworkTF.GRAD_CLIP
        )
      }

      this.optimizer.applyGradients(clippedGrads)

      value.dispose()
      for (const key of Object.keys(grads)) {
        grads[key].dispose()
        clippedGrads[key].dispose()
      }
    } finally {
      // Clean up tensors
      statesTensor.dispose()
      targetsTensor.dispose()
      actionMask.dispose()
    }

    this.trainStepCount++
    return lossValue
  }

  /**
   * Train on a single sample (for compatibility with NeuralNetwork.ts interface)
   */
  trainStep(state: number[], action: number, target: number): number {
    return this.trainBatch([state], [action], [target])
  }

  /**
   * Copy weights from another TF network (for target network updates)
   */
  copyWeightsFrom(source: NeuralNetworkTF): void {
    tf.tidy(() => {
      const sourceWeights = source.model.getWeights()
      const copiedWeights = sourceWeights.map(w => w.clone())
      this.model.setWeights(copiedWeights)
    })
  }

  /**
   * Set learning rate
   */
  setLearningRate(lr: number): void {
    this.config.learningRate = lr
    // TF.js Adam optimizer doesn't support changing LR directly,
    // so we create a new optimizer
    this.optimizer.dispose()
    this.optimizer = tf.train.adam(lr, 0.9, 0.999, 1e-8)
  }

  /**
   * Get current learning rate
   */
  getLearningRate(): number {
    return this.config.learningRate
  }

  /**
   * Get layer sizes for visualization
   */
  getLayerSizes(): number[] {
    const sizes: number[] = [this.config.inputDim]
    for (const layer of this.model.layers) {
      const outputShape = layer.outputShape as number[]
      sizes.push(outputShape[outputShape.length - 1])
    }
    return sizes
  }

  /**
   * Get weights for serialization (returns pure JS arrays, not TypedArrays)
   */
  getWeights(): number[][][] {
    const weights: number[][][] = []
    for (let i = 0; i < this.model.layers.length; i++) {
      const layerWeights = this.model.layers[i].getWeights()
      if (layerWeights.length > 0) {
        // First tensor is kernel (weights), second is bias
        // Use arraySync() and convert to pure JS arrays for serialization
        const kernelData = layerWeights[0].arraySync() as number[][]
        // Deep clone to ensure pure JS arrays (not TypedArrays)
        const kernel = kernelData.map(row => Array.from(row))
        weights.push(kernel)
      }
    }
    return weights
  }

  /**
   * Get biases for serialization (returns pure JS arrays, not TypedArrays)
   */
  getBiases(): number[][] {
    const biases: number[][] = []
    for (let i = 0; i < this.model.layers.length; i++) {
      const layerWeights = this.model.layers[i].getWeights()
      if (layerWeights.length > 1) {
        // Second tensor is bias
        const biasData = layerWeights[1].arraySync() as number[]
        // Convert to pure JS array for serialization
        const bias = Array.from(biasData)
        biases.push(bias)
      }
    }
    return biases
  }

  /**
   * Serialize to JSON (compatible with NeuralNetwork.ts format)
   * Uses JSON round-trip to ensure all data is serializable (no TypedArrays)
   */
  toJSON(): { weights: number[][][]; biases: number[][] } {
    const data = {
      weights: this.getWeights(),
      biases: this.getBiases(),
    }
    // Force conversion to pure JS objects (removes any TypedArray references)
    return JSON.parse(JSON.stringify(data))
  }

  /**
   * Load weights from JSON (compatible with NeuralNetwork.ts format)
   */
  loadJSON(data: { weights: number[][][]; biases: number[][] }): void {
    tf.tidy(() => {
      const newWeights: tf.Tensor[] = []
      for (let i = 0; i < data.weights.length; i++) {
        newWeights.push(tf.tensor2d(data.weights[i]))
        newWeights.push(tf.tensor1d(data.biases[i]))
      }
      this.model.setWeights(newWeights)
    })
  }

  /**
   * Dispose TensorFlow resources
   */
  dispose(): void {
    this.model.dispose()
    this.optimizer.dispose()
  }
}

/**
 * Create a DQN-style TF.js network
 */
export function createDQNNetworkTF(
  inputDim: number,
  hiddenLayers: number[],
  outputDim: number,
  learningRate: number
): NeuralNetworkTF {
  return new NeuralNetworkTF({
    inputDim,
    hiddenLayers,
    outputDim,
    learningRate,
  })
}

