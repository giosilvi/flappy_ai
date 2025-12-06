<template>
  <div class="app-container">
    <header class="app-header">
      <h1 class="app-title text-display">
        <span class="text-primary glow">FLAPPY</span>
        <span class="text-accent">AI</span>
      </h1>
      <div class="header-right">
        <div class="mode-indicator">
          <span v-if="mode === 'idle'" class="badge badge-idle">Ready</span>
          <span v-else-if="mode === 'configuring'" class="badge badge-configuring">Configuring</span>
          <span
            v-else-if="mode === 'training'"
            class="badge badge-training"
            :class="{ 'animate-pulse': !isPaused && !isAutoEval }"
          >
            {{ isAutoEval ? `Auto-eval ${autoEvalTrial}/${autoEvalTrials}` : (isPaused ? 'Paused' : 'Training') }}
          </span>
          <span v-else-if="mode === 'eval'" class="badge badge-eval">Evaluating</span>
          <span v-else-if="mode === 'manual'" class="badge badge-manual">Manual Control</span>
        </div>

        <!-- Checkpoint controls (top of page) -->
        <div v-if="mode === 'configuring' || mode === 'training' || mode === 'eval'" class="checkpoint-controls">
          <button 
            v-if="mode === 'training' || mode === 'eval'" 
            class="btn btn-secondary btn-small" 
            @click="saveCheckpoint"
          >
            💾 Save Checkpoint
          </button>
          <button class="btn btn-secondary btn-small" @click="triggerCheckpointLoad">
            📂 Load Checkpoint
          </button>
          <input
            ref="checkpointInput"
            type="file"
            accept="application/json"
            class="checkpoint-input"
            @change="onCheckpointFileSelected"
          />
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- Left Panel: Controls + Neural Network -->
      <aside class="left-panel" v-if="mode === 'configuring' || mode === 'training' || mode === 'eval'">
        <!-- Controls panel shown during configuring, training, and eval -->
        <ControlPanel
          :epsilon="epsilon"
          :learningRate="learningRate"
          :epsilonDecaySteps="epsilonDecaySteps"
          :passPipeReward="passPipeReward"
          :deathPenalty="deathPenalty"
          :stepPenalty="stepPenalty"
          :centerReward="centerReward"
          :numInstances="numInstances"
          :backend="backend"
        :availableBackends="availableBackends"
          :frameLimit30="frameLimit30"
          :autoDecay="autoDecay"
          :lrScheduler="lrScheduler"
          :isPaused="isPaused"
          :currentMode="mode"
          :evalStats="evalStats"
          :evalComplete="evalComplete"
          :hasModel="hasModel"
          @update:epsilon="updateEpsilon"
          @update:learningRate="updateLearningRate"
          @update:epsilonDecaySteps="updateEpsilonDecaySteps"
          @update:passPipeReward="updatePassPipeReward"
          @update:deathPenalty="updateDeathPenalty"
          @update:stepPenalty="updateStepPenalty"
          @update:centerReward="updateCenterReward"
          @update:frameLimit30="updateFrameLimit"
          @update:numInstances="updateNumInstances"
          @update:autoDecay="updateAutoDecay"
          @update:lrScheduler="updateLRScheduler"
          @update:isPaused="updatePaused"
          @update:mode="changeMode"
        @cycle-backend="cycleBackend"
          @reset="resetTraining"
          @restartEval="restartEval"
        />

        <!-- Neural network visualization (only for low instance counts) -->
        <NetworkViewer
          v-if="numInstances <= 16"
          :activations="networkActivations"
          :qValues="qValues"
          :selectedAction="selectedAction"
          :greedyAction="greedyAction"
          :epsilon="networkEpsilon"
          :isExploring="isExploring"
          :hiddenLayers="hiddenLayersConfig"
          :weightHealth="weightHealth"
          :fastMode="numInstances > 1"
          @open-detail="showNetworkDetail = true"
        />
      </aside>

      <div class="game-area">
        <GameCanvas
          ref="gameCanvas"
          :mode="mode"
          :numInstances="numInstances"
          :isPaused="isPaused"
          :hiddenLayersConfig="hiddenLayersConfig"
          :frameLimit30="frameLimit30"
          :epsilon="epsilon"
          :learningRate="learningRate"
          :autoDecay="autoDecay"
          :epsilonDecaySteps="epsilonDecaySteps"
          @score-update="handleScoreUpdate"
          @episode-end="handleEpisodeEnd"
          @metrics-update="handleMetricsUpdate"
          @network-update="handleNetworkUpdate"
          @weight-health-update="handleWeightHealthUpdate"
          @auto-eval-result="handleAutoEvalResult"
          @architecture-loaded="handleArchitectureLoaded"
          @backend-ready="handleBackendReady"
          @eval-instances-set="handleEvalInstancesSet"
        />
        <div v-if="mode === 'idle'" class="game-overlay">
          <div class="overlay-content idle-content">
            <button class="btn btn-primary btn-hero" @click="openTrainingConfig">
              🧠 Train AI
            </button>
            <button class="btn btn-text btn-small" @click="startManualPlay">
              🎮 Play manually
            </button>
          </div>
        </div>
        
        <!-- Network Config Overlay -->
        <div v-if="mode === 'configuring'" class="game-overlay config-overlay">
          <NetworkConfig
            :initialConfig="hiddenLayersConfig"
            @start="startTrainingWithConfig"
          />
        </div>

        <!-- Eval In Progress Overlay (shown when headless eval is running) -->
        <div v-if="mode === 'eval' && !evalComplete && !autoEvalActive && evalTargetInstances > 16" class="game-overlay eval-overlay">
          <div class="eval-stats-panel eval-in-progress">
            <h3 class="eval-title">⏳ Evaluation in Progress</h3>
            <p class="eval-subtitle">{{ evalTargetInstances }} instances running with ε=0</p>
            
            <div class="eval-progress-bar">
              <div class="eval-progress-fill" :style="{ width: evalProgressPercent + '%' }"></div>
            </div>
            
            <div class="eval-results-grid">
              <div class="eval-stat-box">
                <span class="stat-number">{{ evalStats?.count || 0 }} / {{ evalTargetInstances }}</span>
                <span class="stat-label">Episodes Complete</span>
              </div>
              <div class="eval-stat-box">
                <span class="stat-number">{{ evalStats?.min ?? '—' }}</span>
                <span class="stat-label">Min Score</span>
              </div>
              <div class="eval-stat-box highlight">
                <span class="stat-number">{{ evalStats ? evalStats.avg.toFixed(1) : '—' }}</span>
                <span class="stat-label">Avg Score</span>
              </div>
              <div class="eval-stat-box best">
                <span class="stat-number">{{ evalStats?.max ?? '—' }}</span>
                <span class="stat-label">Max Score</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Eval Stats Overlay (shown only when manual eval completes) -->
        <div v-if="mode === 'eval' && evalComplete && !autoEvalActive" class="game-overlay eval-overlay">
          <div class="eval-stats-panel">
            <h3 class="eval-title">🎯 Evaluation Complete</h3>
            <p class="eval-subtitle">{{ evalTargetInstances }} instance{{ evalTargetInstances > 1 ? 's' : '' }} evaluated with ε=0</p>
            
            <div class="eval-results-grid">
              <div class="eval-stat-box">
                <span class="stat-number">{{ evalStats?.count || 0 }}</span>
                <span class="stat-label">Episodes Complete</span>
              </div>
              <div class="eval-stat-box">
                <span class="stat-number">{{ evalStats?.min || 0 }}</span>
                <span class="stat-label">Min Score</span>
              </div>
              <div class="eval-stat-box highlight">
                <span class="stat-number">{{ evalStats ? evalStats.avg.toFixed(1) : '0' }}</span>
                <span class="stat-label">Avg Score</span>
              </div>
              <div class="eval-stat-box best">
                <span class="stat-number">{{ evalStats?.max || 0 }}</span>
                <span class="stat-label">Max Score</span>
              </div>
            </div>
            
            <button class="btn btn-primary eval-restart-btn" @click="restartEval">
              🔄 Run Again
            </button>
          </div>
        </div>

        <!-- Auto-eval toast (shows briefly when auto-eval completes during training) -->
        <div v-if="autoEvalToastVisible" class="game-overlay eval-overlay auto-eval-toast">
          <div class="eval-stats-panel">
            <h3 class="eval-title">🎯 Auto-eval Complete</h3>
            <p class="eval-subtitle">{{ lastAutoEvalResult?.scores?.length || 0 }} trials at episode {{ lastAutoEvalResult?.episode || 0 }}</p>
            <div class="eval-results-grid" v-if="lastAutoEvalResult">
              <div class="eval-stat-box">
                <span class="stat-number">{{ lastAutoEvalResult.minScore }}</span>
                <span class="stat-label">Min</span>
              </div>
              <div class="eval-stat-box highlight">
                <span class="stat-number">{{ lastAutoEvalResult.avgScore.toFixed(1) }}</span>
                <span class="stat-label">Avg</span>
              </div>
              <div class="eval-stat-box best">
                <span class="stat-number">{{ lastAutoEvalResult.maxScore }}</span>
                <span class="stat-label">Max</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Game Over Overlay -->
        <div v-if="showGameOver" class="game-overlay game-over-overlay">
          <div class="overlay-content">
            <h2 class="game-over-title">Game Over</h2>
            <p class="game-over-score">Score: <span class="text-accent">{{ lastGameScore }}</span></p>
            <p class="game-over-best" v-if="lastGameScore === bestScore && bestScore > 0">🏆 New Best!</p>
            <div class="start-buttons">
              <button class="btn btn-primary" @click="restartGame">
                {{ mode === 'manual' ? '🎮 Play Again' : '🔄 Continue Training' }}
              </button>
              <button class="btn btn-secondary" @click="backToMenu">
                🏠 Menu
              </button>
            </div>
          </div>
        </div>
      </div>

      <aside class="sidebar">
        <StatusBar
          :mode="mode"
          :episode="episode"
          :lastScore="lastGameScore"
          :bestScore="bestScore"
          :stepsPerSecond="stepsPerSecond"
          :autoEvalHistory="autoEvalHistory"
          :canSubmitToLeaderboard="canSubmitToLeaderboard"
          @submit-score="showLeaderboard = true"
        />

        <div class="sidebar-panels">
          <!-- Show leaderboard panel when idle -->
          <LeaderboardPanel v-if="mode === 'idle'" />
          
          <!-- Show metrics panel when active -->
          <MetricsPanel
            v-else
            :epsilon="effectiveEpsilon"
            :avgReward="avgReward"
            :episodeReward="episodeReward"
            :episodeLength="episodeLength"
            :loss="loss"
            :episode="episode"
            :bestScore="bestScore"
            :stepsPerSecond="stepsPerSecond"
            :bufferSize="bufferSize"
            :totalSteps="totalSteps"
            :avgLength="avgLength"
            :isTraining="mode === 'training' && !isPaused"
            :isWarmup="isWarmup"
            :numInstances="numInstances"
            :episodesPerSecond="episodesPerSecond"
          />
        </div>
      </aside>
    </main>

    <footer class="app-footer">
      <p class="disclaimer text-muted">
        ⚠️ Settings reset when you close this tab. 
        <a href="#" class="text-primary" @click.prevent="showLeaderboard = true">View Leaderboard</a>
      </p>
    </footer>

    <!-- Leaderboard Modal -->
    <Leaderboard
      :isOpen="showLeaderboard"
      :canSubmit="canSubmitScore"
      :pendingScore="bestScore"
      :pendingParams="networkParams"
      :pendingArchitecture="networkArchitecture"
      @close="showLeaderboard = false"
      @submit="handleScoreSubmitted"
    />

    <!-- Network Detail Panel (in-window modal for best performance) -->
    <NetworkDetailPanel
      v-if="showNetworkDetail"
      :input="networkActivations[0] || []"
      :qValues="qValues"
      :selectedAction="selectedAction"
      :greedyAction="greedyAction"
      :epsilon="networkEpsilon"
      :isExploring="isExploring"
      :hiddenLayers="hiddenLayersConfig"
      :isPaused="isPaused"
      @close="showNetworkDetail = false"
      @toggle-pause="togglePause"
      @update-epsilon="updateEpsilon"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import StatusBar from './components/StatusBar.vue'
