<template>
  <div class="control-panel panel">
    <div class="panel-header">
      <span class="panel-title">{{ currentMode === 'eval' ? 'Evaluation Controls' : 'Training Controls' }}</span>
      <div class="header-actions">
        <!-- Backend indicator -->
        <span
          class="backend-badge"
          :class="backendClass"
          :title="backendSwitchTooltip"
          @click="cycleBackend"
        >
          {{ backendLabel }}
        </span>
        <button 
          class="btn-icon" 
          :class="{ active: isPaused }"
          @click="togglePause"
          :title="isPaused ? 'Resume' : 'Pause'"
        >
          {{ isPaused ? '▶' : '⏸' }}
        </button>
        <button
          class="btn-icon"
          :class="{ active: !frameLimit30 }"
          :disabled="numInstances > maxVisualized"
          @click="toggleFrameLimitButton"
          :title="numInstances > maxVisualized ? 'Only available with visualization' : (frameLimit30 ? 'Cap at 30 FPS' : 'Fast forward (uncapped)')"
        >
          <span class="ff-icon">>></span>
        </button>
      </div>
    </div>

    <!-- Mode Switcher -->
    <div class="mode-switcher">
      <button 
        class="mode-btn" 
        :class="{ active: currentMode === 'training' || currentMode === 'configuring' }"
        @click="setMode('training')"
      >
        🎓 Train
      </button>
      <button 
        class="mode-btn" 
        :class="{ active: currentMode === 'eval' }"
        @click="setMode('eval')"
        :disabled="!hasModel"
        :title="!hasModel ? 'Start training or load a checkpoint first' : 'Evaluate the trained model'"
      >
        🎯 Eval
      </button>
    </div>

    <div class="controls-body">
      <!-- Instance Count Selector (shown in all modes) -->
      <div class="control-group">
        <label class="control-label" :title="instanceCountTooltip">
          <span>Parallel Instances</span>
          <span class="control-value" :class="{ 'instances-high': numInstances > 16 }">
            {{ numInstances }}
          </span>
        </label>
        <div class="instance-selector">
          <button 
            v-for="count in evalInstanceOptions" 
            :key="count"
            class="instance-btn"
            :class="{ 
              active: numInstances === count,
              'no-viz': count > maxVisualized 
            }"
            :disabled="instanceSelectorDisabled"
            @click="selectInstances(count)"
          >
            {{ count }}
          </button>
        </div>
        <div class="instance-hint">
          <span v-if="numInstances <= maxVisualized" class="hint-viz">
            ✓ {{ numInstances === 1 ? 'Full view' : `${getGridLayout(numInstances)} grid` }}
          </span>
          <span v-else class="hint-no-viz">
            ⚡ {{ currentMode === 'eval' ? 'Eval' : 'Training' }} only (no visualization)
          </span>
        </div>
      </div>

      <!-- Frame limit toggle (shown when visualization possible) -->
      <div class="control-group" v-if="numInstances <= maxVisualized">
        <label class="toggle-label small frame-limit-toggle" :title="frameLimitTooltip">
          <input
            type="checkbox"
            :checked="frameLimit30"
            @change="toggleFrameLimit"
          />
          <span>🎬 Limit to 30 FPS</span>
        </label>
      </div>

      <!-- Eval Mode Info (shown only in eval mode) -->
      <div v-if="currentMode === 'eval'" class="eval-info-box">
        <div class="eval-info-header">
          <span class="eval-icon">🎯</span>
          <span>Evaluation Mode</span>
        </div>
        
        <div class="eval-content-wrapper">
          <div class="eval-text-group">
            <p class="eval-info-text">Pipe gaps shrink as you progress</p>
            <p class="eval-info-text">Running fully greedy (ε=0)</p>
            <p class="eval-info-text">No exploration, no training</p>
            <p class="eval-status" v-if="isPaused">⏸ Paused</p>
          </div>

          <div 
            v-if="gapSizeLabel" 
            class="gap-pill gap-vertical" 
            :title="'Pipe gap size'"
          >
            <span class="gap-label">Pipe gap</span>
            <span class="gap-value">{{ gapSizeLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Training-only controls (hidden in eval mode) -->
      <template v-if="currentMode !== 'eval'">
        <!-- Epsilon Control -->
        <div class="control-group">
          <label class="control-label" :title="epsilonTooltip">
            <span>Exploration (ε)</span>
            <span class="control-value">{{ epsilon.toFixed(3) }}</span>
          </label>
          <input
            type="range"
            class="form-range"
            :value="epsilon"
            min="0"
            max="1"
            step="0.01"
            @input="updateEpsilon"
            :disabled="currentMode !== 'training' && currentMode !== 'configuring'"
          />
          <div class="control-hint">
            <label class="toggle-label small">
              <input
                type="checkbox"
                :checked="autoDecay"
                @change="toggleAutoDecay"
                :disabled="currentMode !== 'training' && currentMode !== 'configuring'"
              />
              <span>Auto-decay</span>
            </label>
            <span class="hint-text" v-if="!autoDecay">Manual</span>
          </div>
        </div>

        <!-- Epsilon Decay Rate -->
        <div class="control-group" v-if="autoDecay">
          <label class="control-label" :title="decayRateTooltip">
            <span>Decay Rate</span>
            <span class="control-value">{{ formatDecaySteps(epsilonDecaySteps) }}</span>
          </label>
          <input
            type="range"
            class="form-range"
            :value="epsilonDecaySteps"
            min="100000"
            max="2000000"
            step="50000"
            @input="updateEpsilonDecaySteps"
            :disabled="currentMode !== 'training' && currentMode !== 'configuring'"
          />
          <span class="hint-text">Steps to reach minimum ε</span>
        </div>

        <!-- Learning Rate -->
        <div class="control-group">
          <label class="control-label" :title="learningRateTooltip">
            <span>Learning Rate</span>
            <span class="control-value" :class="{ 'lr-auto': lrScheduler }">{{ formatLearningRate(learningRate) }}</span>
          </label>
          <input
            type="range"
            class="form-range"
            :value="learningRate"
            min="0.00001"
            max="0.002"
            step="0.00001"
            @input="updateLearningRate"
            :disabled="(currentMode !== 'training' && currentMode !== 'configuring') || lrScheduler"
          />
          <div class="control-hint">
            <label class="toggle-label small">
              <input
                type="checkbox"
                :checked="lrScheduler"
                @change="toggleLRScheduler"
                :disabled="currentMode !== 'training' && currentMode !== 'configuring'"
              />
              <span>Auto-schedule</span>
            </label>
            <span class="hint-text" v-if="lrScheduler">Reduces on plateau</span>
            <span class="hint-text" v-else>Manual</span>
          </div>
        </div>

        <!-- Rewards Section -->
        <div class="control-section">
          <div class="section-header">Rewards</div>
          
          <!-- Pass Pipe Reward -->
          <div class="control-group compact">
            <label class="control-label" :title="passPipeTooltip">
              <span>Pass Pipe</span>
              <span class="control-value positive">+{{ passPipeReward.toFixed(1) }}</span>
            </label>
            <input
              type="range"
              class="form-range"
              :value="passPipeReward"
              min="0.1"
              max="5"
              step="0.1"
              @input="updatePassPipeReward"
            />
          </div>

          <!-- Death Penalty -->
          <div class="control-group compact">
            <label class="control-label" :title="deathPenaltyTooltip">
              <span>Death Penalty</span>
              <span class="control-value negative">{{ deathPenalty.toFixed(1) }}</span>
            </label>
            <input
              type="range"
              class="form-range"
              :value="Math.abs(deathPenalty)"
              min="0.1"
              max="5"
              step="0.1"
              @input="updateDeathPenalty"
            />
          </div>

          <!-- Step Penalty -->
          <div class="control-group compact">
            <label class="control-label" :title="stepPenaltyTooltip">
              <span>Step Cost</span>
              <span class="control-value negative">{{ stepPenalty.toFixed(3) }}</span>
            </label>
            <input
              type="range"
              class="form-range"
              :value="Math.abs(stepPenalty)"
              min="0"
              max="0.1"
              step="0.005"
              @input="updateStepPenalty"
            />
          </div>

          <!-- Center Reward (Dense Shaping) -->
          <div class="control-group compact">
            <label class="control-label" :title="centerBonusTooltip">
              <span>Center Bonus</span>
              <span class="control-value" :class="{ positive: centerReward > 0 }">
                {{ centerReward > 0 ? '+' : '' }}{{ centerReward.toFixed(2) }}
              </span>
            </label>
            <input
              type="range"
              class="form-range"
              :value="centerReward"
              min="0"
              max="1"
              step="0.05"
              @input="updateCenterReward"
            />
            <span class="control-hint-text">Reward for moving toward pipe gap</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Reset button (training only) -->
    <div class="control-actions" v-if="currentMode !== 'eval'">
      <button class="btn btn-danger btn-small" @click="resetTraining">
        🔄 Reset Training
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import type { BackendType } from '@/rl/backendUtils'

// Valid instance counts (4x growth)
const INSTANCE_OPTIONS = [1, 4, 16, 64, 256, 1024] as const
const EVAL_INSTANCE_OPTIONS = [1, 4, 16, 64] as const  // Eval limited to max 64
const MAX_VISUALIZED = 16

export default defineComponent({
  name: 'ControlPanel',
  props: {
    epsilon: {
      type: Number,
      default: 0.5,
    },
    learningRate: {
      type: Number,
      default: 0.001,
    },
    passPipeReward: {
      type: Number,
      default: 1.0,
    },
    deathPenalty: {
      type: Number,
      default: -1.0,
    },
    stepPenalty: {
      type: Number,
      default: -0.01,
    },
    centerReward: {
      type: Number,
      default: 0.15,
    },
    numInstances: {
      type: Number,
      default: 1,
    },
    backend: {
      type: String as PropType<BackendType>,
      default: 'cpu',
    },
    availableBackends: {
      type: Array as PropType<BackendType[]>,
      default: () => [],
    },
    frameLimit30: {
      type: Boolean,
      default: false,
    },
    autoDecay: {
      type: Boolean,
      default: true,
    },
    lrScheduler: {
      type: Boolean,
      default: false,
    },
    epsilonDecaySteps: {
      type: Number,
      default: 200000,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    currentMode: {
      type: String as () => 'configuring' | 'training' | 'eval' | 'manual',
      default: 'training',
    },
    evalStats: {
      type: Object as PropType<{ min: number; max: number; avg: number; count: number } | null>,
      default: null,
    },
    evalComplete: {
      type: Boolean,
      default: false,
    },
    hasModel: {
      type: Boolean,
      default: false,
    },
    currentGapSize: {
      type: Number as PropType<number | null>,
      default: null,
    },
  },
  emits: [
    'update:epsilon',
    'update:learningRate',
    'update:epsilonDecaySteps',
    'update:passPipeReward',
    'update:deathPenalty',
    'update:stepPenalty',
    'update:centerReward',
    'update:frameLimit30',
    'update:numInstances',
    'update:autoDecay',
    'update:lrScheduler',
    'update:isPaused',
    'update:mode',
    'cycle-backend',
    'reset',
    'restartEval',
  ],
  data() {
    return {
      instanceOptions: INSTANCE_OPTIONS,
      evalInstanceOptionsData: EVAL_INSTANCE_OPTIONS,
      maxVisualized: MAX_VISUALIZED,
    }
  },
  computed: {
    evalInstanceOptions(): readonly number[] {
      // In eval mode, use the limited eval options (max 100)
      if (this.currentMode === 'eval') {
        return this.evalInstanceOptionsData
      }
      return this.instanceOptions
    },
    instanceSelectorDisabled(): boolean {
      // Disable instance selector during active eval (not paused, not complete)
      return this.currentMode === 'eval' && !this.isPaused && !this.evalComplete
    },
    backendLabel(): string {
      const labels: Record<BackendType, string> = {
        webgpu: 'WebGPU',
        webgl: 'WebGL',
        cpu: 'CPU',
      }
      return labels[this.backend] || 'CPU'
    },
    backendClass(): string {
      return `backend-${this.backend}`
    },
    backendTooltip(): string {
      const tooltips: Record<BackendType, string> = {
        webgpu: 'Using WebGPU (fastest, modern GPUs)',
        webgl: 'Using WebGL (GPU accelerated)',
        cpu: 'Using CPU (no GPU acceleration)',
      }
      return tooltips[this.backend] || 'Computing backend'
    },
    backendSwitchTooltip(): string {
      if (!this.availableBackends || this.availableBackends.length <= 1) {
        return this.backendTooltip
      }
      return `${this.backendTooltip}\nClick to cycle available backends`
    },
    instanceCountTooltip(): string {
      return `Parallel Instances: Number of game environments running simultaneously.

• 1-16: Training with visualization
• 64-1024: Maximum speed training (no visualization)

More instances = more diverse experience = faster learning`
    },
    epsilonTooltip(): string {
      return `Exploration Rate (ε): Probability of taking a random action.

• Higher (0.5-1.0): More exploration
• Lower (0.05-0.2): More exploitation`
    },
    decayRateTooltip(): string {
      return `Steps to reduce ε from start to minimum.`
    },
    learningRateTooltip(): string {
      return `How much the network adjusts on each training step.`
    },
    passPipeTooltip(): string {
      return `Reward for passing through a pipe gap.`
    },
    deathPenaltyTooltip(): string {
      return `Penalty for hitting a pipe or ground.`
    },
    stepPenaltyTooltip(): string {
      return `Small cost per game step to encourage efficiency.`
    },
    centerBonusTooltip(): string {
      return `Bonus for being close to pipe gap center.`
    },
    frameLimitTooltip(): string {
      return `When enabled and visualization is on, cap the game loop to 30 FPS so the on-screen animation matches intended speed. Training is paced accordingly while visualizing.`
    },
    gapSizeLabel(): string | null {
      if (this.currentGapSize === null || this.currentGapSize === undefined) {
        return null
      }
      return `${Math.round(this.currentGapSize)} px`
    },
  },
  methods: {
    selectInstances(count: number) {
      this.$emit('update:numInstances', count)
    },
    getGridLayout(count: number): string {
      if (count === 1) return '1x1'
      if (count <= 4) return '2x2'
      if (count <= 16) return '4x4'
      return `${Math.sqrt(count)}x${Math.sqrt(count)}`
    },
    updateEpsilon(event: Event) {
      const value = parseFloat((event.target as HTMLInputElement).value)
      this.$emit('update:epsilon', value)
    },
    updateLearningRate(event: Event) {
      const raw = parseFloat((event.target as HTMLInputElement).value)
      const lr = Math.max(0.00001, Math.min(0.002, raw))
      this.$emit('update:learningRate', lr)
    },
    updatePassPipeReward(event: Event) {
      const value = parseFloat((event.target as HTMLInputElement).value)
      this.$emit('update:passPipeReward', value)
    },
    updateDeathPenalty(event: Event) {
      const value = -parseFloat((event.target as HTMLInputElement).value)
      this.$emit('update:deathPenalty', value)
    },
    updateStepPenalty(event: Event) {
      const value = -parseFloat((event.target as HTMLInputElement).value)
      this.$emit('update:stepPenalty', value)
    },
    updateCenterReward(event: Event) {
      const value = parseFloat((event.target as HTMLInputElement).value)
      this.$emit('update:centerReward', value)
    },
    toggleFrameLimit(event: Event) {
      const checked = (event.target as HTMLInputElement).checked
      this.$emit('update:frameLimit30', checked)
    },
    toggleFrameLimitButton() {
      this.$emit('update:frameLimit30', !this.frameLimit30)
    },
    cycleBackend() {
      const list = this.availableBackends && this.availableBackends.length > 0
        ? this.availableBackends
        : ['webgpu', 'webgl', 'cpu']
      if (list.length === 0) return
      const idx = list.indexOf(this.backend as BackendType)
      const next = list[(idx + 1) % list.length]
      this.$emit('cycle-backend', next)
    },
    toggleAutoDecay(event: Event) {
      const checked = (event.target as HTMLInputElement).checked
      this.$emit('update:autoDecay', checked)
    },
    toggleLRScheduler(event: Event) {
      const checked = (event.target as HTMLInputElement).checked
      this.$emit('update:lrScheduler', checked)
    },
    updateEpsilonDecaySteps(event: Event) {
      const value = parseInt((event.target as HTMLInputElement).value)
      this.$emit('update:epsilonDecaySteps', value)
    },
    formatDecaySteps(steps: number): string {
      if (steps >= 1000000) {
        return `${(steps / 1000000).toFixed(1)}M`
      }
      return `${(steps / 1000).toFixed(0)}K`
    },
    formatLearningRate(lr: number): string {
      return lr.toExponential(1)
    },
    togglePause() {
      this.$emit('update:isPaused', !this.isPaused)
    },
    setMode(mode: 'training' | 'eval' | 'manual') {
      this.$emit('update:mode', mode)
    },
    resetTraining() {
      if (confirm('Reset all training progress? This cannot be undone.')) {
        this.$emit('reset')
      }
    },
    restartEval() {
      this.$emit('restartEval')
    },
  },
})
</script>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  flex: 0 0 50%;
  min-width: 50%;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.backend-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.backend-webgpu {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: white;
}

.backend-webgl {
  background: linear-gradient(135deg, #059669, #10b981);
  color: white;
}

.backend-cpu {
  background: var(--color-bg-light);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}

.btn-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background: var(--color-bg-mid);
  color: var(--color-text);
}

.btn-icon.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-bg-dark);
}

.ff-icon {
  font-weight: 700;
  font-size: 0.9rem;
  line-height: 1;
}

.mode-switcher {
  display: flex;
  gap: 4px;
  background: var(--color-bg-light);
  padding: 4px;
  border-radius: var(--radius-md);
}

.mode-btn {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-bg-mid);
}

