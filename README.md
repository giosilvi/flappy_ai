# 🐦 Flappy AI

**Train a neural network to play Flappy Bird — entirely in your browser.**

A browser-first reinforcement learning playground where you can watch, tune, and train a DQN agent in real-time. No server-side ML required — everything runs on your CPU via JavaScript.

🎮 **Live Demo:** [vibegames.it](https://vibegames.it)

---

## ✨ Features

- **Real-time DQN Training** — Watch the agent learn to navigate pipes with a custom neural network implementation (no TensorFlow.js dependency)
- **Live Hyperparameter Tuning** — Adjust epsilon, learning rate, gamma, and more while training
- **Neural Network Visualization** — See activations flow through the network in real-time (click to open detailed view)
- **Multiple Training Modes:**
  - 🏋️ **Training Mode** — Agent learns with epsilon-greedy exploration
  - ⚡ **Fast Training** — Skip rendering for 10x+ speedup with DQN workflow visualization
  - 🎯 **Evaluation Mode** — Greedy policy (ε=0) for leaderboard runs
  - 🎮 **Manual Play** — Take control anytime (your plays contribute to the replay buffer!)
- **Speed Control** — Run training from 0.25x to 10x speed
- **Metrics Dashboard** — Track rewards, episode lengths, Q-values, and training progress
- **Leaderboard** — Compete for the highest pipe count

---

## 🏗️ Project Structure

```
flappy_ai/
├── web_client/           # 🌟 Main browser app (Vue 3 + TypeScript)
│   ├── src/
│   │   ├── components/   # Vue components (GameCanvas, ControlPanel, etc.)
│   │   ├── game/         # Game engine, renderer, physics
│   │   ├── rl/           # DQN agent, neural network, replay buffer
│   │   ├── services/     # API client for leaderboard
│   │   └── styles/       # CSS
│   └── public/
│       └── assets/       # Sprites and audio
│
├── FlapPyBird/           # 📚 Original Python implementation (reference/deprecated)
│   ├── rl/               # Python DQN implementation
│   ├── src/              # Python game engine
│   └── checkpoints/      # Trained model weights
│
├── deploy.sh             # Deployment script for Hetzner/VPS
├── docker-compose.yml    # Docker configuration
└── Caddyfile             # Caddy web server config
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm

### Local Development

```bash
# Clone the repository
git clone https://github.com/giosilvi/flappy_ai.git
cd flappy_ai

# Install dependencies
cd web_client
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
cd web_client
npm run build
```

The built files will be in `web_client/dist/`.

---

## 🧠 How It Works

### DQN (Deep Q-Network)

The agent uses a Deep Q-Network to learn which action (flap or don't flap) maximizes future rewards:

1. **Observation Space** (6 inputs):
   - Bird's vertical position and velocity
   - Distance to next pipe
   - Pipe gap position
   - Distance to second pipe
   - Second pipe gap position

2. **Neural Network Architecture**:
   - Input layer: 6 neurons
   - Hidden layers: 2 × 64 neurons (ReLU activation)
   - Output layer: 2 neurons (Q-values for each action)

3. **Training Process**:
   - Agent takes actions using ε-greedy policy
   - Experiences stored in replay buffer
   - Network trained on random mini-batches
   - Target network updated periodically for stability

### Reward Structure

| Event | Reward |
|-------|--------|
| Pass a pipe | +1.0 |
| Each step alive | -0.001 |
| Death (collision) | -1.0 |

---

## ⚙️ Configuration

### Hyperparameters (adjustable during training)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Epsilon (ε) | 1.0 → 0.01 | Exploration rate (decays automatically) |
| Learning Rate | 0.001 | Neural network learning rate |
| Gamma (γ) | 0.99 | Discount factor for future rewards |
| Batch Size | 64 | Samples per training step |
| Buffer Size | 50,000 | Replay buffer capacity |

### Speed Settings

- **0.25x - 1x**: Slow motion for observation
- **2x - 5x**: Accelerated training with rendering
- **10x**: Fast training (no rendering)

---

## 🌐 Deployment

### Deploy to a VPS (Hetzner, DigitalOcean, etc.)

```bash
# SSH into your server
ssh root@your-server-ip

# Clone the repository
git clone https://github.com/giosilvi/flappy_ai.git
cd flappy_ai

# Run the deploy script with your domain
chmod +x deploy.sh
./deploy.sh yourdomain.com
```

The deploy script will:
1. Install Node.js 20.x
2. Build the Vue app
3. Set up Caddy with automatic HTTPS
4. Start the containerized web server

### Requirements

- Ubuntu 22.04+ (or similar)
- Docker and Docker Compose
- Domain pointing to your server's IP

---

## 🛠️ Tech Stack

### Frontend (`web_client/`)
- **Vue 3** (Option API) — Reactive UI framework
- **TypeScript** — Type-safe JavaScript
- **Vite** — Fast build tool and dev server
- **Canvas API** — Game rendering
- **Web Workers** — Background training (fast mode)
- **Custom Neural Network** — Pure JS/TS implementation (no external ML libraries)

### Infrastructure
- **Caddy** — Web server with automatic HTTPS
- **Docker** — Containerization
- **Hetzner Cloud** — Hosting

### Python Reference (`FlapPyBird/`)
- **PyTorch** — Original DQN training
- **Pygame** — Original game engine

---

## 📊 Training Tips

1. **Start with high epsilon** — Let the agent explore randomly at first
2. **Watch the Q-values** — They should stabilize as training progresses
3. **Use fast mode** — Training is ~10x faster without rendering
4. **Be patient** — Good performance typically emerges after 10,000+ episodes
5. **Try manual play** — Your gameplay adds to the replay buffer!

---

## 🎯 Roadmap

- [x] Browser-based DQN training
- [x] Real-time neural network visualization
- [x] Hyperparameter tuning UI
- [x] Fast training mode with Web Workers
- [x] Leaderboard system
- [ ] Model save/load to browser storage
- [ ] Champion model showcase on landing page
- [ ] Mobile-optimized controls
- [ ] Additional RL algorithms (PPO, A2C)

---

## 📜 License

This project is open source under the MIT License.

---

## 🙏 Acknowledgments

- Original Flappy Bird game by Dong Nguyen
- [FlapPyBird](https://github.com/sourabhv/FlapPyBird) — Python implementation reference
- Sprites and sounds from the classic Flappy Bird

---

**Built with ❤️ for the RL community**