import MetricsPanel from './components/MetricsPanel.vue'
import ControlPanel from './components/ControlPanel.vue'
import NetworkViewer from './components/NetworkViewer.vue'
import NetworkDetailPanel from './components/NetworkDetailPanel.vue'
import NetworkConfig from './components/NetworkConfig.vue'
import Leaderboard from './components/Leaderboard.vue'
import LeaderboardPanel from './components/LeaderboardPanel.vue'
import { apiClient, calculateAdjustedScore } from './services/apiClient'
import { getAvailableBackends } from './rl/backendUtils'
import type { BackendType } from './rl/backendUtils'
import type { TrainingMetrics, AutoEvalResult } from './rl/types'

export type GameMode = 'idle' | 'configuring' | 'training' | 'eval' | 'manual'

export default defineComponent({
  name: 'App',
  components: {
    GameCanvas,
    StatusBar,
    MetricsPanel,
    ControlPanel,
    NetworkViewer,
    NetworkDetailPanel,
    NetworkConfig,
    Leaderboard,
    LeaderboardPanel,
  },
  data() {
    return {
      mode: 'idle' as GameMode,
      episode: 0,
      score: 0,
      bestScore: 0,
      stepsPerSecond: 0,
      episodesPerSecond: 0,
      epsilon: 0.5,  // Starting epsilon (will be updated from worker metrics)
      learningRate: 0.0005,
      passPipeReward: 1.0,
      deathPenalty: -1.0,
      stepPenalty: -0.01,
      centerReward: 0.15,
      numInstances: 1,
      backend: 'cpu' as BackendType,
      availableBackends: [] as BackendType[],
      autoDecay: true,
      lrScheduler: false,
      epsilonDecaySteps: 200000,
      frameLimit30: true,
      avgReward: 0,
      episodeReward: 0,
      loss: 0,
      bufferSize: 0,
      totalSteps: 0,
      avgLength: 0,
      episodeLength: 0,
      isWarmup: true,
      isAutoEval: false,
      autoEvalTrial: 0,
      autoEvalTrials: 100,
      lastAutoEvalResult: null as AutoEvalResult | null,
      autoEvalHistory: [] as { avgScore: number; maxScore: number; minScore: number; scores: number[]; episode: number }[],
      autoEvalActive: false,
      manualEvalActive: false,
      prevModeBeforeAutoEval: 'training' as GameMode,
      evalStats: null as { min: number; max: number; avg: number; count: number } | null,
      evalScores: [] as number[],
      evalComplete: false,
      evalTargetInstances: 1,  // Number of instances when eval started (locked during eval)
      savedEpsilonBeforeEval: 0.3,  // Epsilon saved before entering eval mode
      autoEvalToastVisible: false,
      autoEvalToastTimer: null as number | null,
      hasModel: false,  // True when a model has been trained or loaded from checkpoint
      networkActivations: [] as number[][],
      qValues: [0, 0] as [number, number],
      selectedAction: 0,
      greedyAction: 0,
      networkEpsilon: 0,  // Epsilon for network viz (separate from control epsilon)
      isExploring: false,
      weightHealth: null as { delta: number; avgSign: number } | null,
      isPaused: false,
      showGameOver: false,
      showNetworkDetail: false,
      lastGameScore: 0,
      showLeaderboard: false,
      hiddenLayersConfig: [64, 64] as number[],
      lowestLeaderboardScore: 0,
      lastSubmittedBestScore: 0,
    }
  },
  computed: {
    canSubmitScore(): boolean {
      return this.canSubmitToLeaderboard
    },
    effectiveEpsilon(): number {
      return this.mode === 'eval' ? 0 : this.epsilon
    },
    evalProgressPercent(): number {
      if (!this.evalTargetInstances || this.evalTargetInstances === 0) return 0
      const count = this.evalStats?.count || 0
      return Math.min(100, (count / this.evalTargetInstances) * 100)
    },
    networkParams(): number {
      const inputDim = 6
      const outputDim = 2
      const layers = [inputDim, ...this.hiddenLayersConfig, outputDim]
      let totalParams = 0
      for (let i = 0; i < layers.length - 1; i++) {
        totalParams += layers[i] * layers[i + 1] + layers[i + 1]
      }
      return totalParams
    },
    networkArchitecture(): string {
      const layers = [6, ...this.hiddenLayersConfig, 2]
      return layers.join('→')
    },
    canSubmitToLeaderboard(): boolean {
      if (this.bestScore <= 0) return false
      if (this.bestScore === this.lastSubmittedBestScore) return false
      const adjustedScore = calculateAdjustedScore(this.bestScore, this.networkParams)
      return adjustedScore > this.lowestLeaderboardScore
    },
  },
  async mounted() {
    await this.refreshLeaderboardThreshold()
    this.availableBackends = await getAvailableBackends()
    const best = this.pickBestBackend(this.availableBackends)
    this.backend = best
    const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
    if (gameCanvas) {
      await gameCanvas.setPreferredBackend(best)
    }
  },
  methods: {
    async refreshLeaderboardThreshold() {
      this.lowestLeaderboardScore = await apiClient.getLowestScore()
    },
    startManualPlay() {
      this.manualEvalActive = false
      this.autoEvalActive = false
      this.mode = 'manual'
      this.showGameOver = false
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.startGame()
      }
    },
    pickBestBackend(list: BackendType[]): BackendType {
      const priority: BackendType[] = ['webgpu', 'webgl', 'cpu']
      for (const b of priority) {
        if (list.includes(b)) return b
      }
      return 'cpu'
    },
    async cycleBackend(next: BackendType) {
      const shouldPause = this.mode === 'training' || this.mode === 'eval'
      if (shouldPause && !this.isPaused) {
        this.updatePaused(true)
      }

      this.backend = next
      if (this.availableBackends.length === 0) {
        this.availableBackends = await getAvailableBackends()
      }
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        await gameCanvas.setPreferredBackend(next)
      }
    },
    openTrainingConfig() {
      this.manualEvalActive = false
      this.autoEvalActive = false
      this.mode = 'configuring'
      this.showGameOver = false
      this.isPaused = false
    },
    async startTrainingWithConfig(hiddenLayers: number[]) {
      this.hiddenLayersConfig = hiddenLayers
      this.mode = 'training'
      this.hasModel = true
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        try {
          await gameCanvas.startTraining(hiddenLayers)
        } catch (error) {
          console.error('[App] Failed to start training with config:', error)
        }
      }
    },
    handleScoreUpdate(newScore: number) {
      this.score = newScore
      if (newScore > this.bestScore) {
        this.bestScore = newScore
      }
    },
    handleEpisodeEnd(stats: { score: number; reward: number; length?: number }) {
      this.lastGameScore = stats.score
      this.episodeReward = stats.reward
      if (stats.length !== undefined) {
        this.episodeLength = stats.length
      }
      
      if (this.mode === 'manual') {
        this.showGameOver = true
      }
      
      // Record eval scores when in eval mode
      if (this.mode === 'eval') {
        this.recordEvalScore(stats.score)
      }
    },
    handleMetricsUpdate(metrics: TrainingMetrics) {
      this.episode = metrics.episode
      this.avgReward = metrics.avgReward
      this.episodeReward = metrics.episodeReward
      this.episodeLength = metrics.episodeLength
      // Don't update epsilon during eval mode - it must stay at 0 (greedy policy)
      if (this.mode !== 'eval') {
        this.epsilon = metrics.epsilon
      }
      this.loss = metrics.loss
      this.stepsPerSecond = metrics.stepsPerSecond
      this.episodesPerSecond = metrics.episodesPerSecond || 0
      this.bufferSize = metrics.bufferSize
      this.totalSteps = metrics.totalSteps
      this.avgLength = metrics.avgLength
      this.isWarmup = metrics.isWarmup ?? false
      
      if (metrics.learningRate !== undefined) {
        this.learningRate = metrics.learningRate
      }
      
      this.isAutoEval = metrics.isAutoEval ?? false
      this.autoEvalTrial = metrics.autoEvalTrial ?? 0
      this.autoEvalTrials = metrics.autoEvalTrials ?? 100

      // Reflect auto-eval state in UI by temporarily switching to eval mode
      const autoEvalRunning = this.isAutoEval
      if (autoEvalRunning && !this.manualEvalActive) {
        if (!this.autoEvalActive) {
          this.autoEvalActive = true
          this.prevModeBeforeAutoEval = this.mode
          this.mode = 'eval'
          this.isPaused = false
          this.evalComplete = false
        }
      } else if (!autoEvalRunning && this.autoEvalActive) {
        this.autoEvalActive = false
        // Restore previous mode only if we switched because of auto-eval
        if (!this.manualEvalActive) {
          this.mode = this.prevModeBeforeAutoEval || 'training'
        }
      }
    },
    handleAutoEvalResult(result: AutoEvalResult) {
      console.log('[App] Auto-eval result:', result)
      this.lastAutoEvalResult = result
      this.lastGameScore = result.maxScore
      this.autoEvalHistory.push(result)
      if (this.autoEvalHistory.length > 10) {
        this.autoEvalHistory.shift()
      }
      if (result.maxScore > this.bestScore) {
        this.bestScore = result.maxScore
      }
      // Show a short-lived overlay only for auto-eval completion (treat undefined as auto-eval to be safe)
      if (result.isAutoEval !== false) {
        this.autoEvalToastVisible = true
        if (this.autoEvalToastTimer) {
          clearTimeout(this.autoEvalToastTimer)
        }
        this.autoEvalToastTimer = window.setTimeout(() => {
          this.autoEvalToastVisible = false
          this.autoEvalToastTimer = null
        }, 5000)
      }
      
      // Update eval stats as soon as results arrive (even if episodeEnd events lag behind)
      // This ensures UI completes when worker finishes, instead of waiting for both signals
      if (this.mode === 'eval') {
        // Merge counts safely: prefer the larger set between worker result and collected scores
        const finalScores = result.scores.length >= this.evalScores.length
          ? result.scores
          : this.evalScores

        // Keep the longest source of truth
        if (result.scores.length >= this.evalScores.length) {
          this.evalScores = result.scores
        }

        const minScore = finalScores.length ? Math.min(...finalScores) : 0
        const maxScore = finalScores.length ? Math.max(...finalScores) : 0
        const avgScore = finalScores.length
          ? finalScores.reduce((sum, v) => sum + v, 0) / finalScores.length
          : 0

        this.evalStats = {
          min: minScore,
          max: maxScore,
          avg: avgScore,
          count: finalScores.length,
        }

        // Mark complete when we have enough scores from the worker result
        const expected = this.evalTargetInstances || result.numTrials || finalScores.length
        if (finalScores.length >= expected) {
          this.evalComplete = true
        }
      }
    },
    handleArchitectureLoaded(hiddenLayers: number[]) {
      this.hiddenLayersConfig = hiddenLayers
      // When checkpoint is loaded, go to training mode (paused) so eval is available
      this.mode = 'training'
      this.hasModel = true
      this.isPaused = true
      console.log('[App] Checkpoint loaded, model ready for eval')
    },
    handleBackendReady(backend: BackendType) {
      this.backend = backend
      console.log('[App] Backend ready:', backend)
    },
    handleNetworkUpdate(viz: { input: number[]; qValues: number[]; selectedAction: number; greedyAction: number; epsilon: number; isExploring: boolean }) {
      // Build activations array for NetworkViewer: [input, ...emptyHiddenLayers, output]
      const hiddenLayers = this.hiddenLayersConfig || [64, 64]
      this.networkActivations = [
        viz.input,
        ...hiddenLayers.map(() => []),
        viz.qValues,
      ]
      if (viz.qValues && viz.qValues.length === 2) {
        this.qValues = [viz.qValues[0], viz.qValues[1]] as [number, number]
        this.selectedAction = viz.selectedAction
        this.greedyAction = viz.greedyAction
        this.networkEpsilon = viz.epsilon
        this.isExploring = viz.isExploring
      }
      // No localStorage needed - data flows via Vue props to NetworkDetailPanel
    },
    handleWeightHealthUpdate(health: any) {
      // Normalize worker payload to the NetworkViewer shape
      const delta = health?.weightDelta ?? health?.delta ?? 0
      const avgSign = health?.avgGradSign ?? health?.avgSign ?? 0
      this.weightHealth = { delta, avgSign }
    },
    updateEpsilon(value: number) {
      this.epsilon = value
      this.autoDecay = false
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setEpsilon(value)
        gameCanvas.setAutoDecay(false)
      }
    },
    updateLearningRate(value: number) {
      this.learningRate = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setLearningRate(value)
      }
    },
    updateNumInstances(value: number) {
      this.numInstances = value
      // GameCanvas updates automatically via prop watch
    },
    updatePassPipeReward(value: number) {
      this.passPipeReward = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setRewardConfig({ passPipe: value })
      }
    },
    updateDeathPenalty(value: number) {
      this.deathPenalty = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setRewardConfig({ deathPenalty: value })
      }
    },
    updateStepPenalty(value: number) {
      this.stepPenalty = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setRewardConfig({ stepPenalty: value })
      }
    },
    updateCenterReward(value: number) {
      this.centerReward = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setRewardConfig({ centerReward: value })
      }
    },
    updateFrameLimit(value: boolean) {
      this.frameLimit30 = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setFrameLimit(value)
      }
    },
    updateAutoDecay(value: boolean) {
      this.autoDecay = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setAutoDecay(value)
      }
    },
    updateLRScheduler(value: boolean) {
      this.lrScheduler = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setLRScheduler(value)
      }
    },
    updateEpsilonDecaySteps(value: number) {
      this.epsilonDecaySteps = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setEpsilonDecaySteps(value)
      }
    },
    saveCheckpoint() {
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas && (gameCanvas as any).saveCheckpointToFile) {
        (gameCanvas as any).saveCheckpointToFile()
      }
    },
    triggerCheckpointLoad() {
      const input = this.$refs.checkpointInput as HTMLInputElement | undefined
      if (input) {
        input.value = ''
        input.click()
      }
    },
    onCheckpointFileSelected(event: Event) {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async () => {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
        if (text && gameCanvas && (gameCanvas as any).loadCheckpointFromJSON) {
          try {
            await (gameCanvas as any).loadCheckpointFromJSON(text)
          } catch (error) {
            console.error('[App] Failed to load checkpoint from JSON:', error)
          }
        }
      }
      reader.readAsText(file)
    },
    updatePaused(value: boolean) {
      // When resuming eval, ensure evalTargetInstances is clamped to max 64
      // and reset eval state if instance count changed while paused
      if (!value && this.mode === 'eval') {
        const maxEvalInstances = 64
        const clampedInstances = Math.min(this.numInstances, maxEvalInstances)
        // Always ensure evalTargetInstances is clamped (in case it was > 100 somehow)
        if (this.evalTargetInstances !== clampedInstances) {
          // Instance count changed during pause - reset eval state for new count
          this.evalStats = null
          this.evalScores = []
          this.evalComplete = false
          this.evalTargetInstances = clampedInstances
        }
      }
      
      this.isPaused = value
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.setPaused(value)
      }
    },
    togglePause() {
      this.updatePaused(!this.isPaused)
    },
    async changeMode(newMode: GameMode) {
      if (newMode === this.mode) return
      
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      
      if (newMode === 'eval') {
        this.manualEvalActive = true
        this.autoEvalActive = false
        // Save current epsilon before entering eval (to restore when returning to training)
        this.savedEpsilonBeforeEval = this.epsilon
        this.mode = 'eval'
        this.epsilon = 0
        this.isPaused = false
        this.showGameOver = false
        // Reset eval stats when entering eval mode
        this.evalStats = null
        this.evalScores = []
        this.evalComplete = false
        // Tentatively lock target instances to current selection to avoid stale value
        // in case episode-end events arrive before startEval resolves.
        this.evalTargetInstances = Math.min(this.numInstances, 64)
        if (gameCanvas) {
          // Note: startEval() sets epsilon=0 internally after initialization completes
          // to avoid race condition where setEpsilon fires before unifiedDQN is ready
          try {
            const usedInstances = await gameCanvas.startEval()
            // Lock to the instance count actually used by the worker
            this.evalTargetInstances = usedInstances
          } catch (error) {
            console.error('[App] Failed to start eval:', error)
          }
        }
      } else if (newMode === 'training') {
        this.manualEvalActive = false
        this.mode = 'training'
        this.isPaused = false
        this.showGameOver = false
        // Restore epsilon if coming from eval mode (was set to 0)
        if (this.epsilon === 0 && this.savedEpsilonBeforeEval > 0) {
          this.epsilon = this.savedEpsilonBeforeEval
          gameCanvas?.setEpsilon(this.savedEpsilonBeforeEval)
        }
        if (gameCanvas) {
          try {
            await gameCanvas.startTraining()
          } catch (error) {
            console.error('[App] Failed to start training:', error)
          }
        }
      } else if (newMode === 'manual') {
        this.manualEvalActive = false
        this.mode = 'manual'
        this.showGameOver = false
        if (gameCanvas) {
          gameCanvas.startGame()
        }
      }
    },
    resetTraining() {
      this.manualEvalActive = false
      this.autoEvalActive = false
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.resetTraining()
      }
      // Reset all state
      this.episode = 0
      this.score = 0
      this.bestScore = 0
      this.avgReward = 0
      this.episodeReward = 0
      this.loss = 0
      this.bufferSize = 0
      this.totalSteps = 0
      this.avgLength = 0
      this.episodeLength = 0
      this.epsilon = 0.5
      this.autoDecay = true
      this.isWarmup = true
      this.isAutoEval = false
      this.autoEvalTrial = 0
      this.lastAutoEvalResult = null
      this.autoEvalHistory = []
      this.isPaused = false
      this.showGameOver = false
      this.lastSubmittedBestScore = 0
      this.hasModel = false
      this.mode = 'configuring'
    },
    async restartGame() {
      this.showGameOver = false
      this.score = 0
      
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (this.mode === 'manual') {
        if (gameCanvas) gameCanvas.startGame()
      } else {
        if (gameCanvas) {
          try {
            await gameCanvas.startTraining()
          } catch (error) {
            console.error('[App] Failed to restart training:', error)
          }
        }
      }
    },
    backToMenu() {
      this.showGameOver = false
      this.mode = 'idle'
      this.manualEvalActive = false
      this.autoEvalActive = false
      this.score = 0
      
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        gameCanvas.stopGame()
      }
    },
    async backToTraining() {
      this.showGameOver = false
      this.manualEvalActive = false
      this.autoEvalActive = false
      this.mode = 'training'
      this.isPaused = false
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        try {
          await gameCanvas.startTraining()
        } catch (error) {
          console.error('[App] Failed to start training (backToTraining):', error)
        }
      }
    },
    async restartEval() {
      // Clear eval stats and restart evaluation
      this.evalStats = null
      this.evalScores = []
      this.evalComplete = false
      // Tentatively lock target instances before startEval resolves to avoid stale value
      this.evalTargetInstances = Math.min(this.numInstances, 64)
      const gameCanvas = this.$refs.gameCanvas as InstanceType<typeof GameCanvas>
      if (gameCanvas) {
        try {
          const usedInstances = await gameCanvas.startEval()
          // Lock to the instance count actually used by the worker
          this.evalTargetInstances = usedInstances
        } catch (error) {
          console.error('[App] Failed to restart eval:', error)
        }
      }
    },
    recordEvalScore(score: number) {
      // Ignore delayed episode-end events if eval is already complete
      // (e.g., from auto-eval results that arrived before all individual episode-end events)
      if (this.evalComplete) {
        return
      }
      
      this.evalScores.push(score)
      // Update stats
      const scores = this.evalScores
      this.evalStats = {
        min: Math.min(...scores),
        max: Math.max(...scores),
        avg: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      }
      // Check if all instances have completed (use locked target, not current numInstances)
      if (scores.length >= this.evalTargetInstances) {
        this.evalComplete = true
      }
    },
    handleEvalInstancesSet(count: number) {
      // Sync evalTargetInstances to the actual count used by GameCanvas/worker
      this.evalTargetInstances = count
    },
    async handleScoreSubmitted(result: { entry: { name: string; score: number }; isNewChampion: boolean }) {
      this.lastSubmittedBestScore = this.bestScore
      if (result.isNewChampion) {
        console.log('🎉 New champion:', result.entry.name, 'with score', result.entry.score)
      }
      await this.refreshLeaderboardThreshold()
    },
  },
})
</script>

