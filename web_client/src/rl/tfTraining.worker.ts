/**
 * TensorFlow.js Training Worker
 * Runs DQN training in a separate thread with vectorized environments
 */

import { MAX_VISUALIZED_INSTANCES } from '../games/flappy/VectorizedEnv'
import { DefaultRewardConfig as FlappyDefaultRewardConfig } from '../games/flappy/config'
import type { BaseGameState, BaseRewardConfig, IVectorizedEnv } from './IVectorizedEnv'
import { getGame, DEFAULT_GAME_ID } from '../games'
import { TFDQNAgent, type TFDQNConfig, DefaultTFDQNConfig } from './TFDQNAgent'
import { ReplayBuffer } from './ReplayBuffer'
import { 
  type TrainingMetrics, 
  type AutoEvalResult, 
  type WeightHealthMetrics,
  MetricsCollector,
} from './types'
import { initBestBackend, type BackendType } from './backendUtils'

// ===== Message Types =====

type WorkerMessage =
  | { type: 'init'; config: Partial<TFDQNConfig>; numEnvs: number; backend: BackendType | 'auto'; gameId?: string }
  | { type: 'setNumEnvs'; count: number }
  | { type: 'startTraining'; visualize: boolean }
  | { type: 'stopTraining' }
  | { type: 'startEval'; numEnvs: number; autoRestart: boolean }
  | { type: 'stopEval' }
  | { type: 'setFrameLimit'; enabled: boolean }
  | { type: 'requestWeights' }
  | { type: 'setWeights'; data: { layerWeights: number[][][] } }
  | { type: 'setEpsilon'; value: number }
  | { type: 'setAutoDecay'; enabled: boolean }
  | { type: 'setEpsilonDecaySteps'; steps: number }
  | { type: 'setLearningRate'; value: number }
  | { type: 'setLRScheduler'; enabled: boolean }
  | { type: 'setGamma'; value: number }
  | { type: 'setRewardConfig'; config: Partial<Record<string, number>> }
  | { type: 'reset' }
  | { type: 'setAutoEval'; enabled: boolean; trials?: number; interval?: number }

type WorkerResponse =
  | { type: 'ready'; backend: BackendType }
  | { type: 'metrics'; data: TrainingMetrics }
  | { type: 'gameStates'; states: BaseGameState[]; rewards?: number[]; cumulativeRewards?: number[] }
  | { type: 'weights'; data: { layerWeights: number[][][] } }
  | { type: 'autoEvalResult'; result: AutoEvalResult }
  | { type: 'weightHealth'; data: WeightHealthMetrics }
  | { type: 'episodeEnd'; score: number; reward: number; length: number; envIndex: number }
  | { type: 'network'; data: { input: number[]; qValues: number[]; selectedAction: number } }
  | { type: 'error'; message: string }

// ===== Worker State =====

let agent: TFDQNAgent | null = null
let env: IVectorizedEnv<BaseGameState, BaseRewardConfig> | null = null
let buffer: ReplayBuffer | null = null
let metricsCollector: MetricsCollector | null = null
let config: TFDQNConfig = { ...DefaultTFDQNConfig }
let rewardConfig: Record<string, number> = { ...FlappyDefaultRewardConfig }
let currentBackend: BackendType = 'cpu'
let currentGameId: string = DEFAULT_GAME_ID

// Training state
let isTraining = false
let isEval = false
let visualize = false
let numEnvs = 1
let autoRestartEval = false
let frameLimitEnabled = false
let lastFrameTime = 0
let lastTrainingNumEnvs: number | null = null
let ranEvalSinceLastTraining = false  // Track if eval ran since last training (to force env reset)
const FRAME_INTERVAL_MS = 1000 / 30

// Auto-eval state
let autoEvalEnabled = true  // Enabled by default
let autoEvalInterval = 5000  // Default: run auto-eval every 5000 episodes
let autoEvalTrials = 64      // Number of parallel eval instances (max 64)
let isAutoEvalRunning = false
let lastAutoEvalEpisode = 0
let savedEpsilonBeforeAutoEval = 0.3
let savedNumEnvsBeforeAutoEval = 1  // Saved training env size

