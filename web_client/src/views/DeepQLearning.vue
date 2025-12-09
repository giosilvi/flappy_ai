<template>
  <div class="dql-page">
    <header class="hero">
      <GradientDescentBackground ref="gradientBg" />
      <router-link to="/" class="back-link">← Back to VibeGames</router-link>
      <div class="hero-content" @click="handleHeroClick">
        <p class="eyebrow">Reinforcement Learning</p>
        <h1 class="glow-text">Deep Q-Learning</h1>
        <p class="lede">
          Theory and mechanics of Deep Q-Learning: value estimation, Bellman targets, replay buffers, target networks, and ε-greedy exploration — all runnable in-browser.
        </p>
      </div>
    </header>

    <main class="content">
      <section class="panel">
        <h2>At a Glance</h2>
        <div class="grid two">
          <div class="card">
            <h3>State → Q-Values</h3>
            <p>
              A neural network estimates Q(s, a) for each discrete action, capturing the expected discounted return if that action is taken now and followed by a good policy.
            </p>
          </div>
          <div class="card">
            <h3>Learning Signal</h3>
            <p>
              Bellman backups anchor predictions: <code>Q(s, a) ← r + γ · max_a' Q_target(s', a')</code>. Temporal-difference error (target − prediction) drives gradient descent.
            </p>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>1) Observations</h2>
          <p class="tag">Inputs</p>
        </div>
        <p>
          Keep the state compact and stable; normalize where possible:
        </p>
        <ul class="bullets">
          <li><strong>Environment signals</strong>: positions, velocities, distances, booleans; scaled/standardized.</li>
          <li><strong>Lookahead</strong>: include the next key events/targets for better foresight.</li>
          <li><strong>Temporal info</strong>: stack frames or add velocities to avoid ambiguity.</li>
        </ul>
        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Diagram showing an agent receiving normalized state features (positions, velocities, distances) feeding into a vector"
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>2) Network</h2>
          <p class="tag">Function Approximator</p>
        </div>
        <p>
          A small MLP (for tabular-friendly state) or CNN (for pixels) predicts Q-values:
        </p>
        <ul class="bullets">
          <li>Input: feature vector (or encoded frames)</li>
          <li>Hidden: a few dense or convolutional layers with ReLU/SiLU</li>
          <li>Output: |A| neurons → one Q-value per discrete action</li>
        </ul>
        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Neural network diagram with input vector, two hidden layers with ReLU, and output nodes representing Q-values for multiple actions"
          </p>
        </div>
      </section>

      <section class="panel glass-panel">
        <div class="section-header">
          <h2>3) Learning Loop</h2>
          <p class="tag">DQN Steps</p>
        </div>
        
        <div class="timeline">
          <div class="timeline-step">
            <div class="step-marker">1</div>
            <div class="step-content">
              <h4>Act</h4>
              <p>ε-greedy policy: random action (ε) or best Q-value.</p>
            </div>
          </div>
          <div class="timeline-step">
            <div class="step-marker">2</div>
            <div class="step-content">
              <h4>Store</h4>
              <p>Save experience <code>(s, a, r, s', done)</code> to replay buffer.</p>
            </div>
          </div>
          <div class="timeline-step">
            <div class="step-marker">3</div>
            <div class="step-content">
              <h4>Sample</h4>
              <p>Draw a random mini-batch to break correlations.</p>
            </div>
          </div>
          <div class="timeline-step">
            <div class="step-marker">4</div>
            <div class="step-content">
              <h4>Target</h4>
              <p>Calculate Bellman target using the stable target net.</p>
            </div>
          </div>
          <div class="timeline-step">
            <div class="step-marker">5</div>
            <div class="step-content">
              <h4>Update</h4>
              <p>Backpropagate loss (MSE) to update online weights.</p>
            </div>
          </div>
          <div class="timeline-step">
            <div class="step-marker">6</div>
            <div class="step-content">
              <h4>Sync</h4>
              <p>Periodically copy online weights to target network.</p>
            </div>
          </div>
        </div>

        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Flowchart of the DQN loop: act → store → sample → target → update → sync"
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>4) Replay Buffer</h2>
          <p class="tag">Stability</p>
        </div>
        <p>
          Experience replay breaks correlation between consecutive states and reuses past data efficiently. Large buffers (e.g., 50k–1M) with mini-batches (e.g., 32) improve stability. Prioritized replay samples more surprising experiences to speed learning.
        </p>
        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Queue-style illustration of a replay buffer with random sampling feeding a neural network update"
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>5) Exploration</h2>
          <p class="tag">Epsilon Schedule</p>
        </div>
        <p>
          ε starts high to explore and decays to a low floor for exploitation. Linear or exponential decay are common; you can also use cosine restarts or noise-based policies for continued exploration.
        </p>
        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Line chart of epsilon decay from high to low across training steps"
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>6) Rewards</h2>
          <p class="tag">Shaping</p>
        </div>
        <ul class="bullets">
          <li><strong>Sparse vs dense:</strong> Use shaping carefully to guide behavior without changing the optimal policy.</li>
          <li><strong>Penalties:</strong> Small step costs can encourage efficiency; terminal negatives clarify failure.</li>
          <li><strong>Bonuses:</strong> Directional rewards (progress-to-goal) improve sample efficiency.</li>
        </ul>
        <p>
          Tune rewards to emphasize signal clarity: consistent scales, limited clipping, and avoidance of conflicting incentives.
        </p>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>7) Target Network</h2>
          <p class="tag">Stability</p>
        </div>
        <p>
          Keeping a lagged target network reduces moving-target instability. Copy online weights into the target every N steps or use soft updates (Polyak averaging).
        </p>
        <div class="image-placeholder">
          <p class="label">Image placeholder</p>
          <p class="prompt">
            Prompt: "Illustration of online network and target network with periodic weight sync arrows"
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>8) Loss & Optimization</h2>
          <p class="tag">Training Signal</p>
        </div>
        <p>
          Standard DQN uses mean-squared TD error; Huber loss can temper outliers. Adam/AdamW optimizers with learning rates around 1e-3–1e-4 are common. Gradient clipping (e.g., 1.0) helps prevent spikes.
        </p>
      </section>

      <section class="panel">
        <div class="section-header">
          <h2>9) Stability Checklist</h2>
          <p class="tag">Practical Tips</p>
        </div>
        <ul class="bullets">
          <li>Normalize inputs; consider reward scaling/clipping.</li>
          <li>Use sufficient replay buffer warmup before training.</li>
          <li>Keep batch sizes modest (32–128) for stable updates.</li>
          <li>Track Q-value magnitudes; exploding values hint at instability.</li>
          <li>Periodically evaluate with ε = 0 to measure policy quality.</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import GradientDescentBackground from '@/components/GradientDescentBackground.vue'

