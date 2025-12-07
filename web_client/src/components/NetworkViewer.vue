<template>
  <div class="network-viewer panel" @click="$emit('open-detail')" title="Click to open full visualization">
    <div class="panel-header">
      <span>Neural Network</span>
      <span class="header-info">{{ networkInfo }}</span>
    </div>

    <!-- Weight Health Indicator (now above network viz) -->
    <div 
      class="weight-health" 
      v-if="weightHealthStatus.status !== 'idle'"
      title="Weight Health shows how the neural network weights are changing during training.&#10;&#10;Status:&#10;• Learning - Weights are being updated normally&#10;• Converging - Weights are decreasing (approaching optimum)&#10;• Exploring - Weights are increasing (finding new solutions)&#10;• Plateau - Weights barely changing (may be stuck)&#10;• Unstable - Weights oscillating (learning rate may be too high)&#10;&#10;Δ Rate: Magnitude of weight changes per second&#10;Stability: How consistent the update direction is (5 = stable)"
    >
      <div class="health-header">
        <span class="health-label">Weight Health</span>
        <span class="health-status" :class="weightHealthStatus.status">{{ weightHealthStatus.statusText }}</span>
      </div>
      <div class="health-metrics">
        <div class="health-metric">
          <span class="metric-label">Δ Rate</span>
          <div class="delta-bar">
            <div class="delta-fill" :style="{ width: `${Math.min(100, weightHealthStatus.deltaRate * 1000)}%` }"></div>
          </div>
          <span class="metric-value">{{ weightHealthStatus.deltaRate.toExponential(1) }}</span>
        </div>
        <div class="health-metric">
          <span class="metric-label">Stability</span>
          <div class="stability-dots">
            <span v-for="i in 5" :key="i" class="stability-dot" :class="{ filled: i <= weightHealthStatus.stability }">●</span>
          </div>
        </div>
      </div>
      <div class="delta-sparkline">
        <svg class="sparkline-svg" viewBox="0 0 100 20" preserveAspectRatio="none">
          <polyline 
            :points="sparklinePoints" 
            fill="none" 
            :stroke="sparklineColor" 
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>


    <!-- Fast mode placeholder for SVG -->
    <div v-if="fastMode" class="svg-placeholder">
      <span class="placeholder-icon">⚡</span>
      <span class="placeholder-text">Visualization paused</span>
    </div>

    <!-- Dynamic Network Diagram -->
    <svg v-else class="network-svg" :viewBox="`0 0 ${svgWidth} 200`" preserveAspectRatio="xMidYMid meet">
      <!-- Layer labels -->
      <text :x="layerPositions[0]" y="15" class="layer-label" text-anchor="middle">Input</text>
      <text 
        v-for="(_, i) in hiddenLayers" 
        :key="'hl-'+i" 
        :x="layerPositions[i + 1]" 
        y="15" 
        class="layer-label" 
        text-anchor="middle"
      >H{{ i + 1 }}</text>
      <text :x="layerPositions[layerPositions.length - 1]" y="15" class="layer-label" text-anchor="middle">Output</text>

      <!-- Dynamic edges -->
      <g class="edges" opacity="0.3">
        <!-- Edges between each layer pair -->
        <template v-for="(_, layerIdx) in allLayers.slice(0, -1)" :key="'edges-'+layerIdx">
          <line 
            v-for="edge in getEdges(layerIdx)" 
            :key="edge.key"
            :x1="edge.x1" 
            :y1="edge.y1" 
            :x2="edge.x2" 
            :y2="edge.y2" 
            stroke="#4a90a4" 
            stroke-width="0.5"
          />
        </template>
      </g>

      <!-- Input nodes with live values -->
      <g class="input-layer">
        <g v-for="(label, i) in inputLabels" :key="'in-'+i" :transform="`translate(${layerPositions[0]}, ${getNodeY(6, i)})`">
          <circle r="8" :fill="getInputColor(i)" stroke="#3d3d5a" stroke-width="1"/>
          <text x="-12" y="4" class="input-label" text-anchor="end">{{ label }}</text>
        </g>
      </g>

      <!-- Hidden layer nodes (dynamic) -->
      <g class="hidden-layers">
        <g v-for="(size, layerIdx) in hiddenLayers" :key="'hidden-'+layerIdx">
          <!-- Show up to 5 nodes visually, with ellipsis for more -->
          <circle 
            v-for="nodeIdx in Math.min(displayNodes, size)" 
            :key="'h'+layerIdx+'-'+nodeIdx"
            :cx="layerPositions[layerIdx + 1]" 
            :cy="getNodeY(Math.min(displayNodes, size), nodeIdx - 1)"
            r="6" 
            fill="#2a4a5a" 
            stroke="#3d3d5a"
          />
          <!-- Ellipsis if more than displayNodes -->
          <text 
            v-if="size > displayNodes"
            :x="layerPositions[layerIdx + 1]"
            :y="getNodeY(displayNodes, displayNodes - 1) + 15"
            class="layer-ellipsis"
            text-anchor="middle"
          >⋮</text>
          <!-- Layer size label -->
          <text 
            :x="layerPositions[layerIdx + 1]" 
            y="175" 
            class="layer-size" 
            text-anchor="middle"
          >({{ size }})</text>
        </g>
      </g>

      <!-- Output nodes with Q-values -->
      <g class="output-layer">
        <!-- Idle -->
        <g :transform="`translate(${layerPositions[layerPositions.length - 1]}, 75)`">
          <circle 
            r="12" 
            :fill="greedyAction === 0 ? '#00d9ff' : '#2a4a5a'" 
            :stroke="greedyAction === 0 ? '#00d9ff' : '#3d3d5a'" 
            stroke-width="2"
          />
          <text x="-16" y="4" class="output-label" text-anchor="end">idle</text>
        </g>
        <!-- Flap -->
        <g :transform="`translate(${layerPositions[layerPositions.length - 1]}, 115)`">
          <circle 
            r="12" 
            :fill="greedyAction === 1 ? '#ff6b9d' : '#2a4a5a'" 
            :stroke="greedyAction === 1 ? '#ff6b9d' : '#3d3d5a'" 
            stroke-width="2"
          />
          <text x="-16" y="4" class="output-label" text-anchor="end">flap</text>
        </g>
      </g>

      <!-- Decision Section: Output + Random nodes → central decision -->
      <g class="decision-section" :transform="`translate(${decisionX}, 0)`">
        <!-- Lines from output nodes to decision node -->
        <line 
          :x1="layerPositions[layerPositions.length - 1] - decisionX + 12" :y1="75" 
          x2="13" y2="95"
          stroke="#00d9ff" :stroke-width="!isExploring && selectedAction === 0 ? 2 : 1" :opacity="!isExploring && selectedAction === 0 ? 0.9 : 0.15"
        />
        <line 
          :x1="layerPositions[layerPositions.length - 1] - decisionX + 12" :y1="115" 
          x2="13" y2="95"
          stroke="#ff6b9d" :stroke-width="!isExploring && selectedAction === 1 ? 2 : 1" :opacity="!isExploring && selectedAction === 1 ? 0.9 : 0.15"
        />
        
        <!-- Random source nodes (aligned with output nodes) -->
        <circle cx="50" cy="75" r="7" fill="#ffcc00" stroke="#fff" stroke-width="1" 
          :opacity="isExploring && selectedAction === 0 ? 1 : 0.35"/>
        <circle cx="50" cy="115" r="7" fill="#ff8800" stroke="#fff" stroke-width="1" 
          :opacity="isExploring && selectedAction === 1 ? 1 : 0.35"/>
        <text x="50" y="138" class="source-label-small" text-anchor="middle">RNG</text>
        
        <!-- Lines from random nodes to decision node -->
        <line x1="43" y1="75" x2="37" y2="95" stroke="#ffcc00" 
          :stroke-width="isExploring && selectedAction === 0 ? 2 : 1" :opacity="isExploring && selectedAction === 0 ? 1 : 0.15"/>
        <line x1="43" y1="115" x2="37" y2="95" stroke="#ff8800" 
          :stroke-width="isExploring && selectedAction === 1 ? 2 : 1" :opacity="isExploring && selectedAction === 1 ? 1 : 0.15"/>
        
        <!-- Decision node (centered between output nodes) -->
        <circle cx="25" cy="95" r="12" :fill="decisionNodeColor" stroke="#ffffff" stroke-width="2"/>
        <text x="25" y="99" class="decision-text" text-anchor="middle">{{ selectedAction === 0 ? '→' : '↑' }}</text>
        
        <!-- Epsilon indicator bar -->
        <g transform="translate(25, 155)">
          <rect x="-20" y="-6" width="40" height="12" rx="6" fill="rgba(30, 40, 60, 0.8)" stroke="#3a4a5a"/>
          <rect x="-20" y="-6" :width="20 * (1 - epsilon)" height="12" rx="6" fill="rgba(0, 180, 220, 0.5)"/>
          <rect :x="20 - 20 * epsilon" y="-6" :width="20 * epsilon" height="12" rx="6" fill="rgba(255, 170, 0, 0.5)"/>
          <text x="0" y="3" class="epsilon-label-small" text-anchor="middle">ε:{{ (epsilon * 100).toFixed(0) }}%</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