// Timing / scaling bases
const BASE_WARMUP_SIZE = 10000  // Fixed warmup size (no scaling)
const MAX_BUFFER_SIZE = 1_000_000
const TARGET_SCALE_DIVISOR = 32
let baseEpsilonDecaySteps = DefaultTFDQNConfig.epsilonDecaySteps
let baseBufferSize = DefaultTFDQNConfig.bufferSize
let baseTargetUpdateFreq = DefaultTFDQNConfig.targetUpdateFreq
let baseLearningRate = DefaultTFDQNConfig.learningRate
let warmupSize = BASE_WARMUP_SIZE
let bufferCapacity = DefaultTFDQNConfig.bufferSize

// Timing
let lastMetricsTime = 0
let lastStatesTime = 0
let lastNetworkVizTime = 0
let previousWeights: number[][][] | null = null
const METRICS_INTERVAL = 500  // Emit metrics every 500ms
const STATES_INTERVAL = 33    // Emit states at ~30fps for visualization
const NETWORK_VIZ_INTERVAL = 33  // Emit network viz at ~30fps
const TRAIN_FREQ = 4          // Train every N steps
const BATCH_SIZE = 64         // Training batch size

function applyScaling(currentNumEnvs: number): void {
  const N = Math.max(1, currentNumEnvs)

  // Keep warmup at constant 10k (no scaling with parallel instances)
  warmupSize = BASE_WARMUP_SIZE
  // Scale buffer capacity with number of envs
  const newBufferCapacity = Math.min(baseBufferSize * N, MAX_BUFFER_SIZE)

  // Scale epsilon decay
  config.epsilonDecaySteps = Math.max(1, Math.round(baseEpsilonDecaySteps * N))

  // Scale target update freq and LR to reduce instability at high env counts
  const targetScale = Math.max(1, N / TARGET_SCALE_DIVISOR)
  config.targetUpdateFreq = Math.max(1, Math.round(baseTargetUpdateFreq * targetScale))
  config.learningRate = baseLearningRate / Math.sqrt(targetScale)

  // Apply to existing agent/buffer/collector if present
  if (agent) {
    agent.setEpsilonDecaySteps(config.epsilonDecaySteps)
    agent.setLearningRate(config.learningRate)
    // Adjust target update frequency directly on agent config
    ;(agent as unknown as { config: TFDQNConfig }).config.targetUpdateFreq = config.targetUpdateFreq
  }

  if (!buffer) {
    buffer = new ReplayBuffer(newBufferCapacity)
  } else if (bufferCapacity !== newBufferCapacity) {
    buffer.resize(newBufferCapacity)
  }
  bufferCapacity = newBufferCapacity

  if (metricsCollector) {
    metricsCollector = new MetricsCollector({
      emitIntervalMs: METRICS_INTERVAL,
      warmupSize: warmupSize,
    })
    // Re-wire episode callback for training metrics
    if (env) {
      env.clearOnEpisodeComplete()
      const collector = metricsCollector
      if (collector) {
        env.setOnEpisodeComplete((stats) => {
          collector.recordEpisode(stats.reward, stats.length, stats.score)
        })
      }
    }
  }
}

// ===== Initialization =====