<style scoped>
.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--color-bg-dark) 0%, var(--color-bg-mid) 100%);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-xl);
  border-bottom: 1px solid var(--color-border);
}

.app-title {
  font-size: 1.25rem;
  display: flex;
  gap: var(--spacing-sm);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.mode-indicator {
  display: flex;
  align-items: center;
}

.checkpoint-controls {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.checkpoint-input {
  display: none;
}

.badge {
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-xl);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-idle {
  background: var(--color-bg-light);
  color: var(--color-text-muted);
}

.badge-training {
  background: linear-gradient(135deg, var(--color-primary), #0099cc);
  color: var(--color-bg-dark);
}

.badge-configuring {
  background: linear-gradient(135deg, #ff9f43, #ff6b35);
  color: var(--color-bg-dark);
}

.badge-eval {
  background: var(--color-success);
  color: var(--color-bg-dark);
}

.badge-manual {
  background: var(--color-accent);
  color: var(--color-bg-dark);
}

.app-main {
  flex: 1;
  display: flex;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  overflow: hidden;
}

.left-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
  max-height: 100%;
}

.game-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  min-width: 0;
}

.game-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(15, 15, 35, 0.85);
  backdrop-filter: blur(4px);
  z-index: 10;
}

.config-overlay {
  overflow-y: auto;
  padding: var(--spacing-md);
}

.game-over-overlay {
  background: rgba(15, 15, 35, 0.9);
}

/* Eval Stats Overlay */
.eval-overlay {
  background: rgba(15, 15, 35, 0.92);
}

.auto-eval-toast {
  animation: fade-in-out 5s ease forwards;
}

@keyframes fade-in-out {
  0% { opacity: 0; }
  5% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}

.eval-stats-panel {
  background: var(--color-bg-mid);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  text-align: center;
  min-width: 320px;
  max-width: 400px;
}

.eval-title {
  font-size: 1.4rem;
  color: var(--color-primary);
  margin-bottom: var(--spacing-xs);
}

.eval-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-lg);
}

