<template>
  <div class="landing-page">
    <!-- Hero Section -->
    <header class="hero">
      <GradientDescentBackground ref="gradientBg" />
      <div class="hero-content" @click="handleHeroClick">
        <h1 class="hero-title glow-text">
          <span class="brand">VibeGames</span>
        </h1>
        <p class="hero-subtitle">
          Train neural networks in your browser to beat classic games
        </p>
      </div>
    </header>

    <!-- Intro Text Section -->
    <section class="intro-section">
      <p class="hero-description">
        No servers required. Your AI runs 100% locally in your browser.
        Watch it learn, tweak the parameters, and compete on the leaderboard.
      </p>
    </section>

    <!-- Games Section -->
    <main class="games-section">
      <h2 class="section-title">Choose Your Game</h2>
      <div class="games-grid">
        <router-link 
          v-for="game in games" 
          :key="game.id"
          :to="`/game/${game.id}`"
          class="game-card"
        >
          <NeuralBirdBackground v-if="game.id === 'flappy'" />
          <div class="game-thumbnail">
            <img 
              v-if="game.thumbnail" 
              :src="game.thumbnail" 
              :alt="game.name"
              class="game-image"
            />
            <div v-else class="game-placeholder">
              {{ game.name.charAt(0) }}
            </div>
          </div>
          <div class="game-info">
            <h3 class="game-name">{{ game.name }}</h3>
            <p class="game-description">{{ game.description }}</p>
            <div class="game-meta">
              <span class="meta-item">
                <span class="meta-label">Inputs:</span> {{ game.inputDim }}
              </span>
              <span class="meta-item">
                <span class="meta-label">Actions:</span> {{ game.outputDim }}
              </span>
            </div>
          </div>
          <div class="play-button">
            Start Training
          </div>
        </router-link>

        <!-- Coming Soon Card -->
        <div class="game-card coming-soon">
          <div class="game-thumbnail">
            <div class="game-placeholder">?</div>
          </div>
          <div class="game-info">
            <h3 class="game-name">More Games Coming</h3>
            <p class="game-description">
              We're adding more classic games for you to train your AI on.
              Stay tuned!
            </p>
          </div>
          <div class="play-button disabled">
            Coming Soon
          </div>
        </div>
      </div>
    </main>

    <!-- Features Section -->
    <section class="features-section">
      <h2 class="section-title">How It Works</h2>
      <div class="features-grid">
        <router-link
          class="feature-card link-card"
          to="/deep-q-learning"
        >
          <div class="feature-icon">🧠</div>
          <h3 class="feature-title">Deep Q-Learning</h3>
          <p class="feature-description">
            Train a neural network using the DQN algorithm. Dive into the details and see how it learns optimal strategies through trial and error.
          </p>
          <div class="link-cta">Learn how it works →</div>
        </router-link>
        <div class="feature-card">
          <div class="feature-icon">💻</div>
          <h3 class="feature-title">100% Local</h3>
          <p class="feature-description">
            Everything runs in your browser using TensorFlow.js.
            No data leaves your device. GPU acceleration when available.
          </p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🎮</div>
          <h3 class="feature-title">Parallel Training</h3>
          <p class="feature-description">
            Run up to 1024 game instances simultaneously.
            More instances = faster learning. Scale with your hardware.
          </p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🏆</div>
          <h3 class="feature-title">Compete</h3>
          <p class="feature-description">
            Submit your best scores to the leaderboard.
            Smaller networks get bonus points for efficiency!
          </p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <p class="footer-text">
        Built with Vue 3 + TensorFlow.js
      </p>
      <p class="footer-vibe">vibe-coded with AI assistance</p>
      <p v-if="metricsLoaded" class="traffic-counts">
        visits: {{ metrics.visits }} · players: {{ metrics.players }}
      </p>
    </footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { getAllGames, type GameInfo } from '@/games'
import GradientDescentBackground from '@/components/GradientDescentBackground.vue'
import NeuralBirdBackground from '@/components/NeuralBirdBackground.vue'
import { apiClient, type TrafficMetrics } from '@/services/apiClient'

export default defineComponent({
  name: 'LandingPage',
  components: {
    GradientDescentBackground,
    NeuralBirdBackground
  },
  data() {
    return {
      games: [] as GameInfo[],
      prevHtmlOverflow: '',
      prevBodyOverflow: '',
      metrics: { visits: 0, players: 0 } as TrafficMetrics,
      metricsLoaded: false,
    }
  },
  created() {
    this.games = getAllGames()
  },
  mounted() {
    // Allow scrolling on the landing page
    const html = document.documentElement
    const body = document.body
    this.prevHtmlOverflow = html.style.overflowY
    this.prevBodyOverflow = body.style.overflowY
    html.style.overflowY = 'auto'
    body.style.overflowY = 'auto'
    this.recordVisit()
  },
  beforeUnmount() {
    // Restore previous overflow settings for game views
    const html = document.documentElement
    const body = document.body
    html.style.overflowY = this.prevHtmlOverflow
    body.style.overflowY = this.prevBodyOverflow
  },
  methods: {
    async recordVisit() {
      const metrics = await apiClient.incrementVisit()
      this.metrics = metrics
      this.metricsLoaded = true
    },
    handleHeroClick() {
      const gradientBg = this.$refs.gradientBg as any
      if (gradientBg && gradientBg.handleClick) {
        gradientBg.handleClick()
      }
    }
  }
})
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: var(--color-bg-dark);
  color: var(--color-text);
  font-family: var(--font-body);
}

