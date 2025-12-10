<template>
  <div class="network-detail-overlay" @click.self="$emit('close')">
    <div class="network-detail-panel">
      <!-- Header -->
      <header class="panel-header">
        <div class="title">
          <span class="icon">🧠</span>
          <span>Neural Network Visualization</span>
        </div>
        <div class="info">
          <span class="architecture" id="architecture-display">{{ architectureString }}</span>
          <span class="params">{{ paramsString }}</span>
          <div class="status">
            <span class="status-dot" :class="{ paused: isPaused }"></span>
            <span>{{ isPaused ? 'Paused' : 'Live' }}</span>
          </div>
        </div>
        <div class="header-controls">
          <button class="control-btn play-pause-btn" @click="$emit('toggle-pause')" :title="isPaused ? 'Resume' : 'Pause'">
            <span v-if="isPaused">▶</span>
            <span v-else>⏸</span>
          </button>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>
      </header>

      <!-- SVG Visualization -->
      <div class="svg-container">
        <svg 
          class="network-svg" 
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <!-- Background grid -->
          <g class="grid" opacity="0.08">
            <line v-for="x in 12" :key="'vl-'+x" :x1="x * 100" y1="0" :x2="x * 100" :y2="svgHeight" stroke="#4a90a4" stroke-width="0.5"/>
          </g>

          <!-- Layer labels -->
          <g class="layer-labels">
            <g v-for="(pos, i) in layerPositions" :key="'label-'+i">
              <text :x="pos" y="35" class="layer-label" text-anchor="middle">{{ layerNames[i] }}</text>
              <text :x="pos" :y="svgHeight - 15" class="layer-size" text-anchor="middle">{{ layerSizes[i] }}</text>
            </g>
          </g>

          <!-- Edges -->
          <g class="edges">
            <!-- Input to first hidden -->
            <line 
              v-for="edge in inputToHiddenEdges" 
              :key="edge.key"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              stroke="#3a4a5a" stroke-width="0.4" opacity="0.5"
            />
            <!-- Between hidden layers -->
            <line 
              v-for="edge in hiddenEdges" 
              :key="edge.key"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              stroke="#3a4a5a" stroke-width="0.4" opacity="0.5"
            />
            <!-- Last hidden to output -->
            <line 
              v-for="edge in hiddenToOutputEdges" 
              :key="edge.key"
              :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
              stroke="#3a4a5a" stroke-width="0.4" opacity="0.5"
            />
          </g>

          <!-- Input nodes -->
          <g class="input-nodes">
            <g v-for="(node, i) in inputNodes" :key="'in-'+i" :transform="`translate(${node.x}, ${node.y})`">
              <circle r="20" :fill="getNodeColor(node.activation)" :stroke="getNodeStroke(node.activation)" stroke-width="2" :filter="Math.abs(node.activation) > 0.5 ? 'url(#glow)' : ''"/>
              <text x="-30" y="4" class="node-label" text-anchor="end">{{ effectiveInputLabels[i] }}</text>
              <text y="4" class="node-value" text-anchor="middle">{{ formatValue(node.activation) }}</text>
            </g>
          </g>

          <!-- Hidden layer nodes -->
          <g class="hidden-nodes">
            <g v-for="(layer, layerIdx) in hiddenNodes" :key="'hl-'+layerIdx">
              <circle 
                v-for="(node, nodeIdx) in layer" 
                :key="'hn-'+layerIdx+'-'+nodeIdx"
                :cx="node.x" :cy="node.y" :r="node.radius"
                fill="#2a4a5a" stroke="#3a4a5a" stroke-width="0.5" opacity="0.85"
              />
            </g>
          </g>

          <!-- Output nodes -->
          <g class="output-nodes">
            <g v-for="(node, i) in outputNodes" :key="'out-'+i" :transform="`translate(${node.x}, ${node.y})`">
              <circle r="28" :fill="getOutputColor(i)" :stroke="greedyAction === i ? '#ffffff' : getNodeStroke(node.activation)" stroke-width="3" :filter="selectedAction === i && !isExploring ? 'url(#glow)' : ''"/>
              <text x="42" y="5" class="node-label output" text-anchor="start">{{ outputLabels[i] }}</text>
              <text y="5" class="node-value output" text-anchor="middle">{{ formatQValue(node.activation) }}</text>
            </g>
          </g>

          <!-- Decision Section - 4 source nodes feeding into central decision -->
          <g class="decision-section" :transform="`translate(${decisionX}, 0)`">
            <text x="75" y="55" class="layer-label" text-anchor="middle">Decision</text>
            
            <!-- Epsilon indicator above decision node -->
            <g :transform="`translate(75, ${decisionY - 90})`">
              <text y="-20" class="epsilon-title" text-anchor="middle">Exploration Rate</text>
              <!-- Slider background -->
              <rect x="-55" y="-8" width="110" height="16" rx="8" fill="rgba(30, 40, 60, 0.8)" stroke="#3a4a5a"/>
              <!-- Network side (left, 1-epsilon) -->
              <clipPath id="leftClip"><rect x="-55" y="-8" width="55" height="16" rx="8"/></clipPath>
              <rect x="-55" y="-8" :width="55 * (1 - epsilon)" height="16" fill="rgba(0, 180, 220, 0.5)" clip-path="url(#leftClip)"/>
              <!-- Random side (right, epsilon) -->
              <clipPath id="rightClip"><rect x="0" y="-8" width="55" height="16" rx="8"/></clipPath>
              <rect :x="55 - 55 * epsilon" y="-8" :width="55 * epsilon" height="16" fill="rgba(255, 170, 0, 0.5)" clip-path="url(#rightClip)"/>
              <!-- Labels -->
              <text x="-27" y="4" class="epsilon-side-label" text-anchor="middle" fill="#00d9ff">{{ Math.round((1 - epsilon) * 100) }}%</text>
              <text x="27" y="4" class="epsilon-side-label" text-anchor="middle" fill="#ffaa00">{{ Math.round(epsilon * 100) }}%</text>
            </g>
            
            <!-- Lines from output nodes to network source nodes -->
            <line 
              :x1="outputNodes[0].x - decisionX + 28" :y1="outputNodes[0].y" 
              x2="0" :y2="networkIdleY"
              stroke="#00d9ff" :stroke-width="!isExploring && greedyAction === 0 ? 3 : 1.5" :opacity="!isExploring && greedyAction === 0 ? 0.9 : 0.25"
            />
            <line 
              :x1="outputNodes[1].x - decisionX + 28" :y1="outputNodes[1].y" 
              x2="0" :y2="networkFlapY"
              stroke="#ff6b9d" :stroke-width="!isExploring && greedyAction === 1 ? 3 : 1.5" :opacity="!isExploring && greedyAction === 1 ? 0.9 : 0.25"
            />
            
            <!-- Network source nodes (left side) -->
            <g :transform="`translate(0, ${networkIdleY})`">
              <circle r="16" fill="#00d9ff" stroke="#ffffff" stroke-width="2" 
                :opacity="!isExploring && selectedAction === 0 ? 1 : 0.35"
                :filter="!isExploring && selectedAction === 0 ? 'url(#glow)' : ''"/>
              <text y="5" class="decision-source-text" text-anchor="middle">→</text>
            </g>
            <g :transform="`translate(0, ${networkFlapY})`">
              <circle r="16" fill="#ff6b9d" stroke="#ffffff" stroke-width="2" 
                :opacity="!isExploring && selectedAction === 1 ? 1 : 0.35"
                :filter="!isExploring && selectedAction === 1 ? 'url(#glow)' : ''"/>
              <text y="5" class="decision-source-text" text-anchor="middle">↑</text>
            </g>
            <text x="0" :y="decisionY + 70" class="source-label" text-anchor="middle">Network</text>
            
            <!-- Random source nodes (right side) -->
            <g :transform="`translate(150, ${randomIdleY})`">
              <circle r="16" fill="#ffcc00" stroke="#ffffff" stroke-width="2" 
                :opacity="isExploring && selectedAction === 0 ? 1 : 0.35"
                :filter="isExploring && selectedAction === 0 ? 'url(#glow)' : ''"/>
              <text y="5" class="decision-source-text" text-anchor="middle">→</text>
            </g>
            <g :transform="`translate(150, ${randomFlapY})`">
              <circle r="16" fill="#ff8800" stroke="#ffffff" stroke-width="2" 
                :opacity="isExploring && selectedAction === 1 ? 1 : 0.35"
                :filter="isExploring && selectedAction === 1 ? 'url(#glow)' : ''"/>
              <text y="5" class="decision-source-text" text-anchor="middle">↑</text>
            </g>
            <text x="150" :y="decisionY + 70" class="source-label" text-anchor="middle">Random</text>
            
            <!-- Lines from source nodes to decision node -->
            <!-- Network IDLE to decision -->
            <line x1="16" :y1="networkIdleY" x2="52" :y2="decisionY" 
              stroke="#00d9ff" :stroke-width="!isExploring && selectedAction === 0 ? 4 : 1.5" 
              :opacity="!isExploring && selectedAction === 0 ? 1 : 0.15"/>
            <!-- Network FLAP to decision -->
            <line x1="16" :y1="networkFlapY" x2="52" :y2="decisionY" 
              stroke="#ff6b9d" :stroke-width="!isExploring && selectedAction === 1 ? 4 : 1.5" 
              :opacity="!isExploring && selectedAction === 1 ? 1 : 0.15"/>
            <!-- Random IDLE to decision -->
            <line x1="134" :y1="randomIdleY" x2="98" :y2="decisionY" 
              stroke="#ffcc00" :stroke-width="isExploring && selectedAction === 0 ? 4 : 1.5" 
              :opacity="isExploring && selectedAction === 0 ? 1 : 0.15"/>
            <!-- Random FLAP to decision -->
            <line x1="134" :y1="randomFlapY" x2="98" :y2="decisionY" 
              stroke="#ff8800" :stroke-width="isExploring && selectedAction === 1 ? 4 : 1.5" 
              :opacity="isExploring && selectedAction === 1 ? 1 : 0.15"/>
            
            <!-- Decision node (center) -->
            <g :transform="`translate(75, ${decisionY})`">
              <circle r="30" :fill="decisionNodeColor" opacity="0.3" filter="url(#glow)"/>
              <circle r="24" :fill="decisionNodeColor" stroke="#ffffff" stroke-width="3"/>
              <text y="7" class="decision-action-text" text-anchor="middle">{{ selectedAction === 0 ? '→' : '↑' }}</text>
              <text y="48" class="decision-action-label" text-anchor="middle">{{ selectedAction === 0 ? 'IDLE' : 'FLAP' }}</text>
            </g>
          </g>
        </svg>
      </div>

      <!-- Footer -->
      <footer class="panel-footer">
        <div class="legend-section">
          <h4>Current Decision</h4>
          <div class="decision-display">
            <span class="action" :class="[selectedAction === 0 ? 'idle' : 'flap', { exploring: isExploring }]">
              {{ selectedAction === 0 ? '→ IDLE' : '↑ FLAP' }}
            </span>
            <div class="q-comparison">
              <span class="q-val idle" :class="{ winner: greedyAction === 0 }">Q(idle): <span class="q-number">{{ formatQValue(qValues[0]) }}</span></span>
              <span class="q-val flap" :class="{ winner: greedyAction === 1 }">Q(flap): <span class="q-number">{{ formatQValue(qValues[1]) }}</span></span>
            </div>
          </div>
        </div>
        <div class="legend-section source-colors">
          <h4>Decision Sources</h4>
          <div class="color-legend">
            <div class="color-row network-row">
              <span class="source-title">Network:</span>
              <span class="color-item"><span class="color-dot" style="background: #00d9ff"></span>IDLE</span>
              <span class="color-item"><span class="color-dot" style="background: #ff6b9d"></span>FLAP</span>
            </div>
            <div class="color-row random-row">
              <span class="source-title">Random:</span>
              <span class="color-item"><span class="color-dot" style="background: #ffcc00"></span>IDLE</span>
              <span class="color-item"><span class="color-dot" style="background: #ff8800"></span>FLAP</span>
            </div>
          </div>
        </div>
        <div class="legend-section exploration-section">
          <h4>Exploration (ε-greedy)</h4>
          <div class="exploration-display">
            <div class="epsilon-meter interactive">
              <span class="epsilon-label">ε</span>
              <div class="epsilon-slider-container">
                <input 
                  type="range" 
                  class="epsilon-slider" 
                  min="0" 
                  max="100" 
                  :value="Math.round(epsilon * 100)" 
                  @input="$emit('update-epsilon', Number(($event.target as HTMLInputElement).value) / 100)"
                />
                <div class="epsilon-fill-bg" :style="{ width: `${epsilon * 100}%` }"></div>
              </div>
              <span class="epsilon-value editable">{{ Math.round(epsilon * 100) }}%</span>
            </div>
          </div>
        </div>
        <div class="legend-section activation-function">
          <h4>Activation Function: ReLU(x)</h4>
          <div class="function-plot-container">
            <svg class="function-plot" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="reluGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#2a3a4a" />
                  <stop offset="50%" style="stop-color:#2a3a4a" />
                  <stop offset="60%" style="stop-color:#4a8a7a" />
                  <stop offset="80%" style="stop-color:#00d9ff" />
                  <stop offset="100%" style="stop-color:#00ffaa" />
                </linearGradient>
              </defs>
              <!-- x-axis at y=0 (bottom of plot) -->
              <line x1="15" y1="80" x2="150" y2="80" stroke="#4a5a6a" stroke-width="1" />
              <!-- y-axis in the middle (x=0) -->
              <line x1="82" y1="10" x2="82" y2="85" stroke="#4a5a6a" stroke-width="1" />
              <!-- Axis labels -->
              <text x="155" y="84" fill="#6688aa" font-size="8">x</text>
              <text x="86" y="18" fill="#6688aa" font-size="8">y</text>
              <text x="82" y="92" fill="#6688aa" font-size="7" text-anchor="middle">0</text>
              <!-- ReLU curve: y = max(0, x) -->
              <path :d="reluPath" fill="none" stroke="url(#reluGradient)" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            <div class="function-labels">
              <span class="zero-label">Zero (x≤0)</span>
              <span class="pos-label">Positive (x>0)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