async function initialize(
  agentConfig: Partial<TFDQNConfig>,
  initialNumEnvs: number,
  backend: BackendType | 'auto',
  gameId: string = DEFAULT_GAME_ID
): Promise<void> {
  try {
    // Initialize TensorFlow.js backend
    const backendInfo = await initBestBackend(backend)
    currentBackend = backendInfo.name
    console.log(`[TFWorker] TF.js initialized with backend: ${currentBackend}`)

    // Track current game
    currentGameId = gameId || DEFAULT_GAME_ID

    // Resolve game module FIRST to get input/output dimensions
    const resolvedGameId = currentGameId || DEFAULT_GAME_ID
    const gameModule = getGame(resolvedGameId) || getGame(DEFAULT_GAME_ID)
    if (!gameModule) {
      throw new Error(`Game module not found for id: ${resolvedGameId}`)
    }

    // Get game-specific dimensions from registry
    const { inputDim, outputDim } = gameModule.info

    // Store config with game-specific dimensions and bases for scaling
    config = {
      ...DefaultTFDQNConfig,
      inputDim,
      actionDim: outputDim,
      ...agentConfig,  // User config can still override if needed
    }
    numEnvs = initialNumEnvs
    baseEpsilonDecaySteps = config.epsilonDecaySteps
    baseBufferSize = config.bufferSize
    baseTargetUpdateFreq = config.targetUpdateFreq
    baseLearningRate = config.learningRate

    // Scale hyperparameters based on env count
    applyScaling(numEnvs)

    // Create agent with game-specific dimensions
    agent = new TFDQNAgent(config)

    // Initialize reward config from game defaults
    const defaultRewards = gameModule.defaultRewardConfig || FlappyDefaultRewardConfig
    rewardConfig = { ...defaultRewards }

    // Create vectorized environment via registry
    env = gameModule.createEnv(numEnvs, rewardConfig) as IVectorizedEnv<BaseGameState, BaseRewardConfig>

    // Create replay buffer
    buffer = new ReplayBuffer(bufferCapacity)

    // Create metrics collector
    metricsCollector = new MetricsCollector({
      emitIntervalMs: METRICS_INTERVAL,
      warmupSize: warmupSize,
    })

    // Initialize environment metrics
    metricsCollector.updateTrainingMetrics({
      numInstances: numEnvs,
      backend: currentBackend,
    })

    // Set up episode completion callback
    env.setOnEpisodeComplete((stats) => {
      metricsCollector?.recordEpisode(stats.reward, stats.length, stats.score)
    })

    // Send ready message
    self.postMessage({ type: 'ready', backend: currentBackend } as WorkerResponse)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    self.postMessage({ type: 'error', message: `Initialization failed: ${msg}` } as WorkerResponse)
  }
}

// ===== Training Loop =====

function runTrainingBatch(): void {
  if (!isTraining || !agent || !env || !buffer || !metricsCollector) return

  // Frame pacing when visualization limit is enabled
  if (visualize && frameLimitEnabled) {
    const now = performance.now()
    const elapsed = now - lastFrameTime
    if (elapsed < FRAME_INTERVAL_MS) {
      setTimeout(runTrainingBatch, FRAME_INTERVAL_MS - elapsed)
      return
    }
    lastFrameTime = now
  }

  const startTime = performance.now()
  const batchSteps = visualize && frameLimitEnabled ? 1 : 512  // Slow down when showing frames

  // Get current observations
  let observations = env.getObservations()

  for (let i = 0; i < batchSteps && isTraining; i++) {
    // Select actions (batched)
    const actions = agent.actBatch(observations, true)

    // Step environments
    const result = env.stepAll(actions, true)  // Auto-reset for training

    // Store transitions in replay buffer
    for (let j = 0; j < numEnvs; j++) {
      buffer.add({
        state: observations[j],
        action: actions[j],
        reward: result.rewards[j],
        nextState: result.observations[j],
        done: result.dones[j],
      })
    }

    // Update metrics and epsilon decay (env steps drive epsilon decay)
    metricsCollector.recordSteps(numEnvs)
    agent.recordEnvSteps(numEnvs)  // This updates epsilon based on total env steps

    // Train agent (after warmup, every TRAIN_FREQ steps)
    const totalSteps = metricsCollector.getMetrics().totalSteps
    const bufferSize = buffer.size()
    
    if (bufferSize >= warmupSize && totalSteps % TRAIN_FREQ === 0) {
      const batch = buffer.sample(BATCH_SIZE)
      const loss = agent.trainBatch(
        batch.map(t => t.state),
        batch.map(t => t.action),
        batch.map(t => t.reward),
        batch.map(t => t.nextState),
        batch.map(t => t.done)
      )
      metricsCollector.updateTrainingMetrics({ loss, bufferSize })
    }

    // Update epsilon in metrics
    metricsCollector.updateTrainingMetrics({ epsilon: agent.getEpsilon() })

    observations = result.observations

    // Check if we should run auto-eval (every autoEvalInterval episodes, after warmup)
    const currentEpisode = metricsCollector.getMetrics().episode
    if (autoEvalEnabled && 
        !isAutoEvalRunning && 
        bufferSize >= warmupSize && 
        currentEpisode > 0 && 
        currentEpisode - lastAutoEvalEpisode >= autoEvalInterval) {
      // Pause training and run auto-eval
      runAutoEval()
      return  // Exit batch loop, auto-eval will resume training when done
    }

    // Time limit per batch
    if (performance.now() - startTime > 50) break
  }

  // Emit metrics periodically
  const now = performance.now()
  if (now - lastMetricsTime >= METRICS_INTERVAL) {
    emitMetrics()
    emitWeightHealth()
    lastMetricsTime = now
  }

  // Emit game states for visualization (throttled)
  if (visualize && numEnvs <= MAX_VISUALIZED_INSTANCES && now - lastStatesTime >= STATES_INTERVAL) {
    emitGameStates()
    lastStatesTime = now
  }

  // Emit network viz for single instance (throttled to ~30fps)
  if (visualize && numEnvs === 1 && now - lastNetworkVizTime >= NETWORK_VIZ_INTERVAL) {
    emitNetworkViz()
    lastNetworkVizTime = now
  }

  // Continue training loop
  if (isTraining) {
    setTimeout(runTrainingBatch, 0)
  }
}

