<template>
  <div class="gradient-bg" ref="container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  radius: number
  stuckFrames: number
  life: number
  trail: {x: number, y: number}[]
}

export default defineComponent({
  name: 'GradientDescentBackground',
  data() {
    return {
      width: 0,
      height: 0,
      particles: [] as Particle[],
      animationFrameId: 0,
      ctx: null as CanvasRenderingContext2D | null,
      dpr: 1,
      // Terrain parameters
      noiseOffset: { x: 0, y: 0 },
      time: 0
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
      this.ctx = canvas.getContext('2d')
      
      // Randomize map on refresh/init
      this.noiseOffset = {
        x: Math.random() * 1000,
        y: Math.random() * 1000
      }
      
      this.handleResize()
      this.spawnParticles()
    },
    
    handleResize() {
      const container = this.$refs.container as HTMLElement
      const canvas = this.$refs.canvas as HTMLCanvasElement
      
      this.dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      
      this.width = rect.width
      this.height = rect.height
      
      canvas.width = this.width * this.dpr
      canvas.height = this.height * this.dpr
      
      if (this.ctx) {
        this.ctx.scale(this.dpr, this.dpr)
      }
    },
    
    // Simple pseudo-random height function combining sine waves
    getHeight(x: number, y: number) {
      const scale = 0.005
      // More complex terrain for better "valleys"
      const v1 = Math.sin(x * scale + this.noiseOffset.x) * Math.cos(y * scale + this.noiseOffset.y)
      const v2 = Math.sin(x * scale * 2.5 + 10) * Math.cos(y * scale * 2.5 + 10) * 0.6
      const v3 = Math.sin(x * scale * 0.5 - 5) * 0.3
      const v4 = Math.cos(x * scale * 4 + y * scale * 4) * 0.1 // High freq noise
      
      return v1 + v2 + v3 + v4 
    },
    
    spawnParticles() {
      this.particles = []
      // Just one ball at a time as requested
      this.respawnParticle(0, true)
    },
    
    respawnParticle(index: number, randomPos: boolean) {
      const p = this.particles[index] || {} as Particle
      
      // Spawn at random position
      p.x = Math.random() * this.width
      p.y = Math.random() * this.height
      
      // Initial velocity (random push to start)
      p.vx = (Math.random() - 0.5) * 2
      p.vy = (Math.random() - 0.5) * 2
      
      p.stuckFrames = 0
      p.life = 0
      p.radius = 4 + Math.random() * 2 // Slightly larger
      p.trail = []
      
      // Random color each spawn
      const colors = ['#00d9ff', '#ff6b35', '#ffd23f', '#ffffff']
      p.color = colors[Math.floor(Math.random() * colors.length)]
      
      if (!this.particles[index]) {
        this.particles[index] = p
      }
    },
    
    update() {
      if (!this.ctx) return
      
      this.time += 0.002
      // Slowly pan the terrain for dynamic effect? Or keep static?
      // Static is better for "finding minimum", maybe very slow drift
      // this.noiseOffset.x += 0.0005
      
      this.particles.forEach((p, i) => {
        // Calculate gradient (slope) at current position
        const h = this.getHeight(p.x, p.y)
        const step = 2
        const hx = this.getHeight(p.x + step, p.y)
        const hy = this.getHeight(p.x, p.y + step)
        
        // Gradient vector (pointing uphill)
        const dx = (hx - h) / step
        const dy = (hy - h) / step
        
        // Apply force downhill (negative gradient)
        // Momentum/Adam-like behavior: simple velocity accumulation with friction
        // Increased gravity for stronger pulls
        const gravity = 1.5 
        p.vx += -dx * gravity
        p.vy += -dy * gravity
        
        // Friction / Decay (slightly slippery)
        p.vx *= 0.98 
        p.vy *= 0.98
        
        // Add tiny noise (SGD-like stochasticity)
        // This helps it explore and not just go straight down
        p.vx += (Math.random() - 0.5) * 0.05
        p.vy += (Math.random() - 0.5) * 0.05
        
        // Update trail
        p.trail.push({x: p.x, y: p.y})
        if (p.trail.length > 20) {
           p.trail.shift()
        }
        
        // Update position
        p.x += p.vx
        p.y += p.vy
        p.life++
        
        // Check bounds
        if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
           this.respawnParticle(i, false)
           return
        }
        
        // Check if stuck (local minimum found)
        const speed = Math.hypot(p.vx, p.vy)
        if (speed < 0.05 && p.life > 20) {
           p.stuckFrames++
        } else {
           p.stuckFrames = 0
        }
        
        // Respawn if stuck long enough or too old
        if (p.stuckFrames > 60 || p.life > 800) {
           // Flash effect before respawn?
           this.respawnParticle(i, false)
        }
      })
    },
    
    draw() {
      if (!this.ctx) return
      
      this.ctx.clearRect(0, 0, this.width, this.height)
      
      // Draw smooth contour lines using a simplified marching squares approach
      // We scan a grid and interpolate lines for cleaner visuals than dots
      const gridSize = 16 // Resolution of the grid
      const cols = Math.ceil(this.width / gridSize)
      const rows = Math.ceil(this.height / gridSize)
      
      // Pre-calculate heights for the grid points to save per-frame calculations
      // (Ideally we cache this if terrain is static, but we might animate noiseOffset later)
      const grid: number[][] = []
      for (let y = 0; y <= rows; y++) {
        const row: number[] = []
        for (let x = 0; x <= cols; x++) {
           row.push(this.getHeight(x * gridSize, y * gridSize))
        }
        grid.push(row)
      }
      
      this.ctx.lineWidth = 1
      this.ctx.strokeStyle = 'rgba(0, 217, 255, 0.15)' // Faint cyan lines
      
      const levels = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5]
      
      levels.forEach(level => {
        this.ctx!.beginPath()
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            // Get values at corners of the cell
            const tl = grid[y][x]
            const tr = grid[y][x+1]
            const br = grid[y+1][x+1]
            const bl = grid[y+1][x]
            
            // Simple linear interpolation for horizontal and vertical edges
            // We check if the level is between the corner values
            
            // Top edge
            if ((tl < level && tr >= level) || (tl >= level && tr < level)) {
               const t = (level - tl) / (tr - tl)
               const px = (x + t) * gridSize
               const py = y * gridSize
               this.ctx!.moveTo(px, py)
               // Determine exit point (simplified: just connect to bottom or right for now to avoid full MS look up table complexity)
               // A full marching squares implementation is verbose.
               // Let's use a "Marching Lines" approximation:
               // Just draw segments within cells that cross thresholds.
               
               // Better visual trick:
               // Draw the grid lines but displace them by height? No, user wants contour map.
            }
          }
        }
        // Full marching squares is too big for a quick snippet.
        // Reverting to the "flow line" or optimized dot approach but ensuring density.
        // Actually, let's do the "Dotted Isoline" properly.
      })
      
      // Retry Dotted approach but optimized:
      const scanStep = 6
      for (let x = 0; x < this.width; x += scanStep) {
        for (let y = 0; y < this.height; y += scanStep) {
           const h = this.getHeight(x, y)
           let isContour = false
           // Smoother bands
           for (const l of levels) {
             if (Math.abs(h - l) < 0.08) {
               isContour = true
               break
             }
           }
           
           if (isContour) {
             // Calculate color based on height 'h' (approx -1.8 to 1.8)
             // Map h to 0-1 for blue gradient
             // Lower h (bottom) -> Brighter Cyan/Blue
             // Higher h (top) -> Darker/Transparent
             
             // Normalize roughly
             const norm = (h + 1.8) / 3.6 // 0 to 1
             // Invert for "bottom lightest"
             const brightness = 1 - Math.max(0, Math.min(1, norm))
             
             // Base color cyan: 0, 217, 255
             // Adjust alpha/brightness
             const alpha = 0.05 + brightness * 0.3 // 0.05 to 0.35
             
             this.ctx!.fillStyle = `rgba(0, 217, 255, ${alpha})`
             this.ctx!.fillRect(x, y, 1.5, 1.5)
           }
           
           // Low area glow - kept subtle for extra depth at very bottom
           if (h < -1.0) {
              this.ctx!.fillStyle = 'rgba(0, 217, 255, 0.02)'
              this.ctx!.fillRect(x, y, scanStep, scanStep)
           }
        }
      }

      // Draw Particles (Agents)
      this.particles.forEach(p => {
        // Draw trail
        if (p.trail.length > 1) {
           this.ctx!.beginPath()
           this.ctx!.moveTo(p.trail[0].x, p.trail[0].y)
           for (let i = 1; i < p.trail.length; i++) {
              // Draw segments with increasing opacity? 
              // Hard to do with single stroke.
              // Let's just draw lines between points individually
           }
           // Simple single path
           p.trail.forEach((pt, i) => {
              if (i === 0) this.ctx!.moveTo(pt.x, pt.y)
              else this.ctx!.lineTo(pt.x, pt.y)
           })
           
           // Gradient stroke?
           // Create gradient from start to end of trail
           if (p.trail.length > 1) {
             const start = p.trail[0]
             const end = p.trail[p.trail.length - 1]
             const grad = this.ctx!.createLinearGradient(start.x, start.y, end.x, end.y)
             grad.addColorStop(0, 'rgba(0,0,0,0)')
             grad.addColorStop(1, p.color) // Full color at head
             this.ctx!.strokeStyle = grad
             this.ctx!.lineWidth = 2
             this.ctx!.stroke()
           }
        }

        this.ctx!.fillStyle = p.color
        
        // Draw head
        this.ctx!.beginPath()
        this.ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        this.ctx!.fill()
        
        // Glow
        this.ctx!.shadowBlur = 15
        this.ctx!.shadowColor = p.color
        this.ctx!.stroke() // Trigger shadow
        this.ctx!.shadowBlur = 0
        
        // Flash if stuck (finding minimum)
        if (p.stuckFrames > 0) {
           this.ctx!.beginPath()
           this.ctx!.arc(p.x, p.y, p.radius + p.stuckFrames * 0.5, 0, Math.PI * 2)
           // Soft flash: reduced max opacity
           const opacity = (1 - p.stuckFrames/60) * 0.6
           this.ctx!.strokeStyle = `rgba(255, 255, 255, ${opacity})`
           this.ctx!.lineWidth = 1
           this.ctx!.stroke()
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
.gradient-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
  background: radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0f0f1a 100%);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
