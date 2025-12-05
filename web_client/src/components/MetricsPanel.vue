<template>
  <div class="metrics-panel panel">
    <div class="panel-header">
      <span>Training Metrics</span>
      <span class="header-badge header-badge-warmup" v-if="isWarmup && isTraining">
        <span class="pulse-dot warmup"></span>
        Warmup
      </span>
      <span class="header-badge" v-else-if="isTraining">
        <span class="pulse-dot"></span>
        Live
      </span>
    </div>

    <!-- Warmup Progress Bar -->
    <div class="warmup-indicator" v-if="isWarmup && isTraining">
      <div class="warmup-text">
        <span>🔥 Collecting experience before training...</span>
        <span class="warmup-progress-text">{{ formatNumber(bufferSize) }} / 10K</span>
      </div>
      <div class="warmup-bar">
        <div class="warmup-bar-fill" :style="{ width: `${Math.min(100, (bufferSize / 10000) * 100)}%` }"></div>
      </div>
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

    <!-- Combined Episode Rewards + Moving Average Chart -->
    <div class="metrics-chart" v-if="episodeRewardHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">Episode Rewards</span>
        <span class="chart-range">Last {{ episodeRewardHistory.length }} episodes</span>
      </div>
      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-color legend-cyan"></span>
          Interval Avg
        </span>
        <span class="legend-item">
          <span class="legend-color legend-green"></span>
          MA(50)
        </span>
      </div>
      <canvas ref="rewardChartCanvas" class="chart-canvas"></canvas>
    </div>

    <!-- Episode Length Chart -->
    <div class="metrics-chart" v-if="episodeLengthHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">Episode Length</span>
        <span class="chart-range">Last {{ episodeLengthHistory.length }} episodes</span>
      </div>
      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-color legend-magenta"></span>
          Interval Avg
        </span>
        <span class="legend-item">
          <span class="legend-color legend-purple"></span>
          MA(50)
        </span>
      </div>
      <canvas ref="lengthChartCanvas" class="chart-canvas"></canvas>
    </div>

    <!-- Full Training History Chart -->
    <div class="metrics-chart metrics-chart-full" v-if="fullLengthHistory.length > 1">
      <div class="chart-header">
        <span class="chart-title">📈 Training Progress</span>
        <span class="chart-range">Full session (smoothed over {{ smoothingWindow * 5 }}+ episodes)</span>
      </div>
      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-color legend-gold"></span>
          Avg Length
        </span>
      </div>
      <canvas ref="fullHistoryCanvas" class="chart-canvas chart-canvas-large"></canvas>
      <div class="chart-stats">
        <span class="chart-stat">
          <span class="stat-label">Peak Length</span>
          <span class="stat-value text-gold">{{ peakLength.toFixed(0) }}</span>
        </span>
        <span class="chart-stat">
          <span class="stat-label">Curr Length</span>
          <span class="stat-value" :class="currentLengthTrendClass">{{ currentSmoothedLength.toFixed(0) }}</span>
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
    episodeLength: {
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
    isWarmup: {
      type: Boolean,
      default: false,
    },
    // GPU mode specific props
    gpuMode: {
      type: Boolean,
      default: false,
    },
    recentRewardsFromWorker: {
      type: Array as () => number[],
      default: () => [],
    },
    recentAvgRewardsFromWorker: {
      type: Array as () => number[],
      default: () => [],
    },
    numBirds: {
      type: Number,
      default: 1,
    },
    gpuBackend: {
      type: String,
      default: 'cpu',
    },
    trainSteps: {
      type: Number,
      default: 0,
    },
  },
  data() {
    return {
      episodeRewardHistory: [] as number[],
      avgRewardHistory: [] as number[],
      episodeLengthHistory: [] as number[],
      avgLengthHistory: [] as number[],
      fullRewardHistory: [] as number[],  // Full training history (smoothed reward averages)
      fullLengthHistory: [] as number[],  // Full training history (smoothed length averages)
      fullHistoryEpisodeCount: 0,  // Track actual episodes covered
      maxHistoryLength: 100,
      maxFullHistoryLength: 10000,  // Keep up to 10k data points
      smoothingWindow: 10,  // Smooth every N episodes for full history
      pendingRewards: [] as number[],  // Buffer for smoothing rewards
      pendingLengths: [] as number[],  // Buffer for smoothing lengths
      movingAvgWindow: 50,  // Window size for moving average over interval data points
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
    peakLength(): number {
      if (this.fullLengthHistory.length === 0) return 0
      return Math.max(...this.fullLengthHistory)
    },
    currentSmoothedLength(): number {
      if (this.fullLengthHistory.length === 0) return 0
      // Average of last 10 points
      const recent = this.fullLengthHistory.slice(-10)
      return recent.reduce((a, b) => a + b, 0) / recent.length
    },
    currentLengthTrendClass(): string {
      // Length trend - higher is better
      if (this.fullLengthHistory.length < 2) return 'text-muted'
      const recent = this.fullLengthHistory.slice(-5)
      const older = this.fullLengthHistory.slice(-10, -5)
      if (older.length === 0) return 'text-muted'
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
      if (recentAvg > olderAvg * 1.1) return 'text-success'
      if (recentAvg < olderAvg * 0.9) return 'text-danger'
      return 'text-muted'
    },
    gpuBackendLabel(): string {
      if (this.gpuBackend === 'webgpu') return 'WebGPU'
      if (this.gpuBackend === 'webgl') return 'WebGL'
      return 'CPU'
    },
    gpuBackendClass(): string {
      if (this.gpuBackend === 'webgpu') return 'backend-webgpu'
      if (this.gpuBackend === 'webgl') return 'backend-webgl'
      return 'backend-cpu'
    },
  },
  watch: {
    episode(newVal: number, oldVal: number) {
      // Reset was triggered - clear all histories
      if (newVal === 0 && oldVal > 0) {
        this.episodeRewardHistory = []
        this.avgRewardHistory = []
        this.episodeLengthHistory = []
        this.avgLengthHistory = []
        this.fullRewardHistory = []
        this.fullLengthHistory = []
        this.fullHistoryEpisodeCount = 0
        this.pendingRewards = []
        this.pendingLengths = []
        this.smoothingWindow = 10  // Reset smoothing window
        this.$nextTick(() => this.drawCharts())
        return
      }
      
      // In GPU mode, we use worker-provided histories instead
      if (this.gpuMode) {
        return  // Let the worker history watchers handle it
      }
      
      // CPU mode: Only add to history when episode changes
      if (newVal !== oldVal && newVal > 0) {
        // Store interval average reward (average of episodes in last ~500ms)
        this.episodeRewardHistory.push(this.avgReward)
        if (this.episodeRewardHistory.length > this.maxHistoryLength) {
          this.episodeRewardHistory.shift()
        }
        
        // Calculate MA(50) from interval averages
        const rewardWindow = Math.min(this.movingAvgWindow, this.episodeRewardHistory.length)
        const recentRewards = this.episodeRewardHistory.slice(-rewardWindow)
        const movingAvgReward = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length
        this.avgRewardHistory.push(movingAvgReward)
        if (this.avgRewardHistory.length > this.maxHistoryLength) {
          this.avgRewardHistory.shift()
        }

        // Store interval average length (average of episodes in last ~500ms)
        this.episodeLengthHistory.push(this.avgLength)
        if (this.episodeLengthHistory.length > this.maxHistoryLength) {
          this.episodeLengthHistory.shift()
        }

        // Calculate MA(50) from interval averages
        const lengthWindow = Math.min(this.movingAvgWindow, this.episodeLengthHistory.length)
        const recentLengths = this.episodeLengthHistory.slice(-lengthWindow)
        const movingAvgLength = recentLengths.reduce((a, b) => a + b, 0) / recentLengths.length
        this.avgLengthHistory.push(movingAvgLength)
        if (this.avgLengthHistory.length > this.maxHistoryLength) {
          this.avgLengthHistory.shift()
        }

        // Add to full history (smoothed) - both rewards and lengths
        this.pendingRewards.push(this.avgReward)
        this.pendingLengths.push(this.avgLength)
        this.fullHistoryEpisodeCount++
        if (this.pendingRewards.length >= this.smoothingWindow) {
          // Compute smoothed averages and add to full history
          const smoothedReward = this.pendingRewards.reduce((a, b) => a + b, 0) / this.pendingRewards.length
          const smoothedLength = this.pendingLengths.reduce((a, b) => a + b, 0) / this.pendingLengths.length
          this.fullRewardHistory.push(smoothedReward)
          this.fullLengthHistory.push(smoothedLength)
          this.pendingRewards = []
          this.pendingLengths = []
          
          // Downsample if history gets too long
          if (this.fullRewardHistory.length > this.maxFullHistoryLength) {
            this.downsampleHistory()
          }
        }
        
        this.$nextTick(() => this.drawCharts())
      }
    },
    // Watch GPU mode reward histories from worker
    recentRewardsFromWorker: {
      handler(newVal: number[]) {
        if (!this.gpuMode || !newVal || newVal.length === 0) return
        
        // Replace local history with worker's history
        this.episodeRewardHistory = [...newVal]
        
        // Update full history for trend (using smoothing)
        if (newVal.length > 0) {
          // Take every N points to smooth
          const smoothStep = Math.max(1, Math.floor(newVal.length / 50))
          const smoothed: number[] = []
          for (let i = 0; i < newVal.length; i += smoothStep) {
            const chunk = newVal.slice(i, Math.min(i + smoothStep, newVal.length))
            const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length
            smoothed.push(avg)
          }
          this.fullHistory = smoothed
        }
        
        this.$nextTick(() => this.drawCharts())
      },
      deep: true,
    },
    recentAvgRewardsFromWorker: {
      handler(newVal: number[]) {
        if (!this.gpuMode || !newVal || newVal.length === 0) return
        
        // Replace local history with worker's history
        this.avgRewardHistory = [...newVal]
        this.$nextTick(() => this.drawCharts())
      },
      deep: true,
    },
    // Reset histories when switching GPU mode
    gpuMode(newVal: boolean, oldVal: boolean) {
      if (newVal !== oldVal) {
        this.episodeRewardHistory = []
        this.avgRewardHistory = []
        this.fullHistory = []
        this.fullHistoryEpisodeCount = 0
        this.pendingRewards = []
        this.smoothingWindow = 10
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
    formatAxisLabel(v: number): string {
      if (Math.abs(v) >= 100) return v.toFixed(0)
      if (Math.abs(v) >= 10) return v.toFixed(1)
      return v.toFixed(2)
    },
    drawCharts() {
      // Draw combined reward chart (cyan for raw, green for moving avg)
      this.drawDualLineChart(
        this.$refs.rewardChartCanvas as HTMLCanvasElement,
        this.episodeRewardHistory,
        this.avgRewardHistory,
        { r: 0, g: 217, b: 255 }, // cyan for raw
        { r: 0, g: 255, b: 136 }  // green for moving avg
      )
      
      // Draw episode length chart (magenta for raw, purple for moving avg)
      this.drawDualLineChart(
        this.$refs.lengthChartCanvas as HTMLCanvasElement,
        this.episodeLengthHistory,
        this.avgLengthHistory,
        { r: 255, g: 0, b: 170 },  // magenta for raw
        { r: 170, g: 100, b: 255 } // purple for moving avg
      )

      // Draw full history chart (gold for avg length only)
      this.drawChartOnCanvas(
        this.$refs.fullHistoryCanvas as HTMLCanvasElement,
        this.fullLengthHistory,
        { r: 255, g: 183, b: 77 }, // gold
        true // larger chart
      )
    },
    
    downsampleHistory() {
      // Reduce histories by half by averaging pairs
      const newRewardHistory: number[] = []
      const newLengthHistory: number[] = []
      for (let i = 0; i < this.fullRewardHistory.length - 1; i += 2) {
        newRewardHistory.push((this.fullRewardHistory[i] + this.fullRewardHistory[i + 1]) / 2)
        newLengthHistory.push((this.fullLengthHistory[i] + this.fullLengthHistory[i + 1]) / 2)
      }
      this.fullRewardHistory = newRewardHistory
      this.fullLengthHistory = newLengthHistory
      // Double the smoothing window so future points represent same time scale
      this.smoothingWindow *= 2
    },

    drawDualLineChart(
      canvas: HTMLCanvasElement | undefined,
      values1: number[],
      values2: number[],
      color1: { r: number; g: number; b: number },
      color2: { r: number; g: number; b: number },
    ) {
      if (!canvas || values1.length < 2) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size with device pixel ratio for sharpness
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const height = 100
      canvas.width = rect.width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const totalWidth = rect.width
      
      // Reserve space for Y axis labels
      const yAxisWidth = 40
      const chartWidth = totalWidth - yAxisWidth

      // Clear
      ctx.clearRect(0, 0, totalWidth, height)

      // Find min/max with padding across both datasets
      const allValues = [...values1, ...values2]
      const dataMin = Math.min(...allValues)
      const dataMax = Math.max(...allValues)
      const min = Math.min(dataMin, 0) - Math.abs(dataMin) * 0.1 - 0.1
      const max = Math.max(dataMax, 0) + Math.abs(dataMax) * 0.1 + 0.1
      const range = max - min || 1

      // Draw Y axis labels
      ctx.font = '10px var(--font-display)'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      
      // Draw max, mid, min labels
      ctx.fillText(this.formatAxisLabel(max), yAxisWidth - 4, 8)
      ctx.fillText(this.formatAxisLabel((max + min) / 2), yAxisWidth - 4, height / 2)
      ctx.fillText(this.formatAxisLabel(min), yAxisWidth - 4, height - 8)

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

      // Draw first line (raw values) with gradient fill
      const { r: r1, g: g1, b: b1 } = color1
      ctx.beginPath()
      for (let i = 0; i < values1.length; i++) {
        const x = yAxisWidth + (i / (values1.length - 1)) * chartWidth
        const y = height - ((values1[i] - min) / range) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineTo(yAxisWidth + chartWidth, height)
      ctx.lineTo(yAxisWidth, height)
      ctx.closePath()

      const gradient1 = ctx.createLinearGradient(0, 0, 0, height)
      gradient1.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, 0.15)`)
      gradient1.addColorStop(1, `rgba(${r1}, ${g1}, ${b1}, 0)`)
      ctx.fillStyle = gradient1
      ctx.fill()

      // Draw first line stroke
      ctx.beginPath()
      ctx.strokeStyle = `rgba(${r1}, ${g1}, ${b1}, 0.6)`
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (let i = 0; i < values1.length; i++) {
        const x = yAxisWidth + (i / (values1.length - 1)) * chartWidth
        const y = height - ((values1[i] - min) / range) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Draw second line (moving average) - bolder, on top
      if (values2.length >= 2) {
        const { r: r2, g: g2, b: b2 } = color2
        ctx.beginPath()
        ctx.strokeStyle = `rgb(${r2}, ${g2}, ${b2})`
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        for (let i = 0; i < values2.length; i++) {
          const x = yAxisWidth + (i / (values2.length - 1)) * chartWidth
          const y = height - ((values2[i] - min) / range) * height
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // Draw current value dot for moving average
        if (values2.length > 0) {
          const lastX = yAxisWidth + chartWidth
          const lastY = height - ((values2[values2.length - 1] - min) / range) * height
          ctx.beginPath()
          ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
          ctx.fillStyle = `rgb(${r2}, ${g2}, ${b2})`
          ctx.fill()
          ctx.strokeStyle = `rgba(${r2}, ${g2}, ${b2}, 0.5)`
          ctx.lineWidth = 6
          ctx.stroke()
        }
      }
    },

    drawDualAxisChart(
      canvas: HTMLCanvasElement | undefined,
      rewardValues: number[],
      lengthValues: number[],
      rewardColor: { r: number; g: number; b: number },
      lengthColor: { r: number; g: number; b: number },
    ) {
      if (!canvas || rewardValues.length < 2) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size with device pixel ratio for sharpness
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const height = 140
      canvas.width = rect.width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      const totalWidth = rect.width
      
      // Reserve space for Y axis labels on both sides
      const leftAxisWidth = 40
      const rightAxisWidth = 40
      const chartWidth = totalWidth - leftAxisWidth - rightAxisWidth

      // Clear
      ctx.clearRect(0, 0, totalWidth, height)

      // Calculate scales for each dataset independently
      const rewardMin = Math.min(...rewardValues, 0) - Math.abs(Math.min(...rewardValues)) * 0.1 - 0.1
      const rewardMax = Math.max(...rewardValues, 0) + Math.abs(Math.max(...rewardValues)) * 0.1 + 0.1
      const rewardRange = rewardMax - rewardMin || 1

      const lengthMin = 0 // Length starts at 0
      const lengthMax = Math.max(...lengthValues) * 1.1 + 10
      const lengthRange = lengthMax - lengthMin || 1

      // Draw left Y axis labels (reward - gold)
      const { r: rReward, g: gReward, b: bReward } = rewardColor
      ctx.font = '10px var(--font-display)'
      ctx.fillStyle = `rgba(${rReward}, ${gReward}, ${bReward}, 0.8)`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(this.formatAxisLabel(rewardMax), leftAxisWidth - 4, 8)
      ctx.fillText(this.formatAxisLabel((rewardMax + rewardMin) / 2), leftAxisWidth - 4, height / 2)
      ctx.fillText(this.formatAxisLabel(rewardMin), leftAxisWidth - 4, height - 8)

      // Draw right Y axis labels (length - teal)
      const { r: rLength, g: gLength, b: bLength } = lengthColor
      ctx.fillStyle = `rgba(${rLength}, ${gLength}, ${bLength}, 0.8)`
      ctx.textAlign = 'left'
      ctx.fillText(this.formatAxisLabel(lengthMax), totalWidth - rightAxisWidth + 4, 8)
      ctx.fillText(this.formatAxisLabel((lengthMax + lengthMin) / 2), totalWidth - rightAxisWidth + 4, height / 2)
      ctx.fillText(this.formatAxisLabel(lengthMin), totalWidth - rightAxisWidth + 4, height - 8)

      // Draw horizontal grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(leftAxisWidth, 0)
      ctx.lineTo(totalWidth - rightAxisWidth, 0)
      ctx.moveTo(leftAxisWidth, height / 2)
      ctx.lineTo(totalWidth - rightAxisWidth, height / 2)
      ctx.moveTo(leftAxisWidth, height)
      ctx.lineTo(totalWidth - rightAxisWidth, height)
      ctx.stroke()

      // Draw zero line for reward if visible
      const zeroY = height - ((0 - rewardMin) / rewardRange) * height
      if (zeroY > 0 && zeroY < height) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(${rReward}, ${gReward}, ${bReward}, 0.3)`
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.moveTo(leftAxisWidth, zeroY)
        ctx.lineTo(totalWidth - rightAxisWidth, zeroY)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw reward line (gold) with gradient fill
      ctx.beginPath()
      for (let i = 0; i < rewardValues.length; i++) {
        const x = leftAxisWidth + (i / (rewardValues.length - 1)) * chartWidth
        const y = height - ((rewardValues[i] - rewardMin) / rewardRange) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineTo(leftAxisWidth + chartWidth, height)
      ctx.lineTo(leftAxisWidth, height)
      ctx.closePath()

      const gradientReward = ctx.createLinearGradient(0, 0, 0, height)
      gradientReward.addColorStop(0, `rgba(${rReward}, ${gReward}, ${bReward}, 0.2)`)
      gradientReward.addColorStop(1, `rgba(${rReward}, ${gReward}, ${bReward}, 0)`)
      ctx.fillStyle = gradientReward
      ctx.fill()

      // Draw reward line stroke
      ctx.beginPath()
      ctx.strokeStyle = `rgb(${rReward}, ${gReward}, ${bReward})`
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (let i = 0; i < rewardValues.length; i++) {
        const x = leftAxisWidth + (i / (rewardValues.length - 1)) * chartWidth
        const y = height - ((rewardValues[i] - rewardMin) / rewardRange) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Draw reward current value dot
      if (rewardValues.length > 0) {
        const lastX = leftAxisWidth + chartWidth
        const lastY = height - ((rewardValues[rewardValues.length - 1] - rewardMin) / rewardRange) * height
        ctx.beginPath()
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
        ctx.fillStyle = `rgb(${rReward}, ${gReward}, ${bReward})`
        ctx.fill()
      }

      // Draw length line (teal) - bolder
      if (lengthValues.length >= 2) {
        ctx.beginPath()
        ctx.strokeStyle = `rgb(${rLength}, ${gLength}, ${bLength})`
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        for (let i = 0; i < lengthValues.length; i++) {
          const x = leftAxisWidth + (i / (lengthValues.length - 1)) * chartWidth
          const y = height - ((lengthValues[i] - lengthMin) / lengthRange) * height
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()

        // Draw length current value dot
        if (lengthValues.length > 0) {
          const lastX = leftAxisWidth + chartWidth
          const lastY = height - ((lengthValues[lengthValues.length - 1] - lengthMin) / lengthRange) * height
          ctx.beginPath()
          ctx.arc(lastX, lastY, 5, 0, Math.PI * 2)
          ctx.fillStyle = `rgb(${rLength}, ${gLength}, ${bLength})`
          ctx.fill()
          ctx.strokeStyle = `rgba(${rLength}, ${gLength}, ${bLength}, 0.5)`
          ctx.lineWidth = 6
          ctx.stroke()
        }
      }
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
      ctx.fillText(this.formatAxisLabel(max), yAxisWidth - 4, 8)
      ctx.fillText(this.formatAxisLabel((max + min) / 2), yAxisWidth - 4, height / 2)
      ctx.fillText(this.formatAxisLabel(min), yAxisWidth - 4, height - 8)

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

.header-badge-warmup {
  color: #ffb74d;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

.pulse-dot.warmup {
  background: #ffb74d;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

/* Warmup indicator */
.warmup-indicator {
  background: linear-gradient(135deg, rgba(255, 183, 77, 0.15), rgba(255, 183, 77, 0.05));
  border: 1px solid rgba(255, 183, 77, 0.3);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.warmup-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #ffb74d;
  margin-bottom: var(--spacing-xs);
}

.warmup-progress-text {
  font-family: var(--font-display);
  font-weight: 600;
}

.warmup-bar {
  height: 6px;
  background: rgba(255, 183, 77, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.warmup-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff9800, #ffb74d);
  border-radius: 3px;
  transition: width 0.3s ease;
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

.chart-legend {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.65rem;
  color: var(--color-text-muted);
}

.legend-color {
  width: 12px;
  height: 3px;
  border-radius: 2px;
}

.legend-cyan {
  background: rgb(0, 217, 255);
}

.legend-green {
  background: rgb(0, 255, 136);
}

.legend-magenta {
  background: rgb(255, 0, 170);
}

.legend-purple {
  background: rgb(170, 100, 255);
}

.legend-gold {
  background: rgb(255, 183, 77);
}

.legend-teal {
  background: rgb(0, 200, 180);
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

.text-gold {
  color: rgb(255, 183, 77);
}

.text-teal {
  color: rgb(0, 200, 180);
}
</style>
