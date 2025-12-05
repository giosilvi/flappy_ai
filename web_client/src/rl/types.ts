export interface TrainingMetrics {
  episode: number
  episodeReward: number
  episodeLength: number
  avgReward: number
  avgLength: number
  epsilon: number
  loss: number
  bufferSize: number
  stepsPerSecond: number
  totalSteps: number
  isWarmup: boolean  // True during warmup phase (collecting experience before training)
  learningRate: number  // Current learning rate (may change with scheduler)
  isAutoEval?: boolean  // True when running automatic evaluation
  autoEvalTrial?: number  // Current trial number (1-10)
  autoEvalTrials?: number  // Total trials in auto-eval
  numBirds?: number  // Number of parallel bird simulations (GPU mode)
  gpuBackend?: string  // GPU backend in use ('webgpu', 'webgl', or 'cpu')
  batchSize?: number  // Current batch size for training
  trainSteps?: number  // Total training steps (batch updates)
  // GPU mode reward history for charts
  recentRewards?: number[]  // Recent episode rewards (last 50-100)
  recentAvgRewards?: number[]  // Recent avg rewards for trend chart
}

export interface AutoEvalResult {
  avgScore: number
  maxScore: number
  minScore: number
  scores: number[]
  episode: number  // Episode at which eval was run
}