// ===== Evaluation Loop =====

function runEvalBatch(): void {
  if (!isEval || !agent || !env) return

  if (visualize && frameLimitEnabled) {
    const now = performance.now()
    const elapsed = now - lastFrameTime
    if (elapsed < FRAME_INTERVAL_MS) {
      setTimeout(runEvalBatch, FRAME_INTERVAL_MS - elapsed)
      return
    }
    lastFrameTime = now
  }

  const startTime = performance.now()
  const batchSteps = visualize && frameLimitEnabled ? 1 : 64  // Pace eval when visualizing

  let observations = env.getObservations()

  for (let i = 0; i < batchSteps && isEval; i++) {
    // Check if all environments are done (for manual eval)
    if (!autoRestartEval && env.countActive() === 0) {
      finishEval()
      return
    }

    // Select greedy actions (no exploration in eval)
    const actions = agent.actBatch(observations, false)

    // Step environments
    const result = env.stepAll(actions, autoRestartEval)
    observations = result.observations

    if (performance.now() - startTime > 30) break
  }

  // Emit game states for visualization (throttled)
  const now = performance.now()
  if (numEnvs <= MAX_VISUALIZED_INSTANCES && now - lastStatesTime >= STATES_INTERVAL) {
    emitGameStates()
    lastStatesTime = now
  }

  // Emit network viz for single instance (throttled to ~30fps)
  if (numEnvs === 1 && now - lastNetworkVizTime >= NETWORK_VIZ_INTERVAL) {
    emitNetworkViz()
    lastNetworkVizTime = now
  }

  // Continue eval loop
  if (isEval) {
    setTimeout(runEvalBatch, 0)
  }
}

function finishEval(): void {
  if (!env) return

  const wasAutoEval = isAutoEvalRunning
  
  isEval = false
  const scores = env.getScores()
  const result: AutoEvalResult = {
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    medianScore: scores.length > 0 
      ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)]
      : 0,
    scores: [...scores],
    episode: metricsCollector?.getMetrics().episode || 0,
    numTrials: scores.length,
    isAutoEval: wasAutoEval,
  }

  // If this was auto-eval, restore training state
  if (wasAutoEval) {
    finishAutoEval(result)
  } else {
    // Manual eval - just emit result
    self.postMessage({ type: 'autoEvalResult', result } as WorkerResponse)
  }
}

// ===== Auto-Evaluation =====

