/**
 * RL module exports
 * Uses custom NeuralNetwork with Web Worker for training
 * GPU support via TensorFlow.js (WebGPU/WebGL)
 */

export { ReplayBuffer, type Transition } from './ReplayBuffer'
export { NeuralNetwork, createDQNNetwork, type NetworkConfig } from './NeuralNetwork'

// Legacy DQNAgent (for reference/fallback)
export { DQNAgent } from './DQNAgent'

// Worker-based agent (CPU, recommended)
export { WorkerDQNAgent, DefaultDQNConfig, type DQNConfig } from './WorkerDQNAgent'

// GPU-accelerated agent with multi-bird support
export { GPUDQNAgent, DefaultGPUDQNConfig, checkGPUSupport, type GPUDQNConfig } from './GPUDQNAgent'
export { NeuralNetworkTF, createDQNNetworkTF, initTensorFlow, isWebGPUSupported } from './NeuralNetworkTF'

export { TrainingLoop, type TrainingCallbacks } from './TrainingLoop'
export { GPUTrainingLoop, type GPUTrainingCallbacks } from './GPUTrainingLoop'
export type { TrainingMetrics } from './types'

// Network visualization type (simplified - no weights)
export interface NetworkVisualization {
  activations: number[][]
  qValues: number[]
  selectedAction: number
}
