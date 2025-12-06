/**
 * RL module exports
 * 
 * New TensorFlow.js-based implementation:
 * - UnifiedDQN: Main entry point for all DQN operations
 * - TFDQNAgent: TensorFlow.js-based DQN agent
 * - tfTraining.worker: Training worker with TF.js
 * 
 * Legacy (kept for backwards compatibility during transition):
 * - WorkerDQNAgent: Custom neural network agent
 * - TrainingLoop: Old training orchestration
 */

// ===== New TensorFlow.js Implementation =====
export { 
  UnifiedDQN, 
  VALID_INSTANCE_COUNTS, 
  MAX_VISUALIZED_INSTANCES,
  type UnifiedDQNMode,
  type UnifiedDQNCallbacks,
  type UnifiedDQNConfig,
  type ValidInstanceCount,
} from './UnifiedDQN'

export { 
  TFDQNAgent, 
  DefaultTFDQNConfig,
  type TFDQNConfig,
} from './TFDQNAgent'

export { 
  initBestBackend, 
  getCurrentBackendInfo, 
  isBackendAvailable, 
  getAvailableBackends,
  cleanupTensors,
  getMemoryInfo,
  type BackendType,
  type BackendInfo,
} from './backendUtils'

// ===== Shared Components =====
export { ReplayBuffer, type Transition } from './ReplayBuffer'

export { 
  type TrainingMetrics, 
  type AutoEvalResult, 
  type WeightHealthMetrics,
  type StatsSnapshot,
  type EpisodeCompleteEvent,
  type MetricsConfig,
  MetricsCollector,
  DefaultTrainingMetrics,
  DefaultMetricsConfig,
} from './types'

// ===== Legacy Implementation (for backwards compatibility) =====
export { NeuralNetwork, createDQNNetwork, createNetworkPair, type NetworkConfig } from './NeuralNetwork'
export { WorkerDQNAgent, DefaultDQNConfig, type DQNConfig } from './WorkerDQNAgent'
export { TrainingLoop, type TrainingCallbacks } from './TrainingLoop'

// Network visualization type (used by both old and new implementations)
export interface NetworkVisualization {
  activations: number[][]
  qValues: number[]
  selectedAction: number
}
