<template>
  <div class="leaderboards-page">
    <header class="hero">
      <GradientDescentBackground ref="gradientBg" />
      <router-link to="/" class="back-link">← Back to VibeGames</router-link>
      <div class="hero-content" @click="handleHeroClick">
        <p class="eyebrow">Community</p>
        <h1 class="glow-text">Leaderboards</h1>
        <p class="lede">
          Track champions across every game. Scores are adjusted for network efficiency, so smaller models can shine. More games will appear here as they launch.
        </p>
      </div>
    </header>

    <main class="content">
      <section class="panel">
        <div class="section-header">
          <h2>All Games</h2>
          <p class="tag">Live Leaderboards</p>
        </div>

        <div class="grid">
          <div 
            v-for="game in games"
            :key="game.id"
            class="card glass-card"
          >
            <div class="card-head">
              <div>
                <p class="eyebrow small">{{ game.id }}</p>
                <h3>{{ game.name }}</h3>
                <p class="subtitle">{{ game.description }}</p>
              </div>
              <div class="meta">
                <span>up to {{ maxInputs(game.id) }} inputs · {{ game.outputDim }} actions</span>
              </div>
            </div>

            <div v-if="leaderboards[game.id]?.loading" class="loading-state">
              <div class="spinner"></div>
              <p>Loading leaderboard...</p>
            </div>

            <div v-else>
              <div class="champion-row" v-if="leaderboards[game.id]?.entries.length">
                <div class="crown">👑</div>
                <div class="champion-info">
                  <p class="label">Champion</p>
                  <p class="name">{{ leaderboards[game.id]?.entries[0]?.name }}</p>
                  <p class="score">{{ leaderboards[game.id]?.entries[0]?.score }} pts ({{ leaderboards[game.id]?.entries[0]?.pipes || leaderboards[game.id]?.entries[0]?.score }} pipes)</p>
                </div>
              </div>

              <table class="mini-table" v-if="leaderboards[game.id]?.entries.length">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Pipes</th>
                    <th>Score</th>
                    <th>Params</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(entry, index) in leaderboards[game.id]?.entries" :key="entry.id">
                    <td>{{ index + 1 }}</td>
                    <td>{{ entry.name }}</td>
                    <td>{{ entry.pipes || entry.score }}</td>
                    <td>{{ entry.score }}</td>
                    <td>{{ formatParams(entry.params) }}</td>
                  </tr>
                </tbody>
              </table>

              <div class="empty-state" v-else>
                <p>No scores yet. Train a model to claim the top spot.</p>
              </div>
            </div>

            <div class="card-actions">
              <router-link :to="`/game/${game.id}`" class="btn btn-primary">Play &amp; Train</router-link>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import GradientDescentBackground from '@/components/GradientDescentBackground.vue'
import { getAllGames, type GameInfo } from '@/games'
import { apiClient, type LeaderboardEntry } from '@/services/apiClient'
import { ObservationLabels } from '@/games/flappy/GameState'

type LeaderboardState = {
  entries: LeaderboardEntry[]
  loading: boolean
}

export default defineComponent({
  name: 'Leaderboards',
  components: {
    GradientDescentBackground
  },
  data() {
    return {
      games: [] as GameInfo[],
      leaderboards: {} as Record<string, LeaderboardState>,
      prevHtmlOverflow: '',
      prevBodyOverflow: '',
    }
  },
  created() {
    this.games = getAllGames()
    const initial: Record<string, LeaderboardState> = {}
    for (const game of this.games) {
      initial[game.id] = { entries: [], loading: true }
    }
    this.leaderboards = initial
  },
  mounted() {
    // Allow scrolling on this page
    const html = document.documentElement
    const body = document.body
    this.prevHtmlOverflow = html.style.overflowY
    this.prevBodyOverflow = body.style.overflowY
    html.style.overflowY = 'auto'
    body.style.overflowY = 'auto'

    this.loadLeaderboards()
  },
  beforeUnmount() {
    // Restore previous overflow settings
    const html = document.documentElement
    const body = document.body
    html.style.overflowY = this.prevHtmlOverflow
    body.style.overflowY = this.prevBodyOverflow
  },
  methods: {
    async loadLeaderboards() {
      const promises = this.games.map(async (game) => {
        try {
          const result = await apiClient.getLeaderboard(game.id, 10)
          this.leaderboards[game.id] = {
            entries: result.entries || [],
            loading: false,
          }
        } catch (error) {
          console.error(`[Leaderboards] Failed to load ${game.id}:`, error)
          this.leaderboards[game.id] = { entries: [], loading: false }
        }
      })
      await Promise.all(promises)
    },
    formatParams(params: number | undefined): string {
      if (!params) return '—'
      if (params >= 1000) return `${(params / 1000).toFixed(1)}K`
      return params.toString()
    },
    maxInputs(gameId: string): number {
      if (gameId === 'flappy') return ObservationLabels.length
      const game = this.games.find(g => g.id === gameId)
      return game?.inputDim || 0
    },
    handleHeroClick() {
      const gradientBg = this.$refs.gradientBg as any
      if (gradientBg && gradientBg.handleClick) {
        gradientBg.handleClick()
      }
    },
  },
})
</script>