export default defineComponent({
  name: 'DeepQLearning',
  components: {
    GradientDescentBackground
  },
  data() {
    return {
      prevHtmlOverflow: '',
      prevBodyOverflow: '',
    }
  },
  mounted() {
    // Allow scrolling on this long-form page
    const html = document.documentElement
    const body = document.body
    this.prevHtmlOverflow = html.style.overflowY
    this.prevBodyOverflow = body.style.overflowY
    html.style.overflowY = 'auto'
    body.style.overflowY = 'auto'
  },
  beforeUnmount() {
    // Restore previous overflow settings when leaving
    const html = document.documentElement
    const body = document.body
    html.style.overflowY = this.prevHtmlOverflow
    body.style.overflowY = this.prevBodyOverflow
  },
  methods: {
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
.dql-page {
  min-height: 100vh;
  background: var(--color-bg-dark);
  color: var(--color-text);
  font-family: var(--font-body);
}

.hero {
  position: relative;
  padding: 100px 20px 80px; /* Increased padding */
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
  cursor: pointer; /* Indicate it's clickable */
}

.eyebrow {
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-primary);
  font-weight: 700;
  margin-bottom: 24px;
  font-size: 0.75rem;
  font-family: 'Press Start 2P', monospace;
  text-shadow: 0 0 10px rgba(0, 217, 255, 0.4);
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
  font-size: 1.15rem;
  line-height: 1.7;
  max-width: 720px;
  margin: 0 auto;
  position: relative; /* Ensure z-index works if needed, though hero-content handles it */
  text-shadow: 0 1px 4px rgba(0,0,0,0.8); /* Added shadow for readability over animation */
}

/* Removed intro-section styles as it's merged */

.content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px 80px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.glass-panel, .panel {
  background: rgba(22, 33, 62, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s, border-color 0.2s;
}

.glass-panel:hover {
  border-color: rgba(0, 217, 255, 0.3);
  transform: translateY(-2px);
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
  gap: 24px;
}

.grid.two {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.card {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  transition: all 0.2s;
}

.card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.1);
}

.card h3 {
  color: var(--color-primary);
  font-size: 0.9rem;
  margin-bottom: 16px;
  font-weight: 600;
  font-family: 'Press Start 2P', monospace;
  line-height: 1.5;
}

code {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: var(--color-accent);
  font-size: 0.9em;
}

.bullets {
  padding-left: 20px;
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.bullets li {
  margin-bottom: 10px;
}

.bullets strong {
  color: var(--color-text);
}

/* Timeline Visualization */
.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 24px 0;
}

.timeline-step {
  position: relative;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: all 0.2s;
}

.timeline-step:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--color-secondary);
}

.step-marker {
  width: 32px;
  height: 32px;
  background: var(--color-secondary);
  color: white;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  margin-bottom: 12px;
  box-shadow: 4px 4px 0px rgba(0,0,0,0.3);
  font-family: 'Press Start 2P', monospace;
  border: 2px solid rgba(255,255,255,0.2);
}

.step-content h4 {
  color: var(--color-text);
  margin-bottom: 8px;
  font-weight: 600;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.8rem;
  line-height: 1.4;
}

.step-content p {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  line-height: 1.4;
  margin: 0;
}

.image-placeholder {
  margin-top: 24px;
  padding: 24px;
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  text-align: center;
}

.image-placeholder .label {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.7rem;
  margin-bottom: 12px;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.image-placeholder .prompt {
  color: var(--color-primary);
  font-size: 0.9rem;
  font-style: italic;
}

@media (max-width: 768px) {
  h1.glow-text {
    font-size: 1.8rem;
  }
  
  .panel {
    padding: 24px;
  }
  
  .back-link {
    position: static;
    display: inline-block;
    margin-bottom: 20px;
  }
}
</style>
