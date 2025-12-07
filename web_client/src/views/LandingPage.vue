<template>
  <div class="landing-page">
    <!-- Hero Section -->
    <header class="hero">
      <div class="hero-content">
        <h1 class="hero-title">
          <span class="brand">VibeGames</span>
          <span class="tagline">.it</span>
        </h1>
        <p class="hero-subtitle">
          Train neural networks in your browser to beat classic games
        </p>
        <p class="hero-description">
          No servers required. Your AI runs 100% locally in your browser.
          Watch it learn, tweak the parameters, and compete on the leaderboard.
        </p>
      </div>
    </header>

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
        <div class="feature-card">
          <div class="feature-icon">🧠</div>
          <h3 class="feature-title">Deep Q-Learning</h3>
          <p class="feature-description">
            Train a neural network using DQN (Deep Q-Network) algorithm.
            Watch it learn optimal strategies through trial and error.
          </p>
        </div>
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
    </footer>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { getAllGames, type GameInfo } from '@/games'

export default defineComponent({
  name: 'LandingPage',
  data() {
    return {
      games: [] as GameInfo[],
      prevHtmlOverflow: '',
      prevBodyOverflow: '',
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
  },
  beforeUnmount() {
    // Restore previous overflow settings for game views
    const html = document.documentElement
    const body = document.body
    html.style.overflowY = this.prevHtmlOverflow
    body.style.overflowY = this.prevBodyOverflow
  },
})
</script>

<style scoped>
.landing-page {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--color-bg) 0%, var(--color-bg-dark) 100%);
  color: var(--color-text);
}

/* Hero Section */
.hero {
  padding: 80px 20px 60px;
  text-align: center;
  background: linear-gradient(180deg, rgba(79, 195, 247, 0.1) 0%, transparent 100%);
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 16px;
  letter-spacing: -1px;
}

.brand {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.tagline {
  color: var(--color-text-secondary);
  font-weight: 400;
}

.hero-subtitle {
  font-size: 1.5rem;
  color: var(--color-text);
  margin-bottom: 16px;
  font-weight: 500;
}

.hero-description {
  font-size: 1.1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto;
}

/* Section Titles */
.section-title {
  font-size: 1.8rem;
  text-align: center;
  margin-bottom: 40px;
  color: var(--color-text);
}

/* Games Section */
.games-section {
  padding: 60px 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.game-card {
  background: var(--color-bg-light);
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
}

.game-card:hover:not(.coming-soon) {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  border-color: var(--color-primary);
}

.game-card.coming-soon {
  opacity: 0.6;
  cursor: default;
}

.game-thumbnail {
  height: 160px;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.game-image {
  width: 80px;
  height: 80px;
  object-fit: contain;
  image-rendering: pixelated;
}

.game-placeholder {
  width: 80px;
  height: 80px;
  background: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: white;
}

.game-info {
  padding: 20px;
  flex: 1;
}

.game-name {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--color-text);
}

.game-description {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
}

.game-meta {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
}

.meta-item {
  color: var(--color-text-secondary);
}

.meta-label {
  color: var(--color-primary);
  font-weight: 500;
}

.play-button {
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  color: white;
  font-weight: 600;
  text-align: center;
  transition: opacity 0.2s;
}

.play-button:hover {
  opacity: 0.9;
}

.play-button.disabled {
  background: var(--color-bg);
  color: var(--color-text-secondary);
}

/* Features Section */
.features-section {
  padding: 60px 20px;
  background: var(--color-bg-dark);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: var(--color-bg-light);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  border: 1px solid var(--color-border);
}

.feature-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
}

.feature-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--color-text);
}

.feature-description {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

/* Footer */
.footer {
  padding: 40px 20px;
  text-align: center;
  border-top: 1px solid var(--color-border);
}

.footer-text {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.footer-text a {
  color: var(--color-primary);
  text-decoration: none;
}

.footer-text a:hover {
  text-decoration: underline;
}

.footer-vibe {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-style: italic;
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