.eval-results-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.eval-stat-box {
  background: var(--color-bg-dark);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.eval-stat-box .stat-number {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--color-text);
}

.eval-stat-box .stat-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.eval-stat-box.highlight {
  border-color: var(--color-primary);
  background: rgba(0, 217, 255, 0.1);
}

.eval-stat-box.highlight .stat-number {
  color: var(--color-primary);
}

.eval-stat-box.best {
  border-color: var(--color-accent);
  background: rgba(255, 215, 0, 0.1);
}

.eval-stat-box.best .stat-number {
  color: var(--color-accent);
}

.eval-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl) 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.waiting-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.eval-restart-btn {
  width: 100%;
  margin-top: var(--spacing-sm);
}

.eval-in-progress .eval-title {
  color: var(--color-accent);
}

.eval-progress-bar {
  width: 100%;
  height: 6px;
  background: var(--color-bg-light);
  border-radius: 3px;
  margin: var(--spacing-md) 0;
  overflow: hidden;
}

.eval-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), var(--color-primary));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.overlay-content {
  text-align: center;
}

.idle-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
}

.btn-hero {
  padding: var(--spacing-lg) var(--spacing-xl);
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 200, 255, 0.3);
  transition: all 0.3s ease;
}

.btn-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(0, 200, 255, 0.5);
}