.mode-btn.active {
  background: var(--color-primary);
  color: var(--color-bg-dark);
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* Instance selector styles */
.instance-selector {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.instance-btn {
  flex: 1;
  min-width: 48px;
  padding: 6px 8px;
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.instance-btn:hover:not(:disabled) {
  background: var(--color-bg-mid);
  color: var(--color-text);
  border-color: var(--color-primary);
}

.instance-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-bg-dark);
}

.instance-btn.no-viz {
  border-style: dashed;
}

.instance-btn.active.no-viz {
  background: linear-gradient(135deg, var(--color-accent), #ff9f43);
  border-style: solid;
}

.instance-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.instance-hint {
  font-size: 0.7rem;
  margin-top: 4px;
}

.hint-viz {
  color: var(--color-success);
}

.hint-no-viz {
  color: var(--color-accent);
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.section-header {
  font-family: var(--font-display);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-group.compact {
  gap: 4px;
}

.control-group.compact .control-label {
  font-size: 0.8rem;
}

.control-group.compact .form-range {
  height: 4px;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.control-value {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--color-primary);
  background: rgba(0, 217, 255, 0.1);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.control-value.instances-high {
  color: var(--color-accent);
  background: rgba(255, 215, 0, 0.15);
}

.control-value.lr-auto {
  color: var(--color-accent);
  background: rgba(255, 215, 0, 0.15);
  animation: lr-pulse 2s ease-in-out infinite;
}

@keyframes lr-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.control-value.positive {
  color: var(--color-success);
  background: rgba(0, 255, 136, 0.1);
}

.control-value.negative {
  color: var(--color-danger);
  background: rgba(255, 107, 157, 0.1);
}

.control-hint-text {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.control-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hint-text {
  font-size: 0.7rem;
  color: var(--color-accent);
  text-transform: uppercase;
}

.toggle-label.small {
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  cursor: pointer;
}

.toggle-label.small input {
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
}

.control-actions {
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.btn-danger {
  background: rgba(255, 82, 82, 0.2);
  border-color: #ff5252;
  color: #ff5252;
}

.btn-danger:hover {
  background: #ff5252;
  color: var(--color-bg-dark);
}

.btn-small {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 0.8rem;
  width: 100%;
}

.form-range:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Eval mode info box */
.eval-info-box {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.1), rgba(0, 217, 255, 0.05));
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.eval-info-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-family: var(--font-display);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
  margin-bottom: var(--spacing-sm);
}

.eval-icon {
  font-size: 1.1rem;
}

.eval-info-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 2px 0;
  line-height: 1.3;
  padding-left: 0.5rem;
}

.eval-content-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.eval-text-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.gap-pill {
  margin-left: auto;
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.4);
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: 0.72rem;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.gap-vertical {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 80px;
}

.gap-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gap-value {
  font-size: 0.9rem;
  font-weight: 700;
}

.eval-status {
  font-size: 0.8rem;
  color: var(--color-accent);
  font-weight: 600;
  margin-top: var(--spacing-sm);
  padding-left: 0.5rem;
}

/* Eval results section */
.eval-results {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid rgba(0, 217, 255, 0.2);
}

.eval-results-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--spacing-sm);
}

.eval-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.eval-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-dark);
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.eval-stat-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.eval-stat-value {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-primary);
}

.btn-eval-restart {
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid rgba(0, 217, 255, 0.4);
  border-radius: var(--radius-sm);
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-eval-restart:hover {
  background: rgba(0, 217, 255, 0.25);
  border-color: var(--color-primary);
}

/* Frame limit toggle styling */
.frame-limit-toggle {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.frame-limit-toggle:hover {
  border-color: var(--color-primary);
}
</style>
