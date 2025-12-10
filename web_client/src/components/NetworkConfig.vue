<template>
  <div class="network-config">
    <div class="config-header">
      <h2 class="config-title">Configure Neural Network</h2>
      <p class="config-subtitle">Set up the architecture before training</p>
    </div>

    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'architecture' }"
        @click="activeTab = 'architecture'"
      >
        Architecture
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'inputs' }"
        @click="activeTab = 'inputs'"
      >
        Inputs ({{ inputCount }})
      </button>
    </div>

    <div class="config-body">
      <!-- Architecture Tab -->
      <template v-if="activeTab === 'architecture'">
        <!-- Layer Count Selector -->
        <div class="config-section">
          <label class="section-label">Hidden Layers</label>
          <div class="layer-count-buttons">
            <button
              v-for="n in 4"
              :key="n"
              class="layer-btn"
              :class="{ active: layerCount === n }"
              @click="setLayerCount(n)"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <!-- Per-Layer Node Count -->
        <div class="config-section">
          <label class="section-label">Nodes per Layer</label>
          <div class="layer-configs">
            <div
              v-for="(nodes, i) in layers"
              :key="i"
              class="layer-config"
            >
              <span class="layer-label">H{{ i + 1 }}</span>
              <div class="node-buttons">
                <button
                  v-for="size in nodeSizes"
                  :key="size"
                  class="node-btn"
                  :class="{ active: nodes === size }"
                  @click="setLayerNodes(i, size)"
                >
                  {{ size }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Network Preview -->
        <div class="config-section">
          <label class="section-label">Architecture Preview</label>
          <div class="network-preview">
            <svg class="preview-svg" :viewBox="svgViewBox" preserveAspectRatio="xMidYMid meet">
              <!-- Connections -->
              <g class="connections">
                <template v-for="(conn, ci) in connections" :key="'conn-'+ci">
                  <line
                    v-for="(line, li) in conn"
                    :key="'line-'+ci+'-'+li"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                    stroke="#4a90a4"
                    stroke-width="0.5"
                    opacity="0.3"
                  />
                </template>
              </g>

              <!-- Layer labels -->
              <text
                v-for="(label, i) in layerLabels"
                :key="'label-'+i"
                :x="layerX(i)"
                y="12"
                class="layer-label-text"
                text-anchor="middle"
              >
                {{ label }}
              </text>

              <!-- Nodes -->
              <g v-for="(layer, li) in allLayers" :key="'layer-'+li">
                <circle
                  v-for="(_, ni) in layer.displayNodes"
                  :key="'node-'+li+'-'+ni"
                  :cx="layerX(li)"
                  :cy="nodeY(ni, layer.displayNodes)"
                  :r="nodeRadius"
                  :fill="layerColor(li)"
                  stroke="#3d3d5a"
                  stroke-width="1"
                />
                <!-- Show "..." if truncated -->
                <text
                  v-if="layer.truncated"
                  :x="layerX(li)"
                  :y="nodeY(layer.displayNodes, layer.displayNodes) + 15"
                  class="truncation-text"
                  text-anchor="middle"
                >
                  ...{{ layer.total }}
                </text>
              </g>
            </svg>
            <div class="architecture-text">{{ architectureText }}</div>
          </div>
        </div>
      </template>

      <!-- Inputs Tab -->
      <template v-if="activeTab === 'inputs'">
        <div class="config-section">
          <label class="section-label">Observation Features</label>
          <p class="section-hint">Select which features the network receives as input</p>
          
          <div class="input-features">
            <label class="feature-checkbox" v-for="feature in featureList" :key="feature.key">
              <input
                class="feature-input"
                type="checkbox"
                :checked="observationConfig[feature.key]"
                @change="toggleFeature(feature.key)"
              />
              <span class="feature-toggle" aria-hidden="true">
                <span class="toggle-track"></span>
                <span class="toggle-thumb"></span>
              </span>
              <span class="feature-text">
                <span class="feature-name">{{ feature.label }}</span>
                <span class="feature-desc">{{ feature.description }}</span>
              </span>
            </label>
          </div>
        </div>

        <div class="config-section">
          <label class="section-label">Input Summary</label>
          <div class="input-summary">
            <div class="summary-item">
              <span class="summary-value">{{ inputCount }}</span>
              <span class="summary-label">Input Features</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="config-footer">
      <button class="btn btn-primary btn-large" @click="startTraining">
        Start Training
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

interface FeatureDefinition {
  key: keyof ObservationConfig
  label: string
  description: string
}

interface ObservationConfig {
  birdY: boolean
  birdVel: boolean
  dx1: boolean
  dy1: boolean
  dx2: boolean
  dy2: boolean
  gapVel1: boolean
  gapVel2: boolean
  gapSize1: boolean
}

export default defineComponent({
  name: 'NetworkConfig',
  props: {
    initialConfig: {
      type: Array as PropType<number[]>,
      default: () => [64, 64],
    },
    initialObservationConfig: {
      type: Object as PropType<Partial<ObservationConfig>>,
      default: () => ({}),
    },
  },
  emits: ['start'],
  data() {
    return {
      activeTab: 'architecture' as 'architecture' | 'inputs',
      layers: [...this.initialConfig] as number[],
      nodeSizes: [16, 32, 64, 128],
      observationConfig: {
        birdY: true,
        birdVel: true,
        dx1: true,
        dy1: true,
        dx2: true,
        dy2: true,
        gapVel1: false,
        gapVel2: false,
        gapSize1: false,
        ...this.initialObservationConfig,
      } as ObservationConfig,
      featureList: [
        { key: 'birdY', label: 'Bird Y', description: 'Vertical position of the bird' },
        { key: 'birdVel', label: 'Bird Velocity', description: 'Vertical velocity of the bird' },
        { key: 'dx1', label: 'Distance X (Pipe 1)', description: 'Horizontal distance to next pipe' },
        { key: 'dy1', label: 'Distance Y (Pipe 1)', description: 'Vertical distance to next pipe gap center' },
        { key: 'dx2', label: 'Distance X (Pipe 2)', description: 'Horizontal distance to second pipe' },
        { key: 'dy2', label: 'Distance Y (Pipe 2)', description: 'Vertical distance to second pipe gap center' },
        { key: 'gapVel1', label: 'Gap Velocity 1', description: 'Vertical velocity of next pipe gap (moving gaps)' },
        { key: 'gapVel2', label: 'Gap Velocity 2', description: 'Vertical velocity of second pipe gap (moving gaps)' },
        { key: 'gapSize1', label: 'Gap Size', description: 'Size of the next pipe gap (helps with progressive difficulty)' },
      ] as FeatureDefinition[],
    }
  },
  computed: {
    layerCount(): number {
      return this.layers.length
    },
    inputCount(): number {
      return Object.values(this.observationConfig).filter(Boolean).length
    },
    enabledFeatures(): string[] {
      return Object.entries(this.observationConfig)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
    },
    architectureText(): string {
      return [this.inputCount, ...this.layers, 2].join(' → ')
    },
    svgViewBox(): string {
      const width = 60 + (this.layers.length + 1) * 70
      return `0 0 ${width} 160`
    },
    layerLabels(): string[] {
      const labels = ['Input']
      for (let i = 0; i < this.layers.length; i++) {
        labels.push(`H${i + 1}`)
      }
      labels.push('Output')
      return labels
    },
    allLayers(): { total: number; displayNodes: number; truncated: boolean }[] {
      const result = []
      // Input layer (dynamic based on selected features)
      const inputNodes = this.inputCount
      result.push({ total: inputNodes, displayNodes: Math.min(inputNodes, 4), truncated: inputNodes > 4 })
      // Hidden layers: 16→1, 32→2, 64→4, 128→8
      for (const size of this.layers) {
        const displayNodes = Math.max(1, size / 16)
        result.push({
          total: size,
          displayNodes,
          truncated: size > displayNodes,
        })
      }
      // Output layer (2 nodes - show 1)
      result.push({ total: 2, displayNodes: 1, truncated: true })
      return result
    },
    connections(): { x1: number; y1: number; x2: number; y2: number }[][] {
      const conns: { x1: number; y1: number; x2: number; y2: number }[][] = []
      for (let li = 0; li < this.allLayers.length - 1; li++) {
        const layerConns: { x1: number; y1: number; x2: number; y2: number }[] = []
        const fromLayer = this.allLayers[li]
        const toLayer = this.allLayers[li + 1]
        const fromX = this.layerX(li)
        const toX = this.layerX(li + 1)
        
        // Draw connections to all displayed nodes
        const fromNodes = fromLayer.displayNodes
        const toNodes = toLayer.displayNodes
        
        for (let fi = 0; fi < fromNodes; fi++) {
          for (let ti = 0; ti < toNodes; ti++) {
            layerConns.push({
              x1: fromX,
              y1: this.nodeY(fi, fromLayer.displayNodes),
              x2: toX,
              y2: this.nodeY(ti, toLayer.displayNodes),
            })
          }
        }
        conns.push(layerConns)
      }
      return conns
    },
    nodeRadius(): number {
      return 8
    },
  },
  watch: {
    initialConfig: {
      handler(newConfig: number[]) {
        this.layers = [...newConfig]
      },
      immediate: true,
    },
    initialObservationConfig: {
      handler(newConfig: Partial<ObservationConfig>) {
        this.observationConfig = {
          ...this.observationConfig,
          ...newConfig,
        }
      },
      immediate: true,
    },
  },
  methods: {
    setLayerCount(count: number) {
      if (count > this.layers.length) {
        // Add layers with default 64 nodes
        while (this.layers.length < count) {
          this.layers.push(64)
        }
      } else if (count < this.layers.length) {
        // Remove layers
        this.layers = this.layers.slice(0, count)
      }
    },
    setLayerNodes(index: number, size: number) {
      this.layers[index] = size
    },
    toggleFeature(key: string) {
      const obsKey = key as keyof ObservationConfig
      this.observationConfig[obsKey] = !this.observationConfig[obsKey]
    },
    layerX(index: number): number {
      return 40 + index * 70
    },
    nodeY(nodeIndex: number, totalNodes: number): number {
      const spacing = 120 / Math.max(totalNodes, 1)
      const startY = 30 + (120 - (totalNodes - 1) * spacing) / 2
      return startY + nodeIndex * spacing
    },
    layerColor(layerIndex: number): string {
      if (layerIndex === 0) return '#4a90a4' // Input - blue
      if (layerIndex === this.allLayers.length - 1) return '#00ff88' // Output - green
      return '#ff9f43' // Hidden - orange
    },
    startTraining() {
      this.$emit('start', [...this.layers], { ...this.observationConfig })
    },
  },
})
</script>

<style scoped>
.network-config {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  background: var(--color-bg-dark);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  max-width: 500px;
  margin: 0 auto;
}

.config-header {
  text-align: center;
}

.config-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.config-subtitle {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  margin: 0;
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: var(--spacing-xs);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--spacing-sm);
}

