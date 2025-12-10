<template>
  <div class="gradient-bg" ref="container" @click="handleClick">
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
  opacity: number
  foundGlobalMin: boolean
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
      noiseOffset: { x: 0, y: 0 },
      time: 0,
      scaleX: 0.005,
      scaleY: 0.005,
      isTransitioning: false,
      transitionProgress: 0,
      oldNoiseOffset: { x: 0, y: 0 },
      newNoiseOffset: { x: 0, y: 0 },
      transitionStartTime: 0,
      transitionDuration: 2000,
      globalMinHeight: 0 as number
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
      
      this.noiseOffset = {
        x: Math.random() * 1000,
        y: Math.random() * 1000
      }
      
      this.handleResize()
      this.spawnParticles()
      this.findGlobalMinimum()
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
      
      const targetScale = 0.002
      const periodX = 2 * Math.PI
      const periodsX = Math.max(1, Math.round((this.width * targetScale) / periodX))
      this.scaleX = (periodsX * periodX) / this.width
      
      const periodsY = Math.max(1, Math.round((this.height * targetScale) / periodX))
      this.scaleY = (periodsY * periodX) / this.height
    },
    
    findGlobalMinimum() {
      let minHeight = Infinity
      const step = 20
      
      for (let x = 0; x < this.width; x += step) {
        for (let y = 0; y < this.height; y += step) {
          const h = this.getHeight(x, y)
          if (h < minHeight) {
            minHeight = h
          }
        }
      }
      
      this.globalMinHeight = minHeight
    },
    
    getHeightAtOffset(x: number, y: number, offsetX: number, offsetY: number) {
      const v1 = Math.sin(x * this.scaleX + offsetX) * Math.cos(y * this.scaleY + offsetY)
      const v2 = Math.sin((x + y * 0.7) * this.scaleX * 1.3 + offsetX * 0.5) * 0.4
      const v3 = Math.cos((x * 0.6 - y) * this.scaleY * 1.1 + offsetY * 0.8) * 0.25
      
      return v1 + v2 + v3
    },
    
    getHeight(x: number, y: number) {
      if (this.isTransitioning) {
        const oldHeight = this.getHeightAtOffset(x, y, this.oldNoiseOffset.x, this.oldNoiseOffset.y)
        const newHeight = this.getHeightAtOffset(x, y, this.newNoiseOffset.x, this.newNoiseOffset.y)
        
        const t = this.transitionProgress
        const eased = t * t * (3 - 2 * t)
        
        return oldHeight + (newHeight - oldHeight) * eased
      }
      
      return this.getHeightAtOffset(x, y, this.noiseOffset.x, this.noiseOffset.y)
    },
    
    handleClick() {
      if (this.isTransitioning) return
      
      this.oldNoiseOffset = { ...this.noiseOffset }
      
      this.newNoiseOffset = {
        x: Math.random() * 1000,
        y: Math.random() * 1000
      }
      
      this.isTransitioning = true
      this.transitionProgress = 0
      this.transitionStartTime = performance.now()
      
      this.particles.forEach(p => {
        p.vx = 0
        p.vy = 0
        p.foundGlobalMin = false
        p.stuckFrames = 0
        p.life = 0
      })
    },
    
    spawnParticles() {
      this.particles = []
      this.respawnParticle(0)
    },
    
    respawnParticle(index: number) {
      const p = this.particles[index] || {} as Particle
      
      p.x = Math.random() * this.width
      p.y = Math.random() * this.height
      p.vx = (Math.random() - 0.5) * 2
      p.vy = (Math.random() - 0.5) * 2
      p.stuckFrames = 0
      p.life = 0
      p.radius = 4 + Math.random() * 2
      p.trail = []
      p.opacity = 0
      p.foundGlobalMin = false
      
      const colors = ['#00d9ff', '#ff6b35', '#ffd23f', '#ffffff']
      p.color = colors[Math.floor(Math.random() * colors.length)]
      
      if (!this.particles[index]) {
        this.particles[index] = p
      }
    },
    
    update() {
      if (!this.ctx) return
      
      this.time += 0.002
      
      if (this.isTransitioning) {
        const elapsed = performance.now() - this.transitionStartTime
        this.transitionProgress = Math.min(1, elapsed / this.transitionDuration)
        
        if (this.transitionProgress >= 1) {
          this.transitionProgress = 1
          this.noiseOffset = { ...this.newNoiseOffset }
          this.isTransitioning = false
          this.transitionProgress = 0
          this.findGlobalMinimum()
        }
      }
      
      this.particles.forEach((p, i) => {
        if (this.isTransitioning) {
          if (p.opacity < 1) {
            p.opacity = Math.min(1, p.opacity + 0.02)
          }
          return
        }
        
        const h = this.getHeight(p.x, p.y)
        const step = 2
        const hx = this.getHeight(p.x + step, p.y)
        const hy = this.getHeight(p.x, p.y + step)
        
        const dx = (hx - h) / step
        const dy = (hy - h) / step
        
        const gravity = 2 
        p.vx += -dx * gravity
        p.vy += -dy * gravity
        
        p.vx *= 0.98 
        p.vy *= 0.98
        
        p.vx += (Math.random() - 0.5) * 0.05
        p.vy += (Math.random() - 0.5) * 0.05
        
        p.x += p.vx
        p.y += p.vy
        p.life++
        
        if (p.opacity < 1) {
           p.opacity = Math.min(1, p.opacity + 0.02)
        }
        
        p.trail.push({x: p.x, y: p.y})
        if (p.trail.length > 50) {
           p.trail.shift()
        }
        
        if (p.x < 0) p.x += this.width
        if (p.x > this.width) p.x -= this.width
        if (p.y < 0) p.y += this.height
        if (p.y > this.height) p.y -= this.height
        
        if (p.trail.length > 0) {
           const last = p.trail[p.trail.length - 1]
           const dist = Math.hypot(p.x - last.x, p.y - last.y)
           if (dist > 100) {
              p.trail = []
           }
        }
        
        const speed = Math.hypot(p.vx, p.vy)
        if (speed < 0.1 && p.life > 20) {
           p.stuckFrames = Math.min(120, p.stuckFrames + 1)
           
           const currentHeight = this.getHeight(p.x, p.y)
           if (currentHeight < this.globalMinHeight + 0.05) {
              p.foundGlobalMin = true
           }
        } else {
           p.stuckFrames = Math.max(0, p.stuckFrames - 0.5)
        }
        
        if (p.foundGlobalMin) {
           p.vx *= 0.9
           p.vy *= 0.9
           if (Math.abs(p.vx) < 0.001) p.vx = 0
           if (Math.abs(p.vy) < 0.001) p.vy = 0
           return
        }
        
        if (p.stuckFrames > 60 || p.life > 3600) {
           this.respawnParticle(i)
        }
      })
    },
    
    draw() {
      if (!this.ctx) return
      
      this.ctx.clearRect(0, 0, this.width, this.height)
      
      const gridSize = 16
      const cols = Math.ceil(this.width / gridSize)
      const rows = Math.ceil(this.height / gridSize)
      
      const grid: number[][] = []
      for (let y = 0; y <= rows; y++) {
        const row: number[] = []
        for (let x = 0; x <= cols; x++) {
           row.push(this.getHeight(x * gridSize, y * gridSize))
        }
        grid.push(row)
      }
      
      this.ctx.lineWidth = 1
      this.ctx.strokeStyle = 'rgba(0, 217, 255, 0.15)'
      
      const levels = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5]
      
      levels.forEach(level => {
        this.ctx!.beginPath()
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const tl = grid[y][x]
            const tr = grid[y][x+1]
            
            if ((tl < level && tr >= level) || (tl >= level && tr < level)) {
               const t = (level - tl) / (tr - tl)
               const px = (x + t) * gridSize
               const py = y * gridSize
               this.ctx!.moveTo(px, py)
            }
          }
        }
      })
      
      const scanStep = 6
      for (let x = 0; x < this.width; x += scanStep) {
        for (let y = 0; y < this.height; y += scanStep) {
           const h = this.getHeight(x, y)
           let isContour = false
           for (const l of levels) {
             if (Math.abs(h - l) < 0.08) {
               isContour = true
               break
             }
           }
           
           if (isContour) {
             const norm = (h + 1.8) / 3.6
             const brightness = 1 - Math.max(0, Math.min(1, norm))
             const alpha = 0.08 + brightness * 0.5
             
             this.ctx!.fillStyle = `rgba(0, 217, 255, ${alpha})`
             this.ctx!.fillRect(x, y, 1.5, 1.5)
           }
           
           if (h < -0.8) {
              const glowIntensity = Math.min(0.06, (-0.8 - h) * 0.04)
              this.ctx!.fillStyle = `rgba(0, 217, 255, ${glowIntensity})`
              this.ctx!.fillRect(x, y, scanStep, scanStep)
           }
        }
      }

      this.particles.forEach(p => {
        if (p.trail.length > 1) {
           this.ctx!.beginPath()
           this.ctx!.moveTo(p.trail[0].x, p.trail[0].y)
           p.trail.forEach((pt, i) => {
              if (i === 0) this.ctx!.moveTo(pt.x, pt.y)
              else this.ctx!.lineTo(pt.x, pt.y)
           })
           
           if (p.trail.length > 1) {
             const start = p.trail[0]
             const end = p.trail[p.trail.length - 1]
             const grad = this.ctx!.createLinearGradient(start.x, start.y, end.x, end.y)
             grad.addColorStop(0, 'rgba(0,0,0,0)')
             
             this.ctx!.save()
             this.ctx!.globalAlpha = p.opacity
             
             grad.addColorStop(1, p.color)
             this.ctx!.strokeStyle = grad
             this.ctx!.lineWidth = 2
             this.ctx!.stroke()
             
             this.ctx!.restore()
           }
        }

        this.ctx!.save()
        this.ctx!.globalAlpha = p.opacity
        
        this.ctx!.shadowBlur = 25
        this.ctx!.shadowColor = p.color
        
        this.ctx!.fillStyle = p.color
        this.ctx!.globalAlpha = p.opacity * 0.3
        this.ctx!.beginPath()
        this.ctx!.arc(p.x, p.y, p.radius + 4, 0, Math.PI * 2)
        this.ctx!.fill()
        
        this.ctx!.globalAlpha = p.opacity
        this.ctx!.fillStyle = p.color
        this.ctx!.beginPath()
        this.ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        this.ctx!.fill()
        
        this.ctx!.shadowBlur = 0
        this.ctx!.restore()
        
        if (p.stuckFrames > 0) {
           this.ctx!.save()
           
           if (p.foundGlobalMin) {
              const pulse = Math.sin(p.stuckFrames * 0.15) * 6 + 8
              
              for (let ring = 0; ring < 3; ring++) {
                 const ringPulse = pulse + ring * 4
                 const ringAlpha = 0.6 - ring * 0.15
                 this.ctx!.beginPath()
                 this.ctx!.arc(p.x, p.y, p.radius + ringPulse, 0, Math.PI * 2)
                 this.ctx!.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`
                 this.ctx!.lineWidth = 3 - ring * 0.5
                 this.ctx!.shadowBlur = 25
                 this.ctx!.shadowColor = 'rgba(255, 255, 255, 0.8)'
                 this.ctx!.stroke()
              }
              
              this.ctx!.beginPath()
              this.ctx!.arc(p.x, p.y, p.radius + 2, 0, Math.PI * 2)
              this.ctx!.fillStyle = 'rgba(255, 255, 255, 0.4)'
              this.ctx!.fill()
           } else {
              const pulse = Math.sin(p.stuckFrames * 0.1) * 4 + 5
              const intensity = Math.min(1, p.stuckFrames / 60) * 0.4
              
              this.ctx!.beginPath()
              this.ctx!.arc(p.x, p.y, p.radius + pulse, 0, Math.PI * 2)
              this.ctx!.strokeStyle = `rgba(255, 255, 255, ${intensity})`
              this.ctx!.lineWidth = 2
              this.ctx!.shadowBlur = 10
              this.ctx!.shadowColor = 'rgba(255, 255, 255, 0.5)'
              this.ctx!.stroke()
           }
           
           this.ctx!.restore()
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
  cursor: pointer;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