const INPUT_LABELS = ['y', 'vel', 'dx₁', 'dy₁', 'dx₂', 'dy₂']

export default defineComponent({
  name: 'NetworkViewer',
  emits: ['open-detail'],
  props: {
    activations: {
      type: Array as PropType<number[][]>,
      default: () => [],
    },
    qValues: {
      type: Array as unknown as PropType<[number, number]>,
      default: () => [0, 0] as [number, number],
    },
    selectedAction: {
      type: Number,
      default: 0,
    },
    greedyAction: {
      type: Number,
      default: 0,
    },
    epsilon: {
      type: Number,
      default: 0,
    },
    isExploring: {
      type: Boolean,
      default: false,
    },
    hiddenLayers: {
      type: Array as PropType<number[]>,
      default: () => [64, 64],
    },
    weightHealth: {
      type: Object as PropType<{ delta: number; avgSign: number } | null>,
      default: null,
    },
    fastMode: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      inputLabels: INPUT_LABELS,
      displayNodes: 5, // Max nodes to show visually per layer
      // Weight health tracking (pre-computed metrics received from props)
      deltaHistory: [] as number[], // Last N delta values
      signHistory: [] as number[], // Track avgSign for oscillation detection
      maxDeltaHistory: 20,
    }
  },
  watch: {
    // Track weight health updates (pre-computed metrics)
    weightHealth: {
      handler(health: { delta: number; avgSign: number } | null) {
        if (!health) return
        
        this.deltaHistory.push(health.delta)
        if (this.deltaHistory.length > this.maxDeltaHistory) {
          this.deltaHistory.shift()
        }
        
        this.signHistory.push(health.avgSign)
        if (this.signHistory.length > this.maxDeltaHistory) {
          this.signHistory.shift()
        }
      },
    },
  },
  computed: {
    networkInfo(): string {
      // Show dynamic network architecture: Input → Hidden layers → Output
      const layers = [6, ...this.hiddenLayers, 2]
      return layers.join(' → ')
    },
    inputValues(): number[] {
      return this.activations[0] || [0, 0, 0, 0, 0, 0]
    },
    // All layer sizes: [input, hidden1, hidden2, ..., output]
    allLayers(): number[] {
      return [6, ...this.hiddenLayers, 2]
    },
    // Calculate SVG width based on number of layers (extra space for decision section)
    svgWidth(): number {
      const numLayers = this.allLayers.length
      return 50 + numLayers * 55 + 70 // 50 padding + 55 per layer + 70 for decision section
    },
    // Calculate X positions for each layer
    layerPositions(): number[] {
      const numLayers = this.allLayers.length
      const spacing = (this.svgWidth - 140) / (numLayers - 1) // 140 = 70 base + 70 decision section
      return this.allLayers.map((_, i) => 35 + i * spacing)
    },
    // X position for decision section
    decisionX(): number {
      return this.layerPositions[this.layerPositions.length - 1] + 35
    },
    // Decision node color based on source and action
    decisionNodeColor(): string {
      if (this.isExploring) {
        return this.selectedAction === 0 ? '#ffcc00' : '#ff8800'
      } else {
        return this.selectedAction === 0 ? '#00d9ff' : '#ff6b9d'
      }
    },
    // Weight health computed properties (renamed to avoid conflict with prop)
    weightHealthStatus(): { status: string; statusText: string; deltaRate: number; stability: number } {
      if (this.deltaHistory.length < 2) {
        return { status: 'idle', statusText: 'Waiting...', deltaRate: 0, stability: 5 }
      }
      
      const recentDelta = this.deltaHistory[this.deltaHistory.length - 1]
      const avgDelta = this.deltaHistory.reduce((a, b) => a + b, 0) / this.deltaHistory.length
      
      // Compute trend (are deltas increasing or decreasing?)
      const halfLen = Math.floor(this.deltaHistory.length / 2)
      const recentHalf = this.deltaHistory.slice(-halfLen)
      const olderHalf = this.deltaHistory.slice(0, halfLen)
      const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length
      const olderAvg = olderHalf.length > 0 ? olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length : recentAvg
      
      // Compute oscillation (sign changes in weight directions)
      let signFlips = 0
      for (let i = 1; i < this.signHistory.length; i++) {
        if (Math.sign(this.signHistory[i]) !== Math.sign(this.signHistory[i-1]) && 
            Math.abs(this.signHistory[i]) > 0.1 && Math.abs(this.signHistory[i-1]) > 0.1) {
          signFlips++
        }
      }
      const oscillationRate = this.signHistory.length > 1 ? signFlips / (this.signHistory.length - 1) : 0
      
      // Determine status
      let status: string
      let statusText: string
      
      if (avgDelta < 1e-6) {
        status = 'plateau'
        statusText = '⏸ Plateau'
      } else if (oscillationRate > 0.5) {
        status = 'unstable'
        statusText = '⚠ Unstable'
      } else if (recentAvg < olderAvg * 0.7) {
        status = 'converging'
        statusText = '✓ Converging'
      } else if (recentAvg > olderAvg * 1.3) {
        status = 'diverging'
        statusText = '↗ Exploring'
      } else {
        status = 'learning'
        statusText = '◉ Learning'
      }
      
      // Stability: 5 = very stable, 1 = very unstable
      const stability = Math.max(1, Math.min(5, Math.round(5 - oscillationRate * 8)))
      
      const safeDelta = Number.isFinite(recentDelta) ? recentDelta : 0
      return { status, statusText, deltaRate: safeDelta, stability }
    },
    sparklinePoints(): string {
      if (this.deltaHistory.length < 2) return '0,10 100,10'
      
      const max = Math.max(...this.deltaHistory, 1e-10)
      const points = this.deltaHistory.map((d, i) => {
        const x = (i / (this.deltaHistory.length - 1)) * 100
        const y = 18 - (d / max) * 16 // Leave some padding
        return `${x},${y}`
      })
      return points.join(' ')
    },
    sparklineColor(): string {
      const status = this.weightHealthStatus.status
      if (status === 'converging') return '#00ff88'
      if (status === 'unstable') return '#ff5252'
      if (status === 'plateau') return '#ffb74d'
      if (status === 'diverging') return '#00d9ff'
      return '#aaa'
    },
  },
  methods: {
    // Get Y position for a node in a layer
    getNodeY(layerSize: number, nodeIndex: number): number {
      const displaySize = Math.min(this.displayNodes, layerSize)
      const totalHeight = 130 // Available height for nodes
      const spacing = totalHeight / (displaySize + 1)
      return 30 + spacing * (nodeIndex + 1)
    },
    // Get edges between two layers
    getEdges(fromLayerIdx: number): Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> {
      const fromSize = Math.min(this.displayNodes, this.allLayers[fromLayerIdx])
      const toSize = Math.min(this.displayNodes, this.allLayers[fromLayerIdx + 1])
      const x1 = this.layerPositions[fromLayerIdx] + 10
      const x2 = this.layerPositions[fromLayerIdx + 1] - 10
      
      const edges: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
      
      // Only draw a subset of edges for visual clarity
      for (let i = 0; i < fromSize; i++) {
        for (let j = 0; j < toSize; j++) {
          // Skip some edges for visual clarity when there are many
          if (fromSize > 3 && toSize > 3 && (i + j) % 2 !== 0) continue
          
          edges.push({
            key: `e-${fromLayerIdx}-${i}-${j}`,
            x1,
            y1: this.getNodeY(fromSize, i),
            x2,
            y2: this.getNodeY(toSize, j),
          })
        }
      }
      return edges
    },
    getInputColor(index: number): string {
      const value = this.inputValues[index] || 0
      const normalized = Math.max(-1, Math.min(1, value))
      
      if (normalized > 0) {
        const intensity = Math.floor(normalized * 200)
        return `rgb(${100 + intensity}, ${200}, ${255})`
      } else {
        const intensity = Math.floor(-normalized * 200)
        return `rgb(${255}, ${150 - intensity}, ${100})`
      }
    },
  },
})
</script>