function runAutoEval(): void {
  if (!agent || !env || isAutoEvalRunning) return

  const currentEpisode = metricsCollector?.getMetrics().episode || 0
  console.log(`[TFWorker] Starting auto-eval at episode ${currentEpisode}`)
  
  isAutoEvalRunning = true
  isTraining = false  // Pause training
  
  // Save current epsilon and set to 0 (greedy)
  savedEpsilonBeforeAutoEval = agent.getEpsilon()
  agent.setEpsilon(0)
  
  // Save current env size and resize to 100 for auto-eval
  savedNumEnvsBeforeAutoEval = numEnvs
  const autoEvalNumEnvs = autoEvalTrials
  
  // Resize environment for auto-eval
  if (env) {
    env.resize(autoEvalNumEnvs)
    numEnvs = autoEvalNumEnvs
  }
  
  // Clear episode callback (auto-eval doesn't need individual episode tracking)
  env?.clearOnEpisodeComplete()
  
  // Reset all environments
  env?.resetAll()
  
  // Start eval loop (will run until all instances complete)
  isEval = true
  // Set visualization based on auto-eval instance count (respects frame limit if visualizable)
  visualize = autoEvalNumEnvs <= MAX_VISUALIZED_INSTANCES
  autoRestartEval = false  // Don't auto-restart, we want all to finish
  
  // Start eval batch loop - it will check for completion and call finishEval
  // finishEval will detect isAutoEvalRunning and handle restoration
  lastStatesTime = performance.now()
  lastFrameTime = performance.now()  // Reset frame timing for proper pacing
  runEvalBatch()
}

function finishAutoEval(result: AutoEvalResult): void {
  if (!env || !agent || !metricsCollector) return

  console.log('[TFWorker] Finishing auto-eval')
  
  isAutoEvalRunning = false
  
  // Restore epsilon
  agent.setEpsilon(savedEpsilonBeforeAutoEval)
  
  // Restore environment size
  env.resize(savedNumEnvsBeforeAutoEval)
  numEnvs = savedNumEnvsBeforeAutoEval
  
  // Restore training episode callback
  env.clearOnEpisodeComplete()
  const collector = metricsCollector
  if (collector) {
    env.setOnEpisodeComplete((stats) => {
      collector.recordEpisode(stats.reward, stats.length, stats.score)
    })
  }
  
  // Update last auto-eval episode
  lastAutoEvalEpisode = result.episode
  
  // Emit auto-eval result
  self.postMessage({ type: 'autoEvalResult', result } as WorkerResponse)
  
  // Resume training
  isTraining = true
  visualize = numEnvs <= MAX_VISUALIZED_INSTANCES
  env.resetAll()
  lastMetricsTime = performance.now()
  lastStatesTime = performance.now()
  runTrainingBatch()
}

// ===== Metric Emission =====

function emitMetrics(): void {
  if (!metricsCollector || !agent) return

  // Update LR scheduler based on average reward (may reduce LR if plateau detected)
  // Only update during training, not during auto-eval
  if (!isAutoEvalRunning) {
    const currentMetrics = metricsCollector.getMetrics()
    agent.updateLRScheduler(currentMetrics.avgReward)
  }

  metricsCollector.updateTrainingMetrics({
    epsilon: agent.getEpsilon(),  // Always include current epsilon
    learningRate: agent.getLearningRate(),
    bufferSize: buffer?.size() || 0,
    isAutoEval: isAutoEvalRunning,
    autoEvalTrial: isAutoEvalRunning ? env?.countActive() || 0 : undefined,
    autoEvalTrials: isAutoEvalRunning ? autoEvalTrials : undefined,
  })

  const metrics = metricsCollector.emit()
  self.postMessage({ type: 'metrics', data: metrics } as WorkerResponse)
}

function emitGameStates(): void {
  if (!env) return

  const statesWithRewards = env.getStatesWithRewards()
  const states = statesWithRewards.map(s => s.state)
  const rewards = statesWithRewards.map(s => s.reward)
  const cumulativeRewards = statesWithRewards.map(s => s.cumulativeReward)
  
  self.postMessage({ 
    type: 'gameStates', 
    states,
    rewards,
    cumulativeRewards,
  } as WorkerResponse)
}

