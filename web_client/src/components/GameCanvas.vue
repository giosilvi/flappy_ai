<template>
  <div class="game-canvas-container" ref="container" @touchstart.passive="onTouchStart">
    <canvas ref="canvas" class="game-canvas"></canvas>
    
    
    <!-- High instance count overlay - no visualization -->
    <div v-if="shouldShowNoVizOverlay" class="fast-mode-overlay">
      <div class="fast-mode-content">
        <div class="fast-header">
          <div class="fast-icon">⚡</div>
          <div class="fast-title">PARALLEL TRAINING</div>
          <div class="fast-subtitle">{{ numInstances }} instances running</div>
          <div class="fast-backend">Backend: {{ backend }}</div>
        </div>
        <img src="/dqn-workflow.jpg" alt="DQN Workflow" class="dqn-workflow-img" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import {
  GameEngine,
  Renderer,
  TiledRenderer,
  InputController,
  GameConfig,
  MAX_VISUALIZED_INSTANCES,
  type GameAction,
  type RawGameState,
} from '@/game'
import { 
  UnifiedDQN, 
  type BackendType,
} from '@/rl'

export default defineComponent({
  name: 'GameCanvas',
  props: {
    mode: {
      type: String as PropType<'idle' | 'configuring' | 'training' | 'eval' | 'manual'>,
      default: 'idle',
    },
    numInstances: {
      type: Number,
      default: 1,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    hiddenLayersConfig: {
      type: Array as PropType<number[]>,
      default: () => [64, 64],
    },
    frameLimit30: {
      type: Boolean,
      default: true,
    },
    // Training settings (synced to worker on init)
    epsilon: {
      type: Number,
      default: 0.5,
    },
    learningRate: {
      type: Number,
      default: 0.0005,
    },
    autoDecay: {
      type: Boolean,
      default: true,
    },
    epsilonDecaySteps: {
      type: Number,
      default: 200000,
    },
  },
  emits: [
    'score-update', 
    'episode-end', 
    'state-update', 
    'metrics-update', 
    'network-update', 
    'weight-health-update', 
    'auto-eval-result', 
    'architecture-loaded',
    'backend-ready',
    'eval-instances-set',
  ],
  data() {
    return {
      // Renderers
      singleRenderer: null as Renderer | null,
      tiledRenderer: null as TiledRenderer | null,
      
      // Game state
      engine: null as GameEngine | null,
      inputController: null as InputController | null,
      unifiedDQN: null as UnifiedDQN | null,
      isInitializing: false,  // Lock to prevent concurrent initUnifiedDQN calls
      
      // Animation
      animationId: null as number | null,
      isRunning: false,
      internalPaused: false,
      gameOver: false,
      
      // Input
      pendingAction: 0 as GameAction,
      lastFrameTime: 0,
      lastScore: 0,
      
      // UI state
      showTouchHint: true,
      isMobile: false,
      backend: 'cpu' as BackendType,
      lastInitHiddenLayers: null as number[] | null,
      lastInitBackend: null as BackendType | 'auto' | null,
      pendingNumInstances: null as number | null,
      preferredBackend: 'auto' as BackendType | 'auto',
    }
  },
  computed: {
    shouldShowNoVizOverlay(): boolean {
      return this.mode === 'training' && this.numInstances > MAX_VISUALIZED_INSTANCES
    },
    canVisualize(): boolean {
      return this.numInstances <= MAX_VISUALIZED_INSTANCES
    },
  },
  watch: {
    isPaused(newVal: boolean) {
      this.setPaused(newVal)
    },
    numInstances(newVal: number) {
      this.updateInstanceCount(newVal)
    },
  },
  async mounted() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    await this.initGame()
  },
  beforeUnmount() {
    this.stopGame()
    if (this.inputController) {
      this.inputController.disable()
    }
    if (this.unifiedDQN) {
      this.unifiedDQN.dispose()
    }
  },
  methods: {
    async initGame() {
      const canvas = this.$refs.canvas as HTMLCanvasElement
      if (!canvas) return

      // Use native game resolution - CSS handles display scaling
      canvas.width = GameConfig.WIDTH   // 288
      canvas.height = GameConfig.HEIGHT // 512

      // Initialize single-game renderer (for manual mode and idle)
      this.singleRenderer = new Renderer(canvas)
      await this.singleRenderer.loadSprites()

      // Initialize tiled renderer (for parallel training/eval)
      // Use native dimensions - it will scale internally for tiles
      this.tiledRenderer = new TiledRenderer(canvas, GameConfig.WIDTH, GameConfig.HEIGHT)
      await this.tiledRenderer.loadSprites()

      // Initialize game engine (for manual mode)
      this.engine = new GameEngine()

      // Initialize input controller
      this.inputController = new InputController()

      // Reset to show initial state
      this.engine.reset()
      this.renderFrame()
    },

    async initUnifiedDQN(hiddenLayersOverride?: number[]) {
      const desiredLayers = hiddenLayersOverride ? hiddenLayersOverride : this.hiddenLayersConfig

      // Wait for any in-flight initialization to finish before proceeding
      if (this.isInitializing) {
        console.log('[GameCanvas] initUnifiedDQN already in progress, waiting...')
      }
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // If an instance now exists with the same architecture AND backend, skip redundant re-init
      const backendChanged = this.lastInitBackend !== this.preferredBackend
      if (this.unifiedDQN && this.lastInitHiddenLayers && this.layersEqual(this.lastInitHiddenLayers, desiredLayers) && !backendChanged) {
        return
      }
      
      this.isInitializing = true
      
      try {
        if (this.unifiedDQN) {
          this.unifiedDQN.dispose()
          this.unifiedDQN = null
        }

        const hiddenLayers = [...desiredLayers]
        this.lastInitHiddenLayers = [...hiddenLayers]
        this.lastInitBackend = this.preferredBackend

        // Capture the current instance count at init start
        const initNumInstances = this.numInstances

        this.unifiedDQN = new UnifiedDQN({
          agentConfig: {
            hiddenLayers,
            epsilonStart: this.epsilon,
            epsilonDecaySteps: this.epsilonDecaySteps,
            learningRate: this.learningRate,
          },
          numInstances: initNumInstances,
          backend: this.preferredBackend,
          visualize: this.canVisualize,
          frameLimit30: this.frameLimit30,
        })

        await this.unifiedDQN.init({
        onReady: (backend) => {
          this.backend = backend
          this.$emit('backend-ready', backend)
          console.log('[GameCanvas] UnifiedDQN ready with backend:', backend)
        },
        onMetrics: (metrics) => {
          this.$emit('metrics-update', metrics)
        },
        onGameStates: (states, rewards, cumulativeRewards) => {
          this.renderTiledStates(states, rewards, cumulativeRewards)
        },
        onAutoEvalResult: (result) => {
          this.$emit('auto-eval-result', result)
        },
        onWeightHealth: (health) => {
          this.$emit('weight-health-update', health)
        },
        onNetwork: (data) => {
          // Only emit for single instance (viz disabled for multi-instance)
          if (this.numInstances === 1) {
            this.$emit('network-update', data)
          }
        },
        onEpisodeEnd: (stats) => {
          this.$emit('episode-end', {
            score: stats.score,
            reward: stats.reward,
            length: stats.length,
          })
        },
        onError: (msg) => {
          console.error('[GameCanvas] UnifiedDQN error:', msg)
        },
      })

      // If numInstances changed during async init, apply the latest value now
      if (this.unifiedDQN) {
        const desiredCount = this.pendingNumInstances ?? this.numInstances
        if (desiredCount !== initNumInstances) {
          this.updateInstanceCount(desiredCount)
        }
        this.pendingNumInstances = null
        // Ensure auto-eval uses current instance count (capped at 64)
        // Scale interval with sqrt of instances (more instances = faster episodes = less frequent auto-eval)
        const autoEvalInterval = Math.round(2500 * Math.sqrt(this.numInstances))
        this.unifiedDQN.setAutoEval(true, Math.min(this.numInstances, 64), autoEvalInterval)
      }
      } finally {
        this.isInitializing = false
      }
    },

    updateInstanceCount(count: number) {
      if (this.unifiedDQN) {
        // Type assertion needed since count comes from prop
        this.unifiedDQN.setNumInstances(count as 1 | 4 | 16 | 64 | 256 | 1024)
        this.unifiedDQN.setVisualization(count <= MAX_VISUALIZED_INSTANCES)
        this.unifiedDQN.setFrameLimit(this.frameLimit30)
        // Scale interval with sqrt of instances (more instances = faster episodes = less frequent auto-eval)
        const autoEvalInterval = Math.round(2500 * Math.sqrt(count))
        this.unifiedDQN.setAutoEval(true, Math.min(count, 64), autoEvalInterval)
      } else {
        // Defer applying until init completes
        this.pendingNumInstances = count
      }
      
      if (this.tiledRenderer) {
        this.tiledRenderer.setInstanceCount(Math.min(count, MAX_VISUALIZED_INSTANCES))
      }
    },

    renderTiledStates(states: RawGameState[], rewards?: number[], cumulativeRewards?: number[]) {
      if (!this.tiledRenderer || !this.canVisualize) return
      // Don't show rewards during eval mode - only during training
      if (this.mode === 'eval') {
        this.tiledRenderer.render(states)
      } else {
        this.tiledRenderer.render(states, rewards, cumulativeRewards)
      }
    },

    // ===== Manual Mode =====
    startGame() {
      if (!this.engine || !this.singleRenderer) return

      // Stop any training if active
      if (this.unifiedDQN) {
        this.unifiedDQN.stopTraining()
        this.unifiedDQN.stopEval()
      }

      // Reset canvas to single-game dimensions
      const canvas = this.$refs.canvas as HTMLCanvasElement
      if (canvas) {
        canvas.width = GameConfig.WIDTH
        canvas.height = GameConfig.HEIGHT
      }

      this.engine.reset()
      this.singleRenderer.resetFloor()
      this.pendingAction = 0
      this.isRunning = true
      this.internalPaused = false
      this.gameOver = false
      this.lastScore = 0

      // Enable input for manual play
      const container = this.$refs.container as HTMLElement
      this.inputController?.enable(container, this.handleInput)

      this.lastFrameTime = performance.now()
      this.$nextTick(() => this.gameLoop())
    },

    stopGame() {
      this.isRunning = false
      this.internalPaused = false
      this.gameOver = false
      
      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
      
      this.inputController?.disable()
      
      if (this.unifiedDQN) {
        this.unifiedDQN.stopTraining()
        this.unifiedDQN.stopEval()
      }
    },

    handleInput(action: GameAction) {
      this.pendingAction = action
    },

    onTouchStart() {
      this.showTouchHint = false
    },

    gameLoop() {
      if (this.mode !== 'manual') return
      if (!this.isRunning || !this.engine || !this.singleRenderer) return

      const now = performance.now()
      const elapsed = now - this.lastFrameTime

      if (elapsed >= GameConfig.FRAME_TIME) {
        this.lastFrameTime = now - (elapsed % GameConfig.FRAME_TIME)

        if (!this.internalPaused && !this.gameOver) {
          const action = this.pendingAction
          this.pendingAction = 0

          const result = this.engine.step(action)

          if (result.info.score > this.lastScore) {
            this.lastScore = result.info.score
            this.$emit('score-update', result.info.score)
          }

          if (result.done && !this.gameOver) {
            this.gameOver = true
            this.$emit('episode-end', {
              score: result.info.score,
              reward: result.reward,
            })
          }

          this.$emit('state-update', {
            observation: result.observation,
            state: this.engine.getState(),
          })
        }
      }

      this.renderFrame()
      this.animationId = requestAnimationFrame(() => this.gameLoop())
    },

    renderFrame() {
      if (!this.engine || !this.singleRenderer) return

      const state = this.engine.getState()
      const showMessage = this.mode === 'idle' && !this.isRunning

      this.singleRenderer.render(state as RawGameState, showMessage)
    },

    // ===== Training Mode =====
    async startTraining(_hiddenLayers?: number[]) {
      // If a specific architecture is provided (e.g., from checkpoint), ensure we init with it
      if (!this.unifiedDQN || _hiddenLayers) {
        await this.initUnifiedDQN(_hiddenLayers)
      }

      // Stop any running eval before starting training (clean mode transition)
      this.unifiedDQN?.stopEval()

      // Sync training settings to worker (in case they were changed before starting)
      this.unifiedDQN?.setAutoDecay(this.autoDecay)
      this.unifiedDQN?.setEpsilon(this.epsilon)
      this.unifiedDQN?.setEpsilonDecaySteps(this.epsilonDecaySteps)
      this.unifiedDQN?.setLearningRate(this.learningRate)

      // Update tiled renderer for visualization
      if (this.tiledRenderer && this.canVisualize) {
        this.tiledRenderer.setInstanceCount(this.numInstances)
      }

      this.isRunning = true
      this.internalPaused = false
      this.gameOver = false

      // Apply current frame limit setting before starting training
      this.unifiedDQN?.setFrameLimit(this.frameLimit30)
      
      this.unifiedDQN?.startTraining()
    },

    // ===== Eval Mode =====
    async startEval(): Promise<number> {
      if (!this.unifiedDQN) {
        await this.initUnifiedDQN()
      }

      // Stop any running training AND eval before starting manual eval
      // This ensures any ongoing auto-eval from training mode is stopped
      this.unifiedDQN?.stopTraining()
      this.unifiedDQN?.stopEval()

      // Update tiled renderer for visualization
      if (this.tiledRenderer && this.canVisualize) {
        this.tiledRenderer.setInstanceCount(this.numInstances)
      }

      this.isRunning = true
      this.internalPaused = false
      this.gameOver = false
      
      // Apply current frame limit setting before starting eval
      this.unifiedDQN?.setFrameLimit(this.frameLimit30)
      
      // Ensure epsilon is 0 for eval (set AFTER init completes to avoid race condition)
      this.unifiedDQN?.setEpsilon(0)
      
      // Use manual eval with clamped instance count (max 64 for eval)
      // This matches App.vue's evalTargetInstances clamping
      const maxEvalInstances = 64
      const clampedInstances = Math.min(this.numInstances, maxEvalInstances)

      // Notify parent of the actual eval instance count being used
      this.$emit('eval-instances-set', clampedInstances)

      this.unifiedDQN?.startManualEval(clampedInstances)

      // Return the actual instance count used so the parent can lock expectations
      return clampedInstances
    },

    startAutoEval() {
      if (!this.unifiedDQN) return
      this.unifiedDQN.startAutoEval()
    },

    // ===== Controls =====
    setPaused(paused: boolean) {
      this.internalPaused = paused
      
      if (paused) {
        if (this.unifiedDQN) {
          this.unifiedDQN.stopTraining()
          this.unifiedDQN.stopEval()
        }
      } else {
        if (this.mode === 'training' && this.unifiedDQN) {
          this.unifiedDQN.startTraining()
        } else if (this.mode === 'eval' && this.unifiedDQN) {
          // Clamp eval instances to max 64 to match App.vue's evalTargetInstances clamping
          const maxEvalInstances = 64
          const clampedInstances = Math.min(this.numInstances, maxEvalInstances)
          // Notify parent of the actual eval instance count when resuming
          this.$emit('eval-instances-set', clampedInstances)
          this.unifiedDQN.startManualEval(clampedInstances)
        }
      }
    },

    setEpsilon(value: number) {
      this.unifiedDQN?.setEpsilon(value)
    },

    setAutoDecay(enabled: boolean) {
      this.unifiedDQN?.setAutoDecay(enabled)
    },

    setEpsilonDecaySteps(steps: number) {
      this.unifiedDQN?.setEpsilonDecaySteps(steps)
    },

    setLearningRate(lr: number) {
      this.unifiedDQN?.setLearningRate(lr)
    },

    setFrameLimit(enabled: boolean) {
      this.unifiedDQN?.setFrameLimit(enabled)
    },
    async setPreferredBackend(backend: BackendType) {
      this.preferredBackend = backend
      // Reinitialize the agent with the requested backend
      await this.initUnifiedDQN(this.hiddenLayersConfig)
    },

    setLRScheduler(enabled: boolean) {
      this.unifiedDQN?.setLRScheduler(enabled)
    },

    setRewardConfig(config: Partial<{ passPipe: number; deathPenalty: number; stepPenalty: number; centerReward: number; flapCost: number }>) {
      this.unifiedDQN?.setRewardConfig(config)
    },

    resetTraining() {
      if (this.unifiedDQN) {
        this.unifiedDQN.dispose()
        this.unifiedDQN = null
      }
      this.isRunning = false
    },

    // ===== Checkpoint I/O =====
    async saveCheckpointToFile() {
      if (!this.unifiedDQN) return

      const json = await this.unifiedDQN.saveCheckpoint()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `flappy-ai-checkpoint-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    async loadCheckpointFromJSON(json: string) {
      // Parse checkpoint to get architecture info
      let checkpoint: any
      try {
        checkpoint = JSON.parse(json)
      } catch (e) {
        console.error('[GameCanvas] Failed to parse checkpoint JSON:', e)
        return
      }

      // Extract hidden layers from checkpoint
      const hiddenLayers = checkpoint.info?.hiddenLayers || checkpoint.architecture?.hiddenLayers || [64, 64]

      // Emit architecture-loaded FIRST to update App.vue's hiddenLayersConfig
      // This will also change mode to 'training' and set isPaused=true
      this.$emit('architecture-loaded', hiddenLayers)

      // Wait a tick for the prop to update, then initialize with correct architecture
      await this.$nextTick()

      // Always reinitialize unifiedDQN to match checkpoint architecture
      // (existing instance may have different layer dimensions)
      // Note: initUnifiedDQN() handles disposal of existing instance internally
      // Pass hiddenLayers directly to avoid relying on parent prop update timing
      await this.initUnifiedDQN(hiddenLayers)

      // Load checkpoint into newly initialized agent
      const agent = this.unifiedDQN
      if (agent) {
        const success = agent.loadCheckpoint(json)
        if (success) {
          console.log('[GameCanvas] Checkpoint loaded successfully')
        }
      }

      // Ensure agent respects the current pause state
      // (isPaused was set to true before unifiedDQN existed, so the watcher had no effect)
      if (this.isPaused && this.unifiedDQN) {
        this.setPaused(true)
      }
    },

    // ===== External Accessors =====
    setAction(action: GameAction) {
      this.pendingAction = action
    },

    getObservation(): number[] {
      return this.engine?.getObservation() || []
    },

    layersEqual(a: number[], b: number[]): boolean {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
      }
      return true
    },
  },
})
</script>

<style scoped>
.game-canvas-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  position: relative;
  touch-action: none;
}

.game-canvas {
  width: 100%;
  max-width: 900px;
  max-height: min(90vh, 820px);
  height: auto;
  aspect-ratio: 288 / 512; /* GameConfig.WIDTH / HEIGHT */
  border-radius: var(--radius-lg);
  box-shadow: 0 0 40px rgba(0, 217, 255, 0.15);
  /* image-rendering: pixelated; */
  image-rendering: crisp-edges;
  cursor: pointer;
  object-fit: contain;
}

.touch-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: bounce 1s ease-in-out infinite;
  pointer-events: none;
}

.touch-icon {
  font-size: 2rem;
}

.touch-text {
  font-family: var(--font-display);
  font-size: 0.6rem;
  color: var(--color-text);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

@keyframes bounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-10px); }
}

.fast-mode-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #0a1628 0%, #1a2a4a 100%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 2rem;
  pointer-events: none;
  overflow-y: auto;
  border-radius: var(--radius-lg);
}

.fast-mode-content {
  text-align: center;
  max-width: 90%;
}

.fast-header {
  margin-bottom: 1.5rem;
}

.fast-icon {
  font-size: 3rem;
  animation: pulse 1s ease-in-out infinite;
}

.fast-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-accent);
  letter-spacing: 0.2em;
  margin-top: 0.5rem;
}

.fast-subtitle {
  font-size: 1rem;
  color: var(--color-text);
  margin-top: 0.25rem;
}

.fast-backend {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.dqn-workflow-img {
  max-width: 100%;
  max-height: 50vh;
  width: auto;
  height: auto;
  border-radius: 8px;
  opacity: 0.95;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}
</style>
