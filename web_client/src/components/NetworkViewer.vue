<template>
  <div class="network-viewer panel" @click="openDetailView" title="Click to open full visualization">
    <div class="panel-header">
      <span>Neural Network</span>
      <span class="header-info">{{ networkInfo }}</span>
      <span class="expand-hint">🔍</span>
    </div>

    <!-- Dynamic Network Diagram -->
    <svg class="network-svg" :viewBox="`0 0 ${svgWidth} 200`" preserveAspectRatio="xMidYMid meet">
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

      <!-- Output nodes with live values -->
      <g class="output-layer">
        <!-- Idle -->
        <g :transform="`translate(${layerPositions[layerPositions.length - 1]}, 75)`">
          <circle 
            r="12" 
            :fill="selectedAction === 0 ? '#00d9ff' : '#2a4a5a'" 
            :stroke="selectedAction === 0 ? '#00d9ff' : '#3d3d5a'" 
            stroke-width="2"
          />
          <text x="18" y="4" class="output-label">idle</text>
        </g>
        <!-- Flap -->
        <g :transform="`translate(${layerPositions[layerPositions.length - 1]}, 115)`">
          <circle 
            r="12" 
            :fill="selectedAction === 1 ? '#ff6b9d' : '#2a4a5a'" 
            :stroke="selectedAction === 1 ? '#ff6b9d' : '#3d3d5a'" 
            stroke-width="2"
          />
          <text x="18" y="4" class="output-label">flap</text>
        </g>
      </g>
    </svg>

    <!-- Action Decision -->
    <div class="action-decision">
      <div class="decision-arrow" :class="{ 'flap': selectedAction === 1 }">
        {{ selectedAction === 0 ? '→ Idle' : '↑ Flap!' }}
      </div>
    </div>

    <!-- Q-values display -->
    <div class="q-values">
      <div class="q-value" :class="{ selected: selectedAction === 0 }">
        <span class="q-label">Idle (no action)</span>
        <span class="q-number" :class="{ positive: qValues[0] > 0, negative: qValues[0] < 0 }">
          {{ formatQValue(qValues[0]) }}
        </span>
      </div>
      <div class="q-value" :class="{ selected: selectedAction === 1 }">
        <span class="q-label">Flap (jump)</span>
        <span class="q-number" :class="{ positive: qValues[1] > 0, negative: qValues[1] < 0 }">
          {{ formatQValue(qValues[1]) }}
        </span>
      </div>
    </div>

    <!-- Input Values Table -->
    <div class="input-values">
      <div class="input-row" v-for="(label, i) in inputLabels" :key="i">
        <span class="input-name">{{ label }}</span>
        <span class="input-val">{{ formatInputValue(i) }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

const INPUT_LABELS = ['y', 'vel', 'dx₁', 'dy₁', 'dx₂', 'dy₂']

export default defineComponent({
  name: 'NetworkViewer',
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
    hiddenLayers: {
      type: Array as PropType<number[]>,
      default: () => [64, 64],
    },
  },
  data() {
    return {
      inputLabels: INPUT_LABELS,
      displayNodes: 5, // Max nodes to show visually per layer
    }
  },
  watch: {
    // Save network data when activations update (for the detail view)
    activations: {
      handler() {
        this.saveNetworkData()
      },
      deep: true,
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
    // Calculate SVG width based on number of layers
    svgWidth(): number {
      const numLayers = this.allLayers.length
      return 60 + numLayers * 70 // 60 padding + 70 per layer
    },
    // Calculate X positions for each layer
    layerPositions(): number[] {
      const numLayers = this.allLayers.length
      const spacing = (this.svgWidth - 80) / (numLayers - 1)
      return this.allLayers.map((_, i) => 40 + i * spacing)
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
    formatQValue(value: number): string {
      if (value === 0) return '0'
      if (Math.abs(value) < 0.001) {
        return value.toExponential(2)
      }
      if (Math.abs(value) >= 1000) {
        return value.toExponential(2)
      }
      return value.toFixed(3)
    },
    formatInputValue(index: number): string {
      const value = this.inputValues[index] || 0
      return value.toFixed(2)
    },
    openDetailView() {
      // Save current network data to localStorage for the detail view (force save)
      this.saveNetworkData()
      console.log('[NetworkViewer] Opening detail view, saved data:', {
        activations: this.activations?.length,
        qValues: this.qValues,
        hiddenLayers: this.hiddenLayers,
      })
      
      // Open a new browser window with the network visualization
      const width = 1400
      const height = 800
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      
      window.open(
        '/network-detail.html',
        'NetworkVisualization',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
      )
    },
    saveNetworkData() {
      // Save network data to localStorage for the detail view to read
      const data = {
        activations: this.activations,
        qValues: this.qValues,
        selectedAction: this.selectedAction,
        hiddenLayers: this.hiddenLayers,
      }
      try {
        localStorage.setItem('flappy-ai-network-data', JSON.stringify(data))
      } catch (e) {
        console.warn('Failed to save network data to localStorage:', e)
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

.expand-hint {
  font-size: 0.9rem;
  opacity: 0.5;
  transition: all 0.2s ease;
}

.network-viewer:hover .expand-hint {
  opacity: 1;
  transform: scale(1.2);
}

.network-svg {
  width: 100%;
  height: 180px;
  background: var(--color-bg-light);
  border-radius: var(--radius-md);
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

.action-decision {
  display: flex;
  justify-content: center;
  padding: var(--spacing-xs);
}

.decision-arrow {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--color-primary);
  padding: var(--spacing-xs) var(--spacing-md);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.decision-arrow.flap {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.q-values {
  display: flex;
  gap: var(--spacing-sm);
}

.q-value {
  flex: 1;
  padding: var(--spacing-sm);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  transition: all 0.15s ease;
}

.q-value.selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 10px rgba(0, 217, 255, 0.2);
}

.q-label {
  display: block;
  font-family: var(--font-display);
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}

.q-number {
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--color-text);
}

.q-number.positive {
  color: var(--color-success);
}

.q-number.negative {
  color: var(--color-danger);
}

.input-values {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-xs);
  padding: var(--spacing-sm);
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
}

.input-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
}

.input-name {
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.input-val {
  font-family: var(--font-mono);
  color: var(--color-text);
}
</style>
