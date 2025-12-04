/**
 * RL module exports
 * Uses custom NeuralNetwork with Web Worker for training
 */

export { ReplayBuffer, type Transition } from './ReplayBuffer'
export { NeuralNetwork, createDQNNetwork, createNetworkPair, type NetworkConfig } from './NeuralNetwork'

// Worker-based agent
export { WorkerDQNAgent, DefaultDQNConfig, type DQNConfig } from './WorkerDQNAgent'

export { TrainingLoop, type TrainingCallbacks } from './TrainingLoop'
export type { TrainingMetrics, AutoEvalResult } from './types'

// Network visualization type (simplified - no weights)
export interface NetworkVisualization {
  activations: number[][]
  qValues: number[]
  selectedAction: number
}
