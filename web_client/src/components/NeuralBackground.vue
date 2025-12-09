<template>
  <div class="neural-bg" ref="container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseX: number
  baseY: number
  connections: number[] // Indices of connected nodes
  activation: number // 0 to 1, decays over time
}

interface Signal {
  fromIdx: number
  toIdx: number
  progress: number // 0 to 1
  speed: number
}

export default defineComponent({
  name: 'NeuralBackground',
  data() {
    return {
      width: 0,
      height: 0,
      nodes: [] as Node[],
      signals: [] as Signal[],
      mouseX: -1000,
      mouseY: -1000,
      animationFrameId: 0,
      ctx: null as CanvasRenderingContext2D | null,
      dpr: 1
    }
  },
  mounted() {
    this.initCanvas()
    window.addEventListener('resize', this.handleResize)
    window.addEventListener('mousemove', this.handleMouseMove)
    this.startAnimation()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    window.removeEventListener('mousemove', this.handleMouseMove)
    cancelAnimationFrame(this.animationFrameId)
  },
  methods: {
    initCanvas() {
      const canvas = this.$refs.canvas as HTMLCanvasElement
      const container = this.$refs.container as HTMLElement
      this.ctx = canvas.getContext('2d')
      
      this.handleResize()
      this.createNetwork()
    },
    
    handleResize() {
      const canvas = this.$refs.canvas as HTMLCanvasElement
      const container = this.$refs.container as HTMLElement
      
      this.dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      
      this.width = rect.width
      this.height = rect.height
      
      canvas.width = this.width * this.dpr
      canvas.height = this.height * this.dpr
      
      if (this.ctx) {
        this.ctx.scale(this.dpr, this.dpr)
      }
      
      // Re-create network on significant resize or just adjust positions?
      // For simplicity, let's re-create if node count is too off, but mostly we can just let them drift.
      // If we haven't created nodes yet, do it.
      if (this.nodes.length === 0) {
        this.createNetwork()
      }
    },
    
    handleMouseMove(e: MouseEvent) {
      const container = this.$refs.container as HTMLElement
      if (!container) return
      
      const rect = container.getBoundingClientRect()
      
      // Calculate mouse position relative to the container
      // If mouse is outside, we can still track it, or clamp it.
      // We only care if it's over the header really.
      if (e.clientY < rect.bottom + 50) { // Slight buffer
         this.mouseX = e.clientX - rect.left
         this.mouseY = e.clientY - rect.top
      } else {
         this.mouseX = -1000
         this.mouseY = -1000
      }
    },
    
    createNetwork() {
      this.nodes = []
      this.signals = []
      
      // Density: 1 node per X pixels
      const area = this.width * this.height
      const nodeCount = Math.floor(area / 12000) // Lower density for calmer look
      const limitedNodeCount = Math.min(Math.max(nodeCount, 15), 60) // Clamp lower
      
      // Create nodes
      for (let i = 0; i < limitedNodeCount; i++) {
        this.nodes.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: (Math.random() - 0.5) * 0.2, // Much slower drift
          vy: (Math.random() - 0.5) * 0.2,
          radius: Math.random() * 2 + 1.5, // Slightly smaller
          baseX: 0, 
          baseY: 0,
          connections: [],
          activation: 0
        })
      }
      
      // Create connections (k-nearest neighbors)
      this.nodes.forEach((node, i) => {
        // Find distances to all other nodes
        const distances = this.nodes
          .map((n, idx) => ({ idx, dist: Math.hypot(n.x - node.x, n.y - node.y) }))
          .filter(d => d.idx !== i)
          .sort((a, b) => a.dist - b.dist)
        
        // Connect to closest 3-4 nodes
        distances.slice(0, Math.floor(Math.random() * 2) + 2).forEach(d => {
           // Avoid duplicate connections
           if (!node.connections.includes(d.idx)) {
             node.connections.push(d.idx)
             // Bidirectional? Let's keep it unidirectional for signal flow variety, or check inverse
             // Actually, undirected graph for drawing, directed for signals maybe?
             // Let's make it undirected for simplicity in drawing
             // But we store it on both to make traversal easier?
           }
        })
      })
    },
    
    update() {
      if (!this.ctx) return
      
      // Move nodes
      this.nodes.forEach(node => {
        node.x += node.vx
        node.y += node.vy
        
        // Bounce off walls
        if (node.x < 0 || node.x > this.width) node.vx *= -1
        if (node.y < 0 || node.y > this.height) node.vy *= -1
        
        // Mouse interaction: Repel/Attract or just activation
        const dx = this.mouseX - node.x
        const dy = this.mouseY - node.y
        const dist = Math.hypot(dx, dy)
        
        // Interaction radius
        if (dist < 100) {
           // Gentle push away or pull towards?
           // Let's do a slight pull towards mouse to feel "responsive"
           const force = (100 - dist) / 1000
           node.vx += dx * force * 0.01 // Reduced force
           node.vy += dy * force * 0.01
           
           // Activate node
           node.activation = Math.min(node.activation + 0.05, 1) // Slower activation
           
           // Chance to spawn signal if highly activated and ready
           if (node.activation > 0.8 && Math.random() < 0.01) { // Reduced spawn chance
             this.spawnSignal(node)
           }
        }
        
        // Dampen velocity
        // node.vx *= 0.99
        // node.vy *= 0.99
        
        // Constrain velocity
        const speed = Math.hypot(node.vx, node.vy)
        if (speed > 0.5) { // Reduced max speed
          node.vx = (node.vx / speed) * 0.5
          node.vy = (node.vy / speed) * 0.5
        }
        
        // Decay activation
        node.activation *= 0.98 // Slower decay
      })
      
      // Update signals
      for (let i = this.signals.length - 1; i >= 0; i--) {
        const sig = this.signals[i]
        sig.progress += sig.speed
        
        // If signal reaches end
        if (sig.progress >= 1) {
          // Trigger activation at target
          const targetNode = this.nodes[sig.toIdx]
          targetNode.activation = 1
          
          // Chance to propagate
          if (Math.random() < 0.3) { // Lower propagation chance
             this.spawnSignal(targetNode, this.nodes[sig.fromIdx]) // Don't go back immediately
          }
          
          this.signals.splice(i, 1)
        }
      }
    },
    
    spawnSignal(sourceNode: Node, excludeNode?: Node) {
       if (sourceNode.connections.length === 0) return
       
       // Pick a random connection
       const targetIdx = sourceNode.connections[Math.floor(Math.random() * sourceNode.connections.length)]
       
       // Avoid immediate back-propagation if possible
       if (excludeNode && this.nodes[targetIdx] === excludeNode && sourceNode.connections.length > 1) {
         return // Skip or retry? Just skip to keep it simple
       }
       
       // Find source index
       const sourceIdx = this.nodes.indexOf(sourceNode)
       
       this.signals.push({
         fromIdx: sourceIdx,
         toIdx: targetIdx,
         progress: 0,
         speed: 0.01 + Math.random() * 0.02 // Slower signals
       })
    },
    
    draw() {
      if (!this.ctx) return
      
      this.ctx.clearRect(0, 0, this.width, this.height)
      
      // Draw connections
      this.ctx.lineWidth = 1
      this.nodes.forEach((node, i) => {
        node.connections.forEach(targetIdx => {
           const target = this.nodes[targetIdx]
           // Draw line only once per pair (e.g. if i < targetIdx)? 
           // Since our connections might be one-way in data structure but we want visual mesh
           // let's just draw all.
           
           // Opacity based on distance
           const dist = Math.hypot(node.x - target.x, node.y - target.y)
           const maxDist = 200
           if (dist < maxDist) {
              const opacity = (1 - dist / maxDist) * 0.15
              this.ctx!.strokeStyle = `rgba(0, 217, 255, ${opacity})` // Cyan
              this.ctx!.beginPath()
              this.ctx!.moveTo(node.x, node.y)
              this.ctx!.lineTo(target.x, target.y)
              this.ctx!.stroke()
           }
        })
      })
      
      // Draw signals
      this.signals.forEach(sig => {
        const from = this.nodes[sig.fromIdx]
        const to = this.nodes[sig.toIdx]
        
        const x = from.x + (to.x - from.x) * sig.progress
        const y = from.y + (to.y - from.y) * sig.progress
        
        this.ctx!.beginPath()
        this.ctx!.arc(x, y, 2, 0, Math.PI * 2)
        this.ctx!.fillStyle = '#00d9ff' // Cyan pulse
        this.ctx!.fill()
        
        // Trail?
      })
      
      // Draw nodes
      this.nodes.forEach(node => {
        this.ctx!.beginPath()
        this.ctx!.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        
        // Color mix based on activation
        // Base: dark blue/grey
        // Active: Cyan or Orange
        // Let's use Cyan for standard, Orange for "high stress" or random?
        // Just Cyan for now to match theme
        const r = 0   // 0
        const g = 217 // 217
        const b = 255 // 255
        
        const alpha = 0.3 + node.activation * 0.7
        this.ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        this.ctx!.fill()
        
        // Glow if active
        if (node.activation > 0.1) {
           this.ctx!.shadowBlur = node.activation * 10
           this.ctx!.shadowColor = `rgba(${r}, ${g}, ${b}, 0.8)`
           this.ctx!.stroke() // Outline
           this.ctx!.shadowBlur = 0 // Reset
        }
      })
    },
    
    startAnimation() {
      const loop = () => {
        this.update()
        this.draw()
        this.animationFrameId = requestAnimationFrame(loop)
      }
      loop()
    }
  }
})
</script>

<style scoped>
.neural-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0; /* Behind content */
  /* Gradient background base */
  background: radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0f0f1a 100%);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