function emitWeightHealth(): void {
  if (!agent) return

  const currentWeights = agent.getWeightsJSON().layerWeights

  if (!previousWeights) {
    previousWeights = currentWeights
    return
  }

  // Compute weight delta
  let deltaSum = 0
  let signSum = 0
  let count = 0

  for (let l = 0; l < currentWeights.length; l++) {
    const prevLayer = previousWeights[l]
    const newLayer = currentWeights[l]
    if (!prevLayer || !newLayer) continue

    for (let i = 0; i < newLayer.length; i++) {
      const prevRow = prevLayer[i]
      const newRow = newLayer[i]
      if (!prevRow || !newRow) continue

      for (let j = 0; j < newRow.length; j++) {
        const diff = newRow[j] - (prevRow[j] ?? 0)
        deltaSum += diff * diff
        signSum += Math.sign(diff)
        count++
      }
    }
  }

  const weightDelta = count > 0 ? Math.sqrt(deltaSum / count) : 0
  const avgGradSign = count > 0 ? signSum / count : 0

  previousWeights = currentWeights

  const health: WeightHealthMetrics = {
    weightDelta,
    avgGradSign,
    gradientNorm: 0,  // TODO: capture during training
    timestamp: performance.now(),
  }

  self.postMessage({ type: 'weightHealth', data: health } as WorkerResponse)
}

/**
 * Emit network visualization data (single instance only)
 * Sends input, Q-values, and selected action for NetworkViewer
 */
function emitNetworkViz(): void {
  if (!agent || !env || numEnvs !== 1) return

  // Get current observation from first (only) environment
  const observations = env.getObservations()
  if (!observations || observations.length === 0) return

  const state = observations[0]

  // Get fresh Q-values for current state (not cached, since actBatch doesn't update lastQValues)
  const qValues = agent.predictSingle(state)
  const greedyAction = qValues[0] > qValues[1] ? 0 : 1

  // Get current epsilon for exploration visualization
  const epsilon = agent.getEpsilon()
  
  // Simulate exploration decision (same logic as actBatch)
  // Note: This shows what *could* happen, not what actually happened
  const exploreRoll = Math.random()
  const isExploring = isTraining && exploreRoll < epsilon
  const selectedAction = isExploring 
    ? (Math.random() < 0.2 ? 1 : 0)  // Biased exploration
    : greedyAction

  // Send input, output, and exploration info
  self.postMessage({
    type: 'network',
    data: { 
      input: state, 
      qValues, 
      selectedAction,
      greedyAction,
      epsilon,
      isExploring,
    },
  } as WorkerResponse)
}