<style scoped>
.network-viewer {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.network-viewer:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.15);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-display);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-primary);
  padding-bottom: var(--spacing-xs);
  border-bottom: 1px solid var(--color-border);
}

.header-info {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-text-muted);
}


.network-svg {
  width: 100%;
  height: 180px;
  background: var(--color-bg-light);
  border-radius: var(--radius-md);
}

.svg-placeholder {
  width: 100%;
  height: 180px;
  background: var(--color-bg-light);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
}

.svg-placeholder .placeholder-icon {
  font-size: 1.5rem;
  opacity: 0.6;
}

.svg-placeholder .placeholder-text {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.layer-label {
  font-family: var(--font-display);
  font-size: 9px;
  fill: var(--color-text-muted);
}

.layer-size {
  font-family: var(--font-mono);
  font-size: 8px;
  fill: var(--color-text-muted);
}

.layer-ellipsis {
  font-size: 10px;
  fill: var(--color-text-muted);
}

.input-label, .output-label {
  font-family: var(--font-mono);
  font-size: 8px;
  fill: var(--color-text);
}

/* Decision section styles */
.source-label {
  font-family: var(--font-mono);
  font-size: 7px;
  fill: var(--color-text-muted);
  text-transform: uppercase;
}

.source-label-small {
  font-family: var(--font-mono);
  font-size: 8px;
  fill: var(--color-text-muted);
  text-transform: uppercase;
}

.epsilon-label-small {
  font-family: var(--font-mono);
  font-size: 7px;
  fill: #c0d0e0;
}

.decision-text {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: bold;
  fill: #ffffff;
}

.epsilon-label {
  font-family: var(--font-mono);
  font-size: 8px;
  fill: var(--color-text-muted);
}

/* Weight Health Indicator */
.weight-health {
  padding: var(--spacing-sm);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.health-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.health-label {
  font-family: var(--font-display);
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.health-status {
  font-family: var(--font-display);
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.health-status.learning {
  color: #aaa;
  background: rgba(170, 170, 170, 0.2);
}

.health-status.converging {
  color: #00ff88;
  background: rgba(0, 255, 136, 0.2);
}

.health-status.plateau {
  color: #ffb74d;
  background: rgba(255, 183, 77, 0.2);
}

.health-status.unstable {
  color: #ff5252;
  background: rgba(255, 82, 82, 0.2);
}

.health-status.diverging {
  color: #00d9ff;
  background: rgba(0, 217, 255, 0.2);
}

.health-metrics {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.health-metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.health-metric .metric-label {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.health-metric .metric-value {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--color-text);
}

.delta-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.delta-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d9ff, #00ff88);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.stability-dots {
  display: flex;
  gap: 2px;
}

.stability-dot {
  font-size: 0.5rem;
  color: rgba(255, 255, 255, 0.2);
}

.stability-dot.filled {
  color: #00ff88;
}

.delta-sparkline {
  margin-top: var(--spacing-xs);
}

.sparkline-svg {
  width: 100%;
  height: 20px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
}
</style>