.tab-btn {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--color-text);
  background: var(--color-bg-light);
}

.tab-btn.active {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: rgba(0, 217, 255, 0.1);
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.section-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.section-hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0;
  opacity: 0.8;
}

.layer-count-buttons {
  display: flex;
  gap: var(--spacing-xs);
}

.layer-btn {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.layer-btn:hover {
  border-color: var(--color-primary);
}

.layer-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-bg-dark);
}

.layer-configs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.layer-config {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.layer-label {
  width: 30px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ff9f43;
}

.node-buttons {
  display: flex;
  gap: var(--spacing-xs);
  flex: 1;
}

.node-btn {
  flex: 1;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.node-btn:hover {
  border-color: var(--color-primary);
}

.node-btn.active {
  background: #ff9f43;
  border-color: #ff9f43;
  color: var(--color-bg-dark);
}

.network-preview {
  background: var(--color-bg-mid);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.preview-svg {
  width: 100%;
  height: 140px;
}

.layer-label-text {
  font-size: 10px;
  fill: var(--color-text-muted);
}

.truncation-text {
  font-size: 8px;
  fill: var(--color-text-muted);
}

.architecture-text {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--color-text);
  padding-top: var(--spacing-xs);
}

/* Input Features */
.input-features {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-height: 260px;
  overflow: auto;
}

.feature-checkbox {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--color-bg-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.feature-checkbox:hover {
  border-color: var(--color-primary);
  background: rgba(0, 217, 255, 0.05);
}

.feature-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.feature-toggle {
  position: relative;
  width: 48px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255, 120, 120, 0.25), rgba(255, 80, 80, 0.25));
  border-radius: 999px;
  border: 1px solid rgba(255, 140, 140, 0.3);
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.45);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffd6d6, #ff7b7b);
  box-shadow: 0 0 8px rgba(255, 120, 120, 0.7), 0 0 12px rgba(255, 80, 80, 0.45);
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.feature-input:checked + .feature-toggle .toggle-thumb {
  transform: translateX(24px);
  background: radial-gradient(circle at 70% 70%, #f6fdff, #8cf4ff);
  box-shadow: 0 0 10px rgba(140, 244, 255, 0.9), 0 0 14px rgba(0, 217, 255, 0.6);
}

.feature-input:checked + .feature-toggle .toggle-track {
  background: linear-gradient(90deg, rgba(0, 217, 255, 0.35), rgba(180, 240, 255, 0.4));
  border-color: rgba(0, 217, 255, 0.6);
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-name {
  font-weight: 600;
  color: var(--color-text);
  min-width: 140px;
  font-size: 0.85rem;
}

.feature-desc {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex: 1;
}

/* Input Summary */
.input-summary {
  display: flex;
  gap: var(--spacing-md);
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--color-bg-mid);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.summary-value {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-primary);
}

.summary-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.config-footer {
  display: flex;
  justify-content: center;
}

.btn-large {
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: 1.1rem;
}
</style>