<style scoped>
.leaderboards-page {
  min-height: 100vh;
  background: var(--color-bg-dark);
  color: var(--color-text);
  font-family: var(--font-body);
}

.hero {
  position: relative;
  padding: 100px 20px 80px;
  text-align: center;
  overflow: hidden;
  border-bottom: 1px solid var(--color-border);
}

.back-link {
  position: absolute;
  top: 24px;
  left: 24px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.75rem;
  z-index: 10;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  transition: all 0.2s;
  border: 1px solid transparent;
  font-family: 'Press Start 2P', monospace;
  line-height: 1.5;
}

.back-link:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: rgba(0, 217, 255, 0.1);
}

.hero-content {
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  z-index: 1;
  cursor: pointer;
}

.eyebrow {
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-primary);
  font-weight: 700;
  margin-bottom: 16px;
  font-size: 0.75rem;
  font-family: 'Press Start 2P', monospace;
  text-shadow: 0 0 10px rgba(0, 217, 255, 0.4);
}

.eyebrow.small {
  margin-bottom: 6px;
  display: inline-block;
}

h1.glow-text {
  font-family: 'Press Start 2P', monospace;
  font-size: 2.4rem;
  line-height: 1.4;
  margin-bottom: 24px;
  color: #fff;
  text-shadow:
    2px 2px 0px var(--color-secondary),
    0 0 20px rgba(0, 217, 255, 0.5);
}

.lede {
  color: var(--color-text-secondary);
  font-size: 1.1rem;
  line-height: 1.7;
  max-width: 720px;
  margin: 0 auto;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
}

.content {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}

.panel {
  background: rgba(22, 33, 62, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.section-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.5px;
  font-family: 'Press Start 2P', monospace;
  line-height: 1.5;
}

.tag {
  background: rgba(0, 217, 255, 0.1);
  color: var(--color-primary);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-family: 'Press Start 2P', monospace;
  text-transform: uppercase;
  border: 1px solid rgba(0, 217, 255, 0.2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
}

.glass-card {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s;
}

.glass-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.1);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-head h3 {
  color: var(--color-primary);
  font-size: 1rem;
  margin: 0;
  font-family: 'Press Start 2P', monospace;
  line-height: 1.5;
}

.subtitle {
  color: var(--color-text-secondary);
  margin: 4px 0 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.meta {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  text-align: right;
}

.champion-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin: 14px 0;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
}

.crown {
  font-size: 1.6rem;
}

.champion-info .label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.champion-info .name {
  margin: 2px 0;
  font-weight: 700;
  color: var(--color-text);
}

.champion-info .score {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
}

.mini-table th,
.mini-table td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.85rem;
}

.mini-table th {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  padding: 20px 0;
  color: var(--color-text-muted);
}

.loading-state {
  text-align: center;
  padding: 20px 0;
  color: var(--color-text-muted);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.card-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 14px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9rem;
  text-align: center;
  border: 1px solid transparent;
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-primary), #0099cc);
  color: var(--color-bg-dark);
}

.btn-secondary {
  background: var(--color-bg-dark);
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn:hover {
  opacity: 0.9;
}

@media (max-width: 768px) {
  h1.glow-text {
    font-size: 1.8rem;
  }
  .panel {
    padding: 24px;
  }
  .card-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .meta {
    text-align: left;
  }
}
</style>
