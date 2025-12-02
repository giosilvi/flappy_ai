<template>
  <div class="status-bar panel">
    <div class="status-grid">
      <div class="status-item">
        <span class="status-label">Mode</span>
        <span class="status-value" :class="modeClass">{{ modeText }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Episode</span>
        <span class="status-value text-primary">{{ episode }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Score</span>
        <span class="status-value text-accent">{{ score }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Best</span>
        <span class="status-value text-success">{{ bestScore }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'StatusBar',
  props: {
    mode: {
      type: String as () => 'idle' | 'training' | 'eval' | 'manual',
      default: 'idle',
    },
    episode: {
      type: Number,
      default: 0,
    },
    score: {
      type: Number,
      default: 0,
    },
    bestScore: {
      type: Number,
      default: 0,
    },
    stepsPerSecond: {
      type: Number,
      default: 0,
    },
  },
  computed: {
    modeText(): string {
      const modes: Record<string, string> = {
        idle: 'Ready',
        training: 'Training',
        eval: 'Evaluating',
        manual: 'Manual',
      }
      return modes[this.mode] || 'Unknown'
    },
    modeClass(): string {
      return `mode-${this.mode}`
    },
  },
})
</script>

<style scoped>
.status-bar {
  padding: var(--spacing-md);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: var(--spacing-sm);
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.status-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
}

.status-value {
  font-family: var(--font-display);
  font-size: 0.85rem;
}

.mode-idle { color: var(--color-text-muted); }
.mode-training { color: var(--color-primary); }
.mode-eval { color: var(--color-success); }
.mode-manual { color: var(--color-accent); }
</style>









