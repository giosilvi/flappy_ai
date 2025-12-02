<template>
  <div class="metrics-panel panel">
    <div class="panel-header">
      <span>Training Metrics</span>
      <span class="header-badge" v-if="isTraining">
        <span class="pulse-dot"></span>
        Live
      </span>
    </div>

    <!-- Primary Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric">
        <span class="metric-label">Epsilon (ε)</span>
        <span class="metric-value">{{ epsilon.toFixed(3) }}</span>
        <div class="metric-bar">
          <div class="metric-bar-fill epsilon" :style="{ width: `${epsilon * 100}%` }"></div>
        </div>
      </div>

      <div class="metric">
        <span class="metric-label">Avg Reward</span>
        <span class="metric-value" :class="avgRewardClass">
          {{ avgReward >= 0 ? '+' : '' }}{{ avgReward.toFixed(2) }}
        </span>
      </div>

      <div class="metric">
        <span class="metric-label">Loss</span>
        <span class="metric-value">{{ formatLoss(loss) }}</span>
      </div>

      <div class="metric">
        <span class="metric-label">Steps/sec</span>
        <span class="metric-value" :class="speedClass">{{ stepsPerSecond.toFixed(0) }}</span>
      </div>
    </div>

    <!-- Secondary Metrics -->
    <div class="metrics-secondary">
      <div class="secondary-metric">
        <span class="secondary-label">Buffer</span>
        <span class="secondary-value">{{ formatNumber(bufferSize) }}</span>
      </div>
      <div class="secondary-metric">
        <span class="secondary-label">Total Steps</span>
        <span class="secondary-value">{{ formatNumber(totalSteps) }}</span>
      </div>
      <div class="secondary-metric">
        <span class="secondary-label">Avg Length</span>
        <span class="secondary-value">{{ avgLength.toFixed(0) }}</span>
      </div>
    </div>

    <!-- Episode Reward Chart -->
    <div class="metrics-chart" v-if="episodeRewardHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">Episode Rewards</span>
        <span class="chart-range">Last {{ episodeRewardHistory.length }} episodes</span>
      </div>
      <canvas ref="episodeChartCanvas" class="chart-canvas"></canvas>
    </div>

    <!-- Average Reward Chart -->
    <div class="metrics-chart" v-if="avgRewardHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">Average Reward</span>
        <span class="chart-range">Moving avg (50 episodes)</span>
      </div>
      <canvas ref="avgChartCanvas" class="chart-canvas"></canvas>
    </div>

    <!-- Full Training History Chart -->
    <div class="metrics-chart metrics-chart-full" v-if="fullHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">📈 Training Progress</span>
        <span class="chart-range">Full session</span>
      </div>
      <canvas ref="fullHistoryCanvas" class="chart-canvas chart-canvas-large"></canvas>
      <div class="chart-stats">
        <span class="chart-stat">
          <span class="stat-label">Peak</span>
          <span class="stat-value text-success">{{ peakReward.toFixed(2) }}</span>
        </span>
        <span class="chart-stat">
          <span class="stat-label">Current Avg</span>
          <span class="stat-value" :class="currentTrendClass">{{ currentSmoothedReward.toFixed(2) }}</span>
        </span>
        <span class="chart-stat">
          <span class="stat-label">Trend</span>
          <span class="stat-value" :class="trendClass">{{ trendIndicator }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'MetricsPanel',
  props: {
    epsilon: {
      type: Number,
      default: 1.0,
    },
    avgReward: {
      type: Number,
      default: 0,
    },
    episodeReward: {
      type: Number,
      default: 0,
    },
    loss: {
      type: Number,
      default: 0,
    },
    episode: {
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
    bufferSize: {
      type: Number,
      default: 0,
    },
    totalSteps: {
      type: Number,
      default: 0,
    },
    avgLength: {
      type: Number,
      default: 0,
    },
    isTraining: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      episodeRewardHistory: [] as number[],
      avgRewardHistory: [] as number[],
      fullHistory: [] as number[],  // Full training history (smoothed averages)
      fullHistoryEpisodeCount: 0,  // Track actual episodes covered
      maxHistoryLength: 100,
      maxFullHistoryLength: 10000,  // Keep up to 10k data points
      smoothingWindow: 10,  // Smooth every N episodes for full history
      pendingRewards: [] as number[],  // Buffer for smoothing
    }
  },
  computed: {
    avgRewardClass(): string {
      if (this.avgReward > 0) return 'text-success'
      if (this.avgReward < -0.5) return 'text-danger'
      return 'text-muted'
    },
    speedClass(): string {
      if (this.stepsPerSecond > 100) return 'text-success'
      if (this.stepsPerSecond > 50) return 'text-primary'
      return 'text-muted'
    },
    peakReward(): number {
      if (this.fullHistory.length === 0) return 0
      return Math.max(...this.fullHistory)
    },
    currentSmoothedReward(): number {
      if (this.fullHistory.length === 0) return 0
      // Average of last 10 points
      const recent = this.fullHistory.slice(-10)
      return recent.reduce((a, b) => a + b, 0) / recent.length
    },
    trendIndicator(): string {
      if (this.fullHistory.length < 20) return '—'
      const recent = this.fullHistory.slice(-10)
      const older = this.fullHistory.slice(-20, -10)
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
      const diff = recentAvg - olderAvg
      if (diff > 0.1) return '↑ Improving'
      if (diff < -0.1) return '↓ Declining'
      return '→ Stable'
    },
    trendClass(): string {
      if (this.trendIndicator.startsWith('↑')) return 'text-success'
      if (this.trendIndicator.startsWith('↓')) return 'text-danger'
      return 'text-muted'
    },
    currentTrendClass(): string {
      if (this.currentSmoothedReward > 0) return 'text-success'
      if (this.currentSmoothedReward < -0.3) return 'text-danger'
      return 'text-muted'
    },
  },
  watch: {
    episode(newVal: number, oldVal: number) {
      // Only add to history when episode changes
      if (newVal !== oldVal && newVal > 0) {
        // Store episode reward for immediate feedback
        this.episodeRewardHistory.push(this.episodeReward)
        if (this.episodeRewardHistory.length > this.maxHistoryLength) {
          this.episodeRewardHistory.shift()
        }
        
        // Store average reward for trend
        this.avgRewardHistory.push(this.avgReward)
        if (this.avgRewardHistory.length > this.maxHistoryLength) {
          this.avgRewardHistory.shift()
        }

        // Add to full history (smoothed)
        this.pendingRewards.push(this.avgReward)
        this.fullHistoryEpisodeCount++
        if (this.pendingRewards.length >= this.smoothingWindow) {
          // Compute smoothed average and add to full history
          const smoothed = this.pendingRewards.reduce((a, b) => a + b, 0) / this.pendingRewards.length
          this.fullHistory.push(smoothed)
          this.pendingRewards = []
          
          // Downsample if history gets too long
          if (this.fullHistory.length > this.maxFullHistoryLength) {
            this.downsampleHistory()
          }
        }
        
        this.$nextTick(() => this.drawCharts())
      }
    },
  },
  mounted() {
    this.drawCharts()
    window.addEventListener('resize', this.drawCharts)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.drawCharts)
  },
  methods: {
    formatLoss(loss: number): string {
      if (loss === 0) return '0.0000'
      if (loss < 0.0001) return loss.toExponential(2)
      return loss.toFixed(4)
    },
    formatNumber(n: number): string {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
      return n.toString()
    },
    drawCharts() {
      // Draw episode rewards chart (cyan)
      this.drawChartOnCanvas(
        this.$refs.episodeChartCanvas as HTMLCanvasElement,
        this.episodeRewardHistory,
        { r: 0, g: 217, b: 255 } // cyan
      )
      
      // Draw average rewards chart (green)
      this.drawChartOnCanvas(
        this.$refs.avgChartCanvas as HTMLCanvasElement,
        this.avgRewardHistory,
        { r: 0, g: 255, b: 136 } // green
      )

      // Draw full history chart (gold/orange)
      this.drawChartOnCanvas(
        this.$refs.fullHistoryCanvas as HTMLCanvasElement,
        this.fullHistory,
        { r: 255, g: 183, b: 77 }, // gold
        true // larger chart
      )
    },
    
    downsampleHistory() {
      // Reduce history by half by averaging pairs
      const newHistory: number[] = []
      for (let i = 0; i < this.fullHistory.length - 1; i += 2) {
        newHistory.push((this.fullHistory[i] + this.fullHistory[i + 1]) / 2)
      }
      this.fullHistory = newHistory
      // Double the smoothing window so future points represent same time scale
      this.smoothingWindow *= 2
    },
    
    drawChartOnCanvas(
      canvas: HTMLCanvasElement | undefined,
      values: number[],
      color: { r: number; g: number; b: number },
      isLarge: boolean = false
    ) {
      if (!canvas || values.length < 2) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size with device pixel ratio for sharpness
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const height = isLarge ? 140 : 100
      canvas.width = rect.width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const totalWidth = rect.width
      
      // Reserve space for Y axis labels
      const yAxisWidth = 40
      const chartWidth = totalWidth - yAxisWidth

      // Clear
      ctx.clearRect(0, 0, totalWidth, height)

      // Find min/max with padding
      const dataMin = Math.min(...values)
      const dataMax = Math.max(...values)
      const min = Math.min(dataMin, 0) - Math.abs(dataMin) * 0.1 - 0.1
      const max = Math.max(dataMax, 0) + Math.abs(dataMax) * 0.1 + 0.1
      const range = max - min || 1

      // Draw Y axis labels
      ctx.font = '10px var(--font-display)'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      
      // Draw max, mid, min labels
      const formatAxisLabel = (v: number) => {
        if (Math.abs(v) >= 100) return v.toFixed(0)
        if (Math.abs(v) >= 10) return v.toFixed(1)
        return v.toFixed(2)
      }
      
      ctx.fillText(formatAxisLabel(max), yAxisWidth - 4, 8)
      ctx.fillText(formatAxisLabel((max + min) / 2), yAxisWidth - 4, height / 2)
      ctx.fillText(formatAxisLabel(min), yAxisWidth - 4, height - 8)

      // Draw horizontal grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(yAxisWidth, 0)
      ctx.lineTo(totalWidth, 0)
      ctx.moveTo(yAxisWidth, height / 2)
      ctx.lineTo(totalWidth, height / 2)
      ctx.moveTo(yAxisWidth, height)
      ctx.lineTo(totalWidth, height)
      ctx.stroke()

      // Draw zero line if visible
      const zeroY = height - ((0 - min) / range) * height
      if (zeroY > 0 && zeroY < height) {
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.moveTo(yAxisWidth, zeroY)
        ctx.lineTo(totalWidth, zeroY)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Label zero line
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fillText('0', yAxisWidth - 4, zeroY)
      }

      const { r, g, b } = color

      // Draw gradient fill first
      ctx.beginPath()
      for (let i = 0; i < values.length; i++) {
        const x = yAxisWidth + (i / (values.length - 1)) * chartWidth
        const y = height - ((values[i] - min) / range) * height

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.lineTo(yAxisWidth + chartWidth, height)
      ctx.lineTo(yAxisWidth, height)
      ctx.closePath()

      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw line
      ctx.beginPath()
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (let i = 0; i < values.length; i++) {
        const x = yAxisWidth + (i / (values.length - 1)) * chartWidth
        const y = height - ((values[i] - min) / range) * height

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()

      // Draw current value dot
      if (values.length > 0) {
        const lastX = yAxisWidth + chartWidth
        const lastY = height - ((values[values.length - 1] - min) / range) * height
        ctx.beginPath()
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.fill()
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`
        ctx.lineWidth = 6
        ctx.stroke()
      }
    },
  },
})
</script>

<style scoped>
.metrics-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--color-success);
  letter-spacing: 0.05em;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-primary {
  background: var(--color-bg-light);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.metric-primary .metric-value {
  font-size: 1.25rem;
}

.metric-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-value {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--color-text);
}

.metric-bar {
  height: 4px;
  background: var(--color-bg-light);
  border-radius: 2px;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.metric-bar-fill.epsilon {
  background: linear-gradient(90deg, var(--color-success), var(--color-primary), var(--color-accent));
}

.metrics-secondary {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
}

.secondary-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.secondary-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.secondary-value {
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--color-text);
}

.metrics-chart {
  border-top: 1px solid var(--color-border);
  padding-top: var(--spacing-sm);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.chart-title {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.chart-range {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  opacity: 0.7;
}

.chart-canvas {
  width: 100%;
  height: 120px;
  border-radius: var(--radius-sm);
}

.chart-canvas-large {
  height: 160px;
}

.metrics-chart-full {
  background: linear-gradient(180deg, rgba(255, 183, 77, 0.05) 0%, transparent 100%);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.chart-stats {
  display: flex;
  justify-content: space-between;
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--color-border);
}

.chart-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 0.85rem;
}

.text-success {
  color: var(--color-success);
}

.text-danger {
  color: #ff5252;
}

.text-primary {
  color: var(--color-primary);
}

.text-accent {
  color: var(--color-accent);
}

.text-muted {
  color: var(--color-text-muted);
}
</style>
