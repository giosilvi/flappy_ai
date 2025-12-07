/**
 * RL module exports
 * 
 * TensorFlow.js-based implementation:
 * - UnifiedDQN: Main entry point for all DQN operations
 * - TFDQNAgent: TensorFlow.js-based DQN agent
 * - tfTraining.worker: Training worker with TF.js
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
  type IVectorizedEnv,
  type VectorizedStepResult,
  type EpisodeStats,
  type BaseGameState,
  type BaseRewardConfig,
  type EnvFactory,
} from './IVectorizedEnv'

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

// Network visualization type
export interface NetworkVisualization {
  activations: number[][]
  qValues: number[]
  selectedAction: number
}