const DEFAULT_INPUT_LABELS = ['y', 'vel', 'dx₁', 'dy₁', 'dx₂', 'dy₂', 'gap']
const OUTPUT_LABELS = ['IDLE', 'FLAP']

export default defineComponent({
  name: 'NetworkDetailPanel',
  props: {
    input: {
      type: Array as PropType<number[]>,
      default: () => [0, 0, 0, 0, 0, 0],
    },
    inputLabels: {
      type: Array as PropType<string[]>,
      default: undefined,
    },
    qValues: {
      type: Array as PropType<number[]>,
      default: () => [0, 0],
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
    isPaused: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close', 'toggle-pause', 'update-epsilon'],
  data() {
    return {
      inputLabelFallback: DEFAULT_INPUT_LABELS,
      outputLabels: OUTPUT_LABELS,
      svgWidth: 1450,
      svgHeight: 600,
      decisionX: 1230,
    }
  },
  computed: {
    inputCount(): number {
      const fromInput = this.input?.length
      const fromLabels = this.inputLabels?.length
      const count = fromInput || fromLabels || this.inputLabelFallback.length
      return Math.max(1, count)
    },
    effectiveInputLabels(): string[] {
      const source = this.inputLabels && this.inputLabels.length > 0 ? this.inputLabels : this.inputLabelFallback
      const labels: string[] = []
      for (let i = 0; i < this.inputCount; i++) {
        labels.push(source[i] ?? `f${i + 1}`)
      }
      return labels
    },
    architectureString(): string {
      return [this.inputCount, ...this.hiddenLayers, 2].join(' → ')
    },
    paramsString(): string {
      const layers = [this.inputCount, ...this.hiddenLayers, 2]
      let total = 0
      for (let i = 0; i < layers.length - 1; i++) {
        total += layers[i] * layers[i + 1] + layers[i + 1]
      }
      return total.toLocaleString() + ' parameters'
    },
    layerPositions(): number[] {
      const numLayers = this.hiddenLayers.length + 2
      const startX = 120
      const endX = 1080
      const spacing = (endX - startX) / (numLayers - 1)
      return Array.from({ length: numLayers }, (_, i) => startX + i * spacing)
    },
    layerNames(): string[] {
      const names = ['Input']
      this.hiddenLayers.forEach((_, i) => names.push(`Hidden ${i + 1}`))
      names.push('Output')
      return names
    },
    layerSizes(): string[] {
      const sizes = [`${this.inputCount} nodes`]
      this.hiddenLayers.forEach(size => sizes.push(`${size} nodes`))
      sizes.push('2 nodes')
      return sizes
    },
    inputNodes(): Array<{ x: number; y: number; activation: number }> {
      const count = this.inputCount
      const spacing = count > 1 ? (this.svgHeight - 150) / (count - 1) : 0
      return Array.from({ length: count }, (_, i) => ({
        x: this.layerPositions[0],
        y: 75 + i * spacing,
        activation: this.input[i] || 0,
      }))
    },
    hiddenNodes(): Array<Array<{ x: number; y: number; radius: number }>> {
      return this.hiddenLayers.map((layerSize, layerIdx) => {
        const x = this.layerPositions[layerIdx + 1]
        let cols = layerSize <= 16 ? 1 : layerSize <= 32 ? 2 : layerSize <= 64 ? 4 : 8
        const rows = Math.ceil(layerSize / cols)
        const availableHeight = this.svgHeight - 140
        const rowSpacing = Math.min(20, availableHeight / Math.max(rows - 1, 1))
        const colSpacing = 14
        const colOffset = -((cols - 1) * colSpacing) / 2
        const totalHeight = (rows - 1) * rowSpacing
        const startY = 70 + (availableHeight - totalHeight) / 2
        const nodeRadius = layerSize > 64 ? 4 : layerSize > 32 ? 5 : 6

        return Array.from({ length: layerSize }, (_, i) => ({
          x: x + colOffset + (i % cols) * colSpacing,
          y: startY + Math.floor(i / cols) * rowSpacing,
          radius: nodeRadius,
        }))
      })
    },
    outputNodes(): Array<{ x: number; y: number; activation: number }> {
      const x = this.layerPositions[this.layerPositions.length - 1]
      return [
        { x, y: this.svgHeight / 2 - 60, activation: this.qValues[0] || 0 },
        { x, y: this.svgHeight / 2 + 60, activation: this.qValues[1] || 0 },
      ]
    },
    inputToHiddenEdges(): Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> {
      return this.sampleEdges(this.inputNodes, this.hiddenNodes[0] || [], 20, 6, 'ih')
    },
    hiddenEdges(): Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> {
      const edges: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
      for (let i = 0; i < this.hiddenNodes.length - 1; i++) {
        edges.push(...this.sampleEdges(this.hiddenNodes[i], this.hiddenNodes[i + 1], 6, 6, `hh${i}`))
      }
      return edges
    },
    hiddenToOutputEdges(): Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> {
      const lastHidden = this.hiddenNodes[this.hiddenNodes.length - 1] || []
      return this.sampleEdges(lastHidden, this.outputNodes, 6, 28, 'ho')
    },
    networkColor(): string {
      return this.greedyAction === 0 ? '#00d9ff' : '#ff6b9d'
    },
    // Network source nodes (left side - mirroring output)
    networkIdleY(): number {
      return this.svgHeight / 2 - 35
    },
    networkFlapY(): number {
      return this.svgHeight / 2 + 35
    },
    // Random source nodes (right side - mirroring network)
    randomIdleY(): number {
      return this.svgHeight / 2 - 35
    },
    randomFlapY(): number {
      return this.svgHeight / 2 + 35
    },
    decisionY(): number {
      return this.svgHeight / 2
    },
    // Decision node color based on source and action
    decisionNodeColor(): string {
      if (this.isExploring) {
        // Random action - yellow/orange colors
        return this.selectedAction === 0 ? '#ffcc00' : '#ff8800'
      } else {
        // Network action - cyan/pink colors
        return this.selectedAction === 0 ? '#00d9ff' : '#ff6b9d'
      }
    },
    reluPath(): string {
      // SVG viewBox is 0 0 160 100, plot area: x from 20 to 150, y from 10 to 90
      const xMin = 20, xMax = 150, yMin = 10, yMax = 90
      const xRange = xMax - xMin, yRange = yMax - yMin
      let d = ''
      const steps = 60
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = -3 + t * 6 // x from -3 to 3
        const y = Math.max(0, x) // ReLU
        const svgX = xMin + (t * xRange)
        const svgY = yMax - (y / 3) * yRange // y=0 at bottom, y=3 at top
        d += (i === 0 ? 'M' : 'L') + `${svgX},${svgY}`
      }
      return d
    },
  },
  methods: {
    sampleEdges(
      from: Array<{ x: number; y: number; radius?: number }>,
      to: Array<{ x: number; y: number; radius?: number }>,
      fromR: number,
      toR: number,
      prefix: string
    ): Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> {
      const edges: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
      const maxEdges = 100
      const step = Math.max(1, Math.floor((from.length * to.length) / maxEdges))
      let count = 0
      for (let i = 0; i < from.length; i++) {
        for (let j = 0; j < to.length; j++) {
          if (count++ % step !== 0) continue
          edges.push({
            key: `${prefix}-${i}-${j}`,
            x1: from[i].x + fromR,
            y1: from[i].y,
            x2: to[j].x - toR,
            y2: to[j].y,
          })
        }
      }
      return edges
    },
    getNodeColor(activation: number): string {
      const normalized = Math.max(0, Math.min(2, activation))
      if (normalized < 0.05) return '#2a3a4a'
      const intensity = Math.min(1, normalized / 1.5)
      const g = Math.floor(120 + intensity * 135)
      const b = Math.floor(160 + intensity * 95)
      return `rgb(0, ${g}, ${b})`
    },
    getNodeStroke(activation: number): string {
      return activation < 0.05 ? '#4a5a6a' : '#00ff88'
    },
    getOutputColor(index: number): string {
      // Output nodes always use network colors - cyan for IDLE, pink for FLAP
      // Highlight the greedy action (highest Q-value)
      if (this.greedyAction === index) {
        return index === 0 ? '#00d9ff' : '#ff6b9d'
      }
      // Non-greedy action uses muted color based on Q-value
      return this.getNodeColor(this.qValues[index] || 0)
    },
    formatValue(v: number): string {
      if (Math.abs(v) < 0.01) return '0'
      return v.toFixed(2)
    },
    formatQValue(v: number): string {
      if (v === 0) return '0.000'
      if (Math.abs(v) < 0.001) return v.toExponential(1)
      if (Math.abs(v) >= 100) return v.toExponential(1)
      return v.toFixed(3)
    },
  },
})
</script>

<style scoped>
.network-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 10, 20, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.network-detail-panel {
  width: 100%;
  max-width: 1400px;
  height: 100%;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(5, 10, 20, 0.5) 0%, rgba(10, 22, 40, 0.5) 50%, rgba(13, 26, 42, 0.5) 100%);
  backdrop-filter: blur(8px);
  border-radius: 12px;
  border: 1px solid rgba(42, 74, 106, 0.5);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 24px;
  background: linear-gradient(90deg, rgba(0, 217, 255, 0.1) 0%, rgba(10, 22, 40, 0.3) 50%, rgba(255, 107, 157, 0.1) 100%);
  border-bottom: 1px solid rgba(42, 74, 106, 0.5);
}

