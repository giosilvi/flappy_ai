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
}

export interface AutoEvalResult {
  avgScore: number
  maxScore: number
  minScore: number
  scores: number[]
  episode: number  // Episode at which eval was run
}
