<template>
  <div class="neural-bird-bg" ref="container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

interface BirdNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  phase: number // Flapping phase
  wingY: number // Current wing offset
  connections: number[]
  activation: number
}

interface Signal {
  fromIdx: number
  toIdx: number
  progress: number
  speed: number
}

export default defineComponent({
  name: 'NeuralBirdBackground',
  data() {
    return {
      width: 0,
      height: 0,
      birds: [] as BirdNode[],
      signals: [] as Signal[],
      animationFrameId: 0,
      ctx: null as CanvasRenderingContext2D | null,
      dpr: 1
    }
  },
  mounted() {
    this.initCanvas()
    window.addEventListener('resize', this.handleResize)
    this.startAnimation()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    cancelAnimationFrame(this.animationFrameId)
  },
  methods: {
    initCanvas() {
      const canvas = this.$refs.canvas as HTMLCanvasElement
      const container = this.$refs.container as HTMLElement
      this.ctx = canvas.getContext('2d')
      
      this.handleResize()
      this.createFlock()
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
      
      if (this.birds.length === 0) {
        this.createFlock()
      }
    },
    
    createFlock() {
      this.birds = []
      this.signals = []
      
      // Much lower density than the main network
      const area = this.width * this.height
      const birdCount = Math.floor(area / 40000) 
      const limitedCount = Math.min(Math.max(birdCount, 5), 15)
      
      for (let i = 0; i < limitedCount; i++) {
        this.birds.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          vx: 0.5 + Math.random() * 0.5, // Constant forward movement
          vy: (Math.random() - 0.5) * 0.2, // Slight vertical drift
          radius: 3,
          phase: Math.random() * Math.PI * 2,
          wingY: 0,
          connections: [],
          activation: 0
        })
      }
    },
    
    update() {
      if (!this.ctx) return
      
      // Update birds
      this.birds.forEach(bird => {
        bird.x += bird.vx
        bird.y += bird.vy
        
        // Wrap around screen
        if (bird.x > this.width + 20) bird.x = -20
        if (bird.x < -20) bird.x = this.width + 20
        if (bird.y > this.height) bird.y = 0
        if (bird.y < 0) bird.y = this.height
        
        // Flapping animation logic
        bird.phase += 0.2
        bird.wingY = Math.sin(bird.phase) * 3
        
        // Random activation/neural firing
        if (Math.random() < 0.005) {
          bird.activation = 1
        }
        bird.activation *= 0.95
        
        // Dynamic connections based on proximity
        // Clear old connections to re-evaluate
        bird.connections = []
        this.birds.forEach((other, idx) => {
          if (bird === other) return
          const dist = Math.hypot(bird.x - other.x, bird.y - other.y)
          if (dist < 150) { // Connection range
             bird.connections.push(idx)
             
             // Chance to send signal
             if (bird.activation > 0.5 && Math.random() < 0.02) {
               this.spawnSignal(this.birds.indexOf(bird), idx)
             }
          }
        })
      })
      
      // Update signals
      for (let i = this.signals.length - 1; i >= 0; i--) {
        const sig = this.signals[i]
        sig.progress += sig.speed
        
        if (sig.progress >= 1) {
          const target = this.birds[sig.toIdx]
          target.activation = 1
          this.signals.splice(i, 1)
        }
      }
    },
    
    spawnSignal(fromIdx: number, toIdx: number) {
      this.signals.push({
        fromIdx,
        toIdx,
        progress: 0,
        speed: 0.02
      })
    },
    
    draw() {
      if (!this.ctx) return
      
      this.ctx.clearRect(0, 0, this.width, this.height)
      
      // Draw connections
      this.birds.forEach((bird, i) => {
        bird.connections.forEach(targetIdx => {
          // Avoid double drawing
          if (targetIdx < i) return
          
          const target = this.birds[targetIdx]
          const dist = Math.hypot(bird.x - target.x, bird.y - target.y)
          const opacity = (1 - dist / 150) * 0.15
          
          this.ctx!.strokeStyle = `rgba(255, 210, 63, ${opacity})` // Yellow accent
          this.ctx!.beginPath()
          this.ctx!.moveTo(bird.x, bird.y)
          this.ctx!.lineTo(target.x, target.y)
          this.ctx!.stroke()
        })
      })
      
      // Draw signals
      this.signals.forEach(sig => {
        const from = this.birds[sig.fromIdx]
        const to = this.birds[sig.toIdx]
        
        // Account for wrapping if needed? 
        // Simple linear interpolation might look weird if wrapping happens during signal
        // but for simplicity we ignore wrapping for signals in flight or just clear them
        const dist = Math.hypot(from.x - to.x, from.y - to.y)
        if (dist > 200) return // Don't draw if too far (wrapped)
        
        const x = from.x + (to.x - from.x) * sig.progress
        const y = from.y + (to.y - from.y) * sig.progress
        
        this.ctx!.fillStyle = '#ffd23f'
        this.ctx!.beginPath()
        this.ctx!.arc(x, y, 2, 0, Math.PI * 2)
        this.ctx!.fill()
      })
      
      // Draw "Neural Birds"
      this.birds.forEach(bird => {
        // Draw bird body (node)
        this.ctx!.fillStyle = bird.activation > 0.2 ? '#ffd23f' : '#ff6b35' // Yellow active, Orange idle
        this.ctx!.beginPath()
        this.ctx!.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2)
        this.ctx!.fill()
        
        // Draw wings (flapping V shape)
        this.ctx!.strokeStyle = bird.activation > 0.2 ? '#fff' : 'rgba(255, 255, 255, 0.5)'
        this.ctx!.lineWidth = 1.5
        this.ctx!.beginPath()
        
        // Wing tips move up/down relative to body
        // Left wing
        this.ctx!.moveTo(bird.x - 6, bird.y - bird.wingY)
        this.ctx!.lineTo(bird.x, bird.y) // Body center
        // Right wing
        this.ctx!.lineTo(bird.x + 6, bird.y - bird.wingY)
        this.ctx!.stroke()
        
        // Glow
        if (bird.activation > 0.1) {
           this.ctx!.shadowBlur = 10
           this.ctx!.shadowColor = '#ffd23f'
           this.ctx!.stroke()
           this.ctx!.shadowBlur = 0
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
.neural-bird-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
  pointer-events: none; /* Let clicks pass through */
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
