# 🐦 Flappy AI

**Train a neural network to play Flappy Bird — entirely in your browser.**

A browser-first reinforcement learning playground where you can watch, tune, and train a DQN agent in real-time. No server-side ML required — everything runs on your CPU via JavaScript.

🎮 **Live Demo:** [vibegames.it](https://vibegames.it)

---

## ✨ Features

- **Real-time DQN Training** — Watch the agent learn to navigate pipes with a custom neural network implementation (no TensorFlow.js dependency)
- **Live Hyperparameter Tuning** — Adjust epsilon, learning rate, and reward shaping while training
- **Neural Network Visualization** — See activations flow through the network in real-time (click to open detailed view with ReLU activation display)
- **Multiple Training Modes:**
  - 🏋️ **Training Mode** — Agent learns with epsilon-greedy exploration
  - ⚡ **Fast Training** — Skip rendering for maximum CPU utilization
  - 🎯 **Evaluation Mode** — Greedy policy (ε=0) for leaderboard runs
  - 🎮 **Manual Play** — Take control anytime (your plays contribute to the replay buffer!)
- **Metrics Dashboard** — Track rewards, episode lengths, Q-values, loss, and training progress
- **Checkpoint System** — Save and load training checkpoints
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

1. **Observation Space** (6 inputs by default):
   - `birdY` — Bird's vertical position (normalized)
   - `birdVel` — Bird's vertical velocity (normalized)
   - `dx1` — Horizontal distance to next pipe
   - `dy1` — Vertical distance to next pipe's gap center
   - `dx2` — Horizontal distance to second pipe
   - `dy2` — Vertical distance to second pipe's gap center

2. **Neural Network Architecture**:
   - Input layer: 6 neurons
   - Hidden layers: 2 × 64 neurons (ReLU activation)
   - Output layer: 2 neurons (Q-values for idle/flap)

3. **Training Process**:
   - Agent takes actions using ε-greedy policy
   - Experiences stored in replay buffer (50,000 capacity)
   - Network trained on random mini-batches (32 samples)
   - Target network updated every 200 steps for stability

### Reward Structure

| Event | Default Reward |
|-------|----------------|
| Pass a pipe | +1.0 |
| Each step alive | -0.01 |
| Death (collision) | -1.0 |
| Flap cost | -0.003 |
| Out of bounds (above screen) | -0.005 |
| Center bonus (moving toward gap) | +0.01 |

All rewards are adjustable via the UI during training.

---

## ⚙️ Configuration

### Hyperparameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Epsilon (ε) | 0.5 → 0.05 | 0 - 1 | Exploration rate (auto-decays over 150K steps) |
| Learning Rate | 0.001 | 0.0001 - 0.01 | Neural network learning rate |
| Gamma (γ) | 0.99 | Fixed | Discount factor for future rewards |
| Batch Size | 32 | Fixed | Samples per training step |
| Buffer Size | 50,000 | Fixed | Replay buffer capacity |
| Target Update | Every 200 steps | Fixed | Target network sync frequency |

### Training Modes

| Mode | Description |
|------|-------------|
| **Normal Training** | Full rendering at 30 FPS with live visualization |
| **Fast Training** | Rendering disabled, runs as fast as CPU allows |
| **Evaluation** | Greedy policy (ε=0), no training, 30 FPS |
| **Manual Play** | Human control, experiences still added to replay buffer |

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
- **Canvas API** — Game rendering at 30 FPS
- **Web Workers** — Background training (fast mode)
- **Custom Neural Network** — Pure JS/TS implementation with ReLU activation

### Infrastructure
- **Caddy** — Web server with automatic HTTPS
- **Docker** — Containerization

### Python Reference (`FlapPyBird/`)
- **PyTorch** — Original DQN training
- **Pygame** — Original game engine

---

## 📊 Training Tips

1. **Let auto-decay handle epsilon** — Starts at 0.5 and decays to 0.05 over 150K steps
2. **Watch the Q-values** — They should stabilize and separate as training progresses
3. **Use fast mode** — Training is significantly faster without rendering
4. **Tune rewards carefully** — Higher pass pipe reward encourages aggressive play
5. **Save checkpoints** — Use the save button to preserve good models
6. **Try manual play** — Your gameplay adds to the replay buffer and can help bootstrap learning

---

## 🎯 Roadmap

- [x] Browser-based DQN training
- [x] Real-time neural network visualization with ReLU display
- [x] Hyperparameter tuning UI
- [x] Fast training mode with Web Workers
- [x] Checkpoint save/load
- [x] Leaderboard system
- [ ] Champion model showcase on landing page
- [ ] Mobile-optimized controls
- [ ] Additional RL algorithms (Double DQN, Dueling DQN)

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