// ===== Message Handler =====

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  try {
    switch (msg.type) {
      case 'init':
        await initialize(msg.config, msg.numEnvs, msg.backend, msg.gameId || DEFAULT_GAME_ID)
        break

      case 'setNumEnvs':
        numEnvs = msg.count
        applyScaling(numEnvs)
        env?.resize(numEnvs)
        metricsCollector?.updateTrainingMetrics({ numInstances: numEnvs })
        // Update visualization based on new instance count (only during active training/eval)
        if (isTraining || isEval) {
          visualize = numEnvs <= MAX_VISUALIZED_INSTANCES
          lastFrameTime = performance.now()  // Reset frame timing for proper pacing
        }
        break

      case 'startTraining':
        if (!agent || !env || !buffer) {
          self.postMessage({ type: 'error', message: 'Not initialized' } as WorkerResponse)
          return
        }
        // Always reset env if: first time, instance count changed, OR eval ran since last training
        // (eval episodes shouldn't leak into training metrics - they use ε=0 and have higher scores)
        const shouldResetEnv = lastTrainingNumEnvs === null || numEnvs !== lastTrainingNumEnvs || ranEvalSinceLastTraining
        isTraining = true
        isEval = false
        visualize = msg.visualize && numEnvs <= MAX_VISUALIZED_INSTANCES
        lastFrameTime = performance.now()
        // Clear any eval-specific callbacks and restore training callback
        env.clearOnEpisodeComplete()
        // Restore episode completion callback for training metrics
        const collector = metricsCollector
        if (collector) {
          env.setOnEpisodeComplete((stats) => {
            collector.recordEpisode(stats.reward, stats.length, stats.score)
          })
        }
        if (shouldResetEnv) {
          env.resetAll()
        }
        lastMetricsTime = performance.now()
        lastStatesTime = performance.now()
        lastNetworkVizTime = 0  // Reset to trigger immediate emit
        lastTrainingNumEnvs = numEnvs
        ranEvalSinceLastTraining = false  // Clear flag now that training is starting
        runTrainingBatch()
        break

      case 'stopTraining':
        isTraining = false
        break

      case 'startEval':
        if (!agent) {
          self.postMessage({ type: 'error', message: 'Not initialized' } as WorkerResponse)
          return
        }
        isEval = true
        isTraining = false
        ranEvalSinceLastTraining = true  // Mark that eval ran (forces env reset on next training start)
        autoRestartEval = msg.autoRestart
        lastFrameTime = performance.now()

        // Resize env for eval if different from training
        if (msg.numEnvs !== numEnvs) {
          env?.resize(msg.numEnvs)
          numEnvs = msg.numEnvs
        }
        
        // Set visualization based on instance count (same logic as training)
        visualize = numEnvs <= MAX_VISUALIZED_INSTANCES
        
        // Set up episode completion callback for manual eval, or clear it for auto eval
        if (!autoRestartEval && env) {
          env.setOnEpisodeComplete((stats) => {
            self.postMessage({
              type: 'episodeEnd',
              score: stats.score,
              reward: stats.reward,
              length: stats.length,
              envIndex: stats.envIndex,
            } as WorkerResponse)
          })
        } else if (env) {
          // Clear callback for auto-restart eval
          env.clearOnEpisodeComplete()
        }
        
        env?.resetAll()
        lastStatesTime = performance.now()
        runEvalBatch()
        break

      case 'stopEval':
        isEval = false
        break

      case 'setFrameLimit':
        frameLimitEnabled = msg.enabled
        lastFrameTime = performance.now()
        break

      case 'requestWeights':
        if (agent) {
          const weights = agent.getWeightsJSON()
          self.postMessage({ type: 'weights', data: weights } as WorkerResponse)
        }
        break

      case 'setWeights':
        agent?.loadWeightsJSON(msg.data)
        break

      case 'setEpsilon':
        agent?.setEpsilon(msg.value)
        break

      case 'setAutoDecay':
        agent?.setAutoDecay(msg.enabled)
        break

      case 'setEpsilonDecaySteps':
        agent?.setEpsilonDecaySteps(msg.steps)
        break

      case 'setLearningRate':
        agent?.setLearningRate(msg.value)
        break

      case 'setLRScheduler':
        agent?.setLRScheduler(msg.enabled)
        break

      case 'setGamma':
        agent?.setGamma(msg.value)
        break

      case 'setRewardConfig':
        {
          // Filter out undefined values to satisfy Record<string, number>
          const sanitized: Record<string, number> = { ...rewardConfig }
          for (const [key, value] of Object.entries(msg.config)) {
            if (typeof value === 'number') {
              sanitized[key] = value
            }
          }
          rewardConfig = sanitized
          env?.setRewardConfig(sanitized)
        }
        break

      case 'setAutoEval':
        autoEvalEnabled = msg.enabled
        if (typeof msg.interval === 'number' && msg.interval > 0) {
          autoEvalInterval = msg.interval
        }
        if (typeof msg.trials === 'number' && msg.trials > 0) {
          autoEvalTrials = Math.min(msg.trials, 64)
        }
        lastAutoEvalEpisode = 0  // Reset counter so next check uses new interval
        console.log(
          `[TFWorker] Auto-eval ${autoEvalEnabled ? 'enabled' : 'disabled'} (every ${autoEvalInterval} eps, ${autoEvalTrials} trials)`
        )
        break

      case 'reset':
        isTraining = false
        isEval = false
        isAutoEvalRunning = false
        lastAutoEvalEpisode = 0
        agent?.reset()
        buffer?.clear()
        env?.resetAll()
        metricsCollector?.reset()
        previousWeights = null
        break
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    self.postMessage({ type: 'error', message: errorMsg } as WorkerResponse)
  }
}

// Export types for main thread
export type { WorkerMessage, WorkerResponse }