/* Hero Section */
.hero {
  position: relative;
  padding: 100px 20px 80px;
  text-align: center;
  overflow: hidden;
  border-bottom: 1px solid var(--color-border);
}

.hero-content {
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  z-index: 1;
  cursor: pointer; /* Indicate it's clickable */
}

.hero-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 3.5rem;
  line-height: 1.4;
  margin-bottom: 24px;
  letter-spacing: -2px;
}

.brand {
  color: #fff;
  text-shadow: 
    3px 3px 0px var(--color-primary),
    0 0 30px rgba(0, 217, 255, 0.6);
}

.hero-subtitle {
  font-size: 1.2rem;
  font-family: 'Press Start 2P', monospace;
  color: var(--color-text);
  margin-bottom: 24px;
  line-height: 1.6;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
  letter-spacing: -0.5px;
}

.hero-description {
  font-size: 1.1rem;
  color: var(--color-text-secondary);
  line-height: 1.7;
  max-width: 640px;
  margin: 0 auto;
}

/* Intro Section */
.intro-section {
  padding: 40px 20px;
  text-align: center;
  background: var(--color-bg-mid);
  border-bottom: 1px solid var(--color-border);
}

/* Section Titles */
.section-title {
  position: relative; /* Ensure z-index works */
  z-index: 1;
  font-family: 'Press Start 2P', monospace;
  font-size: 1.5rem;
  text-align: center;
  margin-bottom: 48px;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: -1px;
  text-shadow: 0 0 15px rgba(0, 217, 255, 0.3);
}

/* Games Section */
.games-section {
  padding: 80px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 32px;
}

.game-card {
  position: relative; /* Context for absolute bg */
  background: rgba(22, 33, 62, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.game-card:hover:not(.coming-soon) {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(0, 217, 255, 0.15);
  border-color: var(--color-primary);
}

.game-card.coming-soon {
  opacity: 0.6;
  cursor: default;
  background: rgba(0, 0, 0, 0.2);
}

.game-thumbnail {
  position: relative; /* Ensure above bg */
  z-index: 1;
  height: 180px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.game-image {
  width: 96px;
  height: 96px;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));
}

.game-placeholder {
  width: 80px;
  height: 80px;
  background: var(--color-primary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Press Start 2P', monospace;
  font-size: 2rem;
  color: var(--color-bg-dark);
  box-shadow: 0 0 20px var(--color-primary-glow);
}

.game-info {
  position: relative; /* Ensure above bg */
  z-index: 1;
  padding: 24px;
  flex: 1;
}

.game-name {
  font-family: 'Press Start 2P', monospace;
  font-size: 1rem;
  line-height: 1.5;
  margin-bottom: 12px;
  color: var(--color-text);
  letter-spacing: -0.5px;
}

.game-description {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 16px;
}

.game-meta {
  display: flex;
  gap: 16px;
  font-size: 0.7rem;
  font-family: 'Press Start 2P', monospace;
  background: rgba(0, 0, 0, 0.2);
  padding: 10px 12px;
  border-radius: 6px;
  display: inline-flex;
}

.meta-item {
  color: var(--color-text-muted);
}

.meta-label {
  color: var(--color-primary);
  margin-right: 4px;
}

.play-button {
  position: relative; /* Ensure above bg */
  z-index: 1;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--color-primary) 0%, #0099cc 100%);
  color: var(--color-bg-dark);
  font-weight: 700;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: opacity 0.2s;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.75rem;
  line-height: 1.5;
}

.play-button:hover {
  opacity: 0.9;
}

.play-button.disabled {
  background: var(--color-bg-mid);
  color: var(--color-text-muted);
}

/* Features Section */
.features-section {
  padding: 80px 20px;
  background: linear-gradient(180deg, var(--color-bg-dark) 0%, var(--color-bg-mid) 100%);
  border-top: 1px solid var(--color-border);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  transition: all 0.3s ease;
}

.feature-card:hover {
  border-color: var(--color-secondary);
  transform: translateY(-4px);
  background: rgba(255, 255, 255, 0.05);
}

.feature-card.link-card {
  border-color: var(--color-primary);
  background: rgba(0, 217, 255, 0.05);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}

.feature-card.link-card:hover {
  box-shadow: 0 0 25px rgba(0, 217, 255, 0.15);
  transform: translateY(-6px);
}

.feature-icon {
  font-size: 2.5rem;
  margin-bottom: 20px;
  display: inline-block;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.2));
}

.feature-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 16px;
  color: var(--color-text);
  letter-spacing: -0.5px;
}

.feature-description {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.link-cta {
  margin-top: 16px;
  font-weight: 700;
  color: var(--color-primary);
  font-family: 'Press Start 2P', monospace;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Footer */
.footer {
  padding: 40px 20px;
  text-align: center;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-dark);
}

.footer-text {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.footer-vibe {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-style: italic;
  font-family: monospace;
}

.traffic-counts {
  color: var(--color-text-muted);
  font-size: 0.7rem;
  margin-top: 6px;
}

/* Responsive */
@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }
  
  .hero-subtitle {
    font-size: 1.2rem;
  }
  
  .games-grid {
    grid-template-columns: 1fr;
  }
}
</style>