.title {
  font-size: 1.4rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #e0f0ff;
}

.icon { font-size: 1.6rem; }

.info {
  display: flex;
  gap: 16px;
  margin-left: auto;
  align-items: center;
}

.architecture {
  font-size: 1rem;
  color: #00d9ff;
  padding: 6px 16px;
  background: rgba(0, 217, 255, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(0, 217, 255, 0.3);
}

.params {
  font-size: 0.9rem;
  color: #8899aa;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(0, 255, 136, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #00ff88;
  font-size: 0.85rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #00ff88;
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.control-btn {
  background: rgba(100, 150, 255, 0.2);
  border: 1px solid rgba(100, 150, 255, 0.4);
  color: #88aaff;
  font-size: 1rem;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover {
  background: rgba(100, 150, 255, 0.4);
  color: #ffffff;
}

.close-btn {
  background: rgba(255, 100, 100, 0.2);
  border: 1px solid rgba(255, 100, 100, 0.4);
  color: #ff8888;
  font-size: 1.2rem;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.4);
  color: #ffffff;
}

.status-dot.paused {
  background: #ffaa00;
  box-shadow: 0 0 8px rgba(255, 170, 0, 0.5);
}

.svg-container {
  flex: 1;
  background: radial-gradient(ellipse at center, rgba(13, 26, 42, 0.4) 0%, rgba(5, 10, 20, 0.4) 100%);
  overflow: hidden;
}

.network-svg {
  width: 100%;
  height: 100%;
}

.layer-label {
  font-size: 16px;
  font-weight: 600;
  fill: #00d9ff;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.layer-size {
  font-size: 12px;
  fill: #6688aa;
}

.node-label {
  font-size: 11px;
  fill: #aabbcc;
}

.node-label.output {
  font-size: 14px;
  font-weight: 600;
  fill: #e0f0ff;
}

.node-value {
  font-size: 9px;
  fill: #ffffff;
  font-weight: 600;
}

.node-value.output {
  font-size: 11px;
}

.decision-source-text {
  font-size: 16px;
  font-weight: bold;
  fill: #ffffff;
}

.decision-source-label {
  font-size: 11px;
  fill: #8899aa;
  text-transform: uppercase;
}

.decision-action-text {
  font-size: 20px;
  font-weight: bold;
  fill: #ffffff;
}

.decision-action-label {
  font-size: 12px;
  font-weight: 600;
  fill: #e0f0ff;
}

.epsilon-title {
  font-size: 11px;
  fill: #8899aa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.epsilon-side-label {
  font-size: 11px;
  font-weight: 600;
}

.source-label {
  font-size: 11px;
  fill: #8899aa;
  text-transform: uppercase;
}

.epsilon-display {
  font-size: 13px;
  font-weight: 600;
  fill: #ffaa00;
}

.rng-symbol {
  font-size: 20px;
  font-weight: bold;
  fill: #ffffff;
}

.panel-footer {
  display: flex;
  gap: 32px;
  padding: 16px 24px;
  background: rgba(10, 22, 40, 0.5);
  border-top: 1px solid rgba(26, 42, 58, 0.5);
}

.legend-section h4 {
  font-size: 0.75rem;
  color: #6688aa;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.decision-display {
  display: flex;
  align-items: center;
  gap: 24px;
}

.action {
  font-size: 1.2rem;
  font-weight: 700;
  padding: 8px 20px;
  border-radius: 10px;
}

.action.idle {
  color: #00d9ff;
  background: rgba(0, 217, 255, 0.15);
  border: 2px solid #00d9ff;
}

.action.flap {
  color: #ff6b9d;
  background: rgba(255, 107, 157, 0.15);
  border: 2px solid #ff6b9d;
}

.action.exploring {
  color: #ffaa00;
  background: rgba(255, 170, 0, 0.15);
  border: 2px solid #ffaa00;
}

.q-comparison {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.q-val {
  font-size: 0.9rem;
  color: #6688aa;
  padding: 4px 10px;
  border-radius: 6px;
}

.q-val.winner { font-weight: 600; }
.q-val.idle.winner { color: #00d9ff; background: rgba(0, 217, 255, 0.15); }
.q-val.flap.winner { color: #ff6b9d; background: rgba(255, 107, 157, 0.15); }

.q-number {
  display: inline-block;
  min-width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.source-colors { min-width: 160px; }

.color-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.source-title {
  font-size: 0.75rem;
  color: #8899aa;
  min-width: 55px;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: #c0d0e0;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.exploration-section { min-width: 180px; }

.activation-function { margin-left: auto; }

.function-plot-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.function-plot {
  width: 160px;
  height: 100px;
  background: rgba(5, 10, 20, 0.5);
  border-radius: 6px;
  border: 1px solid #2a3a4a;
}

.function-labels {
  display: flex;
  justify-content: space-between;
  width: 130px;
  font-size: 0.65rem;
  color: #6688aa;
  margin-top: 2px;
}

.zero-label { color: #6688aa; }
.pos-label { color: #00d9ff; }

.exploration-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.epsilon-meter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.epsilon-meter.interactive {
  cursor: pointer;
}

.epsilon-label {
  font-size: 1.2rem;
  font-weight: 600;
  color: #ffaa00;
  min-width: 20px;
}

.epsilon-slider-container {
  position: relative;
  flex: 1;
  height: 12px;
  min-width: 100px;
}

.epsilon-slider {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}

.epsilon-slider::-webkit-slider-runnable-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 170, 0, 0.15);
  border-radius: 4px;
}

.epsilon-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #ffaa00;
  border-radius: 50%;
  border: 2px solid #ffffff;
  margin-top: -4px;
  cursor: grab;
  box-shadow: 0 0 8px rgba(255, 170, 0, 0.5);
  transition: transform 0.15s;
}

.epsilon-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.epsilon-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
}

.epsilon-slider::-moz-range-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 170, 0, 0.15);
  border-radius: 4px;
}

.epsilon-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #ffaa00;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: grab;
  box-shadow: 0 0 8px rgba(255, 170, 0, 0.5);
}

.epsilon-fill-bg {
  position: absolute;
  top: 2px;
  left: 0;
  height: 8px;
  background: linear-gradient(90deg, #ffaa00 0%, #ff6600 100%);
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
}

.epsilon-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 170, 0, 0.15);
  border-radius: 4px;
  overflow: hidden;
  min-width: 80px;
}

.epsilon-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffaa00 0%, #ff6600 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.epsilon-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffaa00;
  min-width: 40px;
  text-align: right;
}

.epsilon-value.editable {
  background: rgba(255, 170, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 170, 0, 0.3);
}
</style>