.btn-text {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: color 0.2s ease;
}

.btn-text:hover {
  color: var(--color-text);
}

.game-over-title {
  font-size: 2rem;
  color: var(--color-text);
  margin-bottom: var(--spacing-md);
}

.game-over-score {
  font-size: 1.2rem;
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-sm);
}

.game-over-best {
  font-size: 1rem;
  color: var(--color-accent);
  margin-bottom: var(--spacing-lg);
  animation: bounce 0.5s ease-in-out;
}

@keyframes bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.start-buttons {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
}

.sidebar {
  width: 450px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
}

.sidebar-panels {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
}

.app-footer {
  padding: var(--spacing-sm) var(--spacing-xl);
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.disclaimer {
  font-size: 0.75rem;
}

.disclaimer a {
  text-decoration: none;
}

.disclaimer a:hover {
  text-decoration: underline;
}

/* Tablet responsive */
@media (max-width: 1200px) {
  .left-panel {
    width: 350px;
  }
  
  .sidebar {
    width: 320px;
  }
}

@media (max-width: 1024px) {
  .left-panel {
    width: 320px;
  }
  
  .sidebar {
    width: 280px;
  }
}

/* Mobile responsive */
@media (max-width: 768px) {
  .app-main {
    flex-direction: column;
  }

  .left-panel {
    display: none;
  }

  .sidebar {
    width: 100%;
    max-height: 45vh;
  }

  .app-title {
    font-size: 1rem;
  }

  .start-buttons {
    flex-direction: column;
  }
}
</style>
