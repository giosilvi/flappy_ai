## Overview

This folder is the **browser-first implementation** of the VibeGames front-end (multi-game), designed to:

- Run **game simulation, RL training, and inference entirely in the browser** (CPU/WebGL/WebGPU).
- Provide a **Vue 3 (Option API) UI** with controls for live-tuning training (e.g. epsilon, learning rate, speed).
- Show an **overlay with metrics** (rewards, episode lengths, Q-values, etc.).
- Visualize the **neural network (nodes/edges, activations/weights)** live during inference.
- Support **per-game leaderboards** (gameId-aware).

The existing Python project (`FlapPyBird/` and `server/`) remains as a **reference implementation and backend support** (RL logic, game design, assets, leaderboard/champion storage), but the new system here is **implemented in JavaScript/TypeScript + Vue** and is intended to be the **main user-facing app**.

---

## High-Level Architecture (current state)

### Product & UX Decisions (from requirements)

- **Audience & modes**
  - Default is a **casual game** feel.
  - An **“Advanced” toggle** exposes detailed RL controls and metrics for dev/ML folks.
- **Devices**
  - Must work well on **desktop and mobile** (responsive layout + touch controls).
- **Primary experience**
  - Main flow: **train your agent**, then **run a greedy evaluation** to compete on the leaderboard.
  - **Manual play** is allowed at any time (keyboard/touch); when the user takes control, the UI clearly indicates **“Manual control”**.
  - Manual episodes **also populate the replay buffer**, contributing to training.
- **Style**
  - Keep visuals close to **classic Flappy Bird** (using existing assets).
- **Persistence disclaimer**
  - **Hyperparameters and UI settings only persist while the page is open.**
  - When the tab/window is closed, settings reset. Show a small disclaimer in the UI.

- **Game layer (modular, multi-game)**  
  - A **game registry** (`src/games/index.ts`) maps `gameId` → factories for:
    - `createEnv` (vectorized env implementing `IVectorizedEnv`)
    - `createRenderer` and `createTiledRenderer`
    - `defaultRewardConfig` and game metadata
  - Currently ships with **Flappy Bird** as the default game; more games can be added by registering in the registry.
  - Game assets live under `public/assets/...` (per game).

- **RL Core (Browser)**  
  - Implemented in JS/TS using **TensorFlow.js**.
  - Algorithm: **DQN** (tfTraining.worker + TFDQNAgent + UnifiedDQN wrapper).
  - Vectorized environments come from the **game registry**; worker receives `gameId` to build the correct env and reward defaults.
  - Supports backend selection (cpu/webgl/webgpu), auto-eval, epsilon decay, and live metric streaming.

- **Vue 3 App (Option API) + Router**  
  - Routes:
    - `/` Landing page (game cards from registry, marketing copy)
    - `/game/:gameId` Training/eval view bound to the selected game
  - Components consume `gameId` to route requests, leaderboards, renderers, and envs correctly.

- **Leaderboard Backend (Minimal Server)**  
  - Node/Express in `web_client/server/index.js`.
  - Per-game leaderboards stored separately; endpoints accept `gameId`:
    - `GET /api/leaderboard?gameId=...`
    - `POST /api/leaderboard` with `{ name, pipes/score, params, architecture, gameId }`
    - `GET /api/leaderboard/lowest?gameId=...`

---

## Folder Structure (Current, condensed)

Inside `web_client/`:

- `assets/`  
  - Reused from `FlapPyBird/assets` (copied already).
  - Sprites, audio, icons.

- `src/`
  - `main.ts`, `router/` (Vue + vue-router bootstrapping)
  - `views/`
    - `LandingPage.vue` (game cards, marketing)
    - `GameView.vue` (training/eval shell; receives `gameId` from route)
  - `components/`
    - `GameCanvas.vue` (renderers resolved per `gameId`, hooks into UnifiedDQN)
    - Control/metrics/network/leaderboard panels (Option API)
  - `games/`
    - `index.ts` registry (gameId → env/renderers/default rewards/metadata)
    - `flappy/` (current game: engine, renderers, config, vectorized env)
  - `rl/`
    - `UnifiedDQN`, `TFDQNAgent`, `tfTraining.worker` (now game-aware via `gameId`)
    - `IVectorizedEnv.ts` (interface) and shared RL types/utilities
  - `services/apiClient.ts` (game-aware leaderboard client)
  - `styles/` (global styling)

- `public/`
  - `index.html`: app entry.
  - Favicon, manifest, etc.

- `package.json`, `vite.config.ts` (or similar bundler config)

---

## Notes on the refactor

- **Multi-game ready:** The RL worker, UnifiedDQN, leaderboard API client, and GameCanvas all accept `gameId`. The registry provides envs/renderers/rewards per game.
- **Default game:** Flappy Bird remains the default (`DEFAULT_GAME_ID = 'flappy'`), but adding a new game means:
  1) Implement its env + renderers under `src/games/<yourGame>/`
  2) Register it in `src/games/index.ts`
  3) Add assets under `public/assets/<yourGame>/`
  4) Link to it via `/game/<yourGame>` (it will appear on the landing page automatically).
- **Per-game leaderboards:** API endpoints and client calls are game-aware; data is stored per game.
- **Vue Router:** Landing (`/`) + game view (`/game/:gameId`); the app shell is just a router view.

### 3. RL Core: DQN in the Browser

1. Decide on the NN framework:
   - Use **TensorFlow.js** for:
     - In-browser GPU acceleration (WebGL).
     - Built-in optimizers, loss functions, serialization.
2. In `rl/QNetwork.ts`:
   - Define the network:
     - **Observation space**:
       - Use the existing **8-float input vector** from the Python version (port exactly).
       - Add configuration so users can **toggle specific input features on/off** *before training starts*.
     - **Architecture configuration**:
       - Number of hidden layers and their sizes are **user-selectable** *before training starts* (e.g. 1–3 layers, 16–256 units).
       - Once training starts, **network structure is fixed** until the user resets training.
     - Output size = number of actions (e.g. 2: `0 = idle`, `1 = flap`).
   - Expose methods:
     - `predict(stateBatch)` for forward pass.
     - `trainOnBatch(batch)` for loss + gradient step.
3. In `rl/ReplayBuffer.ts`:
   - Implement a circular buffer:
     - Store tuples `(state, action, reward, next_state, done)`.
     - Support `add(...)` and `sample(batchSize)`.
4. In `rl/DQNAgent.ts`:
   - Manage:
     - `policyNetwork` and `targetNetwork`.
     - Epsilon-greedy policy:
       - `epsilon` as reactive state (connected to UI).
       - Epsilon **auto-decay** controlled by:
         - `epsilonStart`, `epsilonEnd`, `epsilonDecayRate`.
       - If the user **manually drags epsilon** in the UI:
         - Temporarily **disable auto-decay**.
         - Provide a control to **re-enable auto-decay**.
     - `act(state)` method:
       - With probability `epsilon`, random action.
       - Else argmax-Q from `policyNetwork`.
     - `remember(...)` to push transitions into `ReplayBuffer`.
     - `replay()` to sample batch and train `policyNetwork`.
     - Periodic `updateTargetNetwork()` calls.
5. In `rl/TrainingLoop.ts`:
   - Implement the training loop:
     - For each episode:
       - Reset game.
       - Loop:
         - Get observation.
         - Choose action via `DQNAgent.act`.
         - Step game engine, receive reward + next state.
         - Store transition.
         - Call `DQNAgent.replay()` when buffer has enough samples.
         - Update metrics (episode reward, steps, loss).
         - Break on `done`.
       - Update UI metrics.
   - Integrate with simulation speed:
     - Training loop respects the speed factor set by user (more/fewer steps per second).
   - Allow **mid-training hyperparameter changes** for:
     - `epsilon` (and auto-decay on/off).
     - `epsilonDecayRate`.
     - `learningRate`.
     - `gamma`.
   - When these change, ensure the RL core reads updated values before applying the next batch of updates.

### 4. Browser Storage: Saving and Loading Models

1. In `rl/serialization.ts`:
   - Implement:
     - `saveModel(policyNetwork)` using TF.js save to browser storage (e.g. IndexedDB) **and/or** send weights to the backend for permanent storage of “champion” models.
     - `loadModel()` to restore network weights if available.
   - Allow users to:
     - Manually save a “good run” model.
     - Load/reset model via UI controls.
   - **Settings and hyperparameters**:
     - Do **not** persist hyperparameters or UI settings across page reloads.
     - Show a short disclaimer in the UI that **training settings are lost when the tab is closed**.

### 5. Vue Components and Live-Tunable Controls

1. **`GameCanvas.vue`**:
   - Props: none initially.
   - Data:
     - Canvas element reference.
   - Methods:
     - Mount/unmount game engine.
     - Start/stop animation loop using `requestAnimationFrame`.
   - Interactions:
     - Expose functions/events for manual control (e.g. user playing: space to flap).
2. **`ControlPanel.vue`**:
   - Uses **Option API** with `data` containing:
     - `epsilon`, `epsilonMin`, `epsilonMax`.
     - `epsilonAutoDecay` settings (`epsilonStart`, `epsilonEnd`, `epsilonDecayRate`, `autoDecayEnabled`).
     - `learningRate`.
     - `gamma`.
     - (Optionally) `batchSize`, `bufferSize`, `targetUpdateFreq` as **advanced** settings.
     - `speedFactor` (e.g. 0.25x–10x).
     - NN architecture options (e.g. number of layers, units per layer) and **which input features are enabled**.
     - Reward shaping options (toggles + weights for each reward component).
   - Emits events or updates shared store to:
     - Update RL agent’s hyperparameters live.
     - Toggle **auto-decay** for epsilon on/off.
     - Toggle modes: **Train**, **Watch/Eval**, **Manual Play**.
3. **`MetricsPanel.vue`**:
   - Displays:
     - Current episode number.
     - Rewards: last episode, moving average.
     - Steps per second.
     - Loss (recent-history chart).
     - Current epsilon (and whether it’s auto-decaying or manually controlled).
     - Optionally:
       - Episode length (steps).
       - Moving average reward over N episodes.
       - Training iteration count / gradient steps.
   - Metrics are updated reactively from the RL training loop via a shared store or event bus.
4. **`NetworkViewer.vue`**:
   - Inputs:
     - Current network structure (layers, sizes).
     - Current activations and weights at the **latest forward pass**.
   - Implementation:
     - Compute node positions using `visualization/networkLayout.ts`.
     - Draw nodes and edges as SVG or a secondary canvas.
     - Color-code:
       - Activations (e.g. blue = low, red = high).
       - Weights (e.g. desaturated for small magnitude, bright for large).
   - Update frequency:
     - Target **per-step updates** during inference/training for a rich visualization.
     - If performance becomes an issue, throttle to every N steps or limit to smaller networks.
   - Focus only on the **forward pass**:
     - Visualize **weights and activations**, not gradients.
     - Highlight the **output layer** and indicate:
       - The raw Q-values.
       - The selected action after `argmax` (`still` vs `jump`).
5. **`Leaderboard.vue`**:
   - View:
     - Table of top scores (network name, score = max pipes cleared in a single run, date).
     - Simple form to submit **network name** + current best score (no authentication).
   - Interacts with:
     - `services/apiClient.ts` for `GET /leaderboard` and `POST /leaderboard`.
   - Optional:
     - Tag entries with model metadata (e.g. hash of weights) for “model bragging rights”.

### 6. State Management and Synchronization

1. Implement a simple store in `store/appState.ts`:
   - Reactive state for:
     - Current mode: `"train" | "eval" | "manual"`.
     - RL hyperparameters (epsilon, epsilonDecay, learningRate, gamma, etc.).
     - Speed factor.
     - Metrics (episodeReward, avgReward, stepsPerSecond, loss, etc.).
   - Provide functions to:
     - Update hyperparameters from UI.
     - Update metrics from training loop.
2. Ensure:
   - RL core reads hyperparameters from the store before each episode or periodically.
   - UI updates when RL core changes derived values (like epsilon if auto-decay is enabled).

### 7. Leaderboard Backend Integration (High-Level)

1. Design a small REST API (assume it exists for now):
   - `GET /leaderboard` → `{ entries: [{ name, score, createdAt }, ...] }`.
   - `POST /leaderboard` with `{ name, score }`.
2. In `services/apiClient.ts`:
   - Implement `getLeaderboard()` and `postScore(name, score)`.
3. In the training/game flow:
   - When the player/agent achieves a new best “pipes cleared” score:
     - Prompt the user for a **network name** if not already set.
     - Submit `{ name, score, timestamp }` to backend.
     - If this score is **first place**, also:
       - Serialize and send the **current model weights** to the backend.
       - Backend stores these as the **current champion model**, associated with the name.

### 8. Training Modes and UX

1. **Modes**:
   - **Train**:
     - DQN agent controls bird.
     - Training loop is active.
     - Speed factor is user-controlled (often >1x).
   - **Eval (Watch)**:
     - Agent controls bird.
     - Training is **paused** (no weight updates), purely inference.
     - Always runs at **1x speed** for consistent viewing.
     - Used for **leaderboard submission runs** (greedy policy).
   - **Manual**:
     - Human plays using keyboard/touch.
     - Manual runs **contribute to replay buffer** so the agent can learn from human play.
2. UX details:
   - Clear indicators of current mode and whether training is active.
   - One-click buttons to switch modes.
   - Button to reset training (clear replay buffer + reset weights).
   - When the user hits **space/tap** to take over, show a visible **“Manual Control”** banner.

### 8.1 Intro / Landing Flow and Champion Showcase

1. **Landing page behavior**:
   - On first load, check via API whether a **champion model** (top leaderboard entry’s weights) exists.
   - If a champion exists:
     - Load those weights into a read-only instance of the agent.
     - Show the champion agent **auto-playing** a demo run on the landing page.
     - Display the champion’s **name and best score**.
   - If no champion exists:
     - Show a default “Train your first champion” message and invite the user to start training.
2. **“Challenge it” flow**:
   - On the landing page, show a **“Challenge it”** button when a champion exists.
   - Clicking it:
     - Navigates to the **training interface**.
     - Pre-training, shows full/compact UI to configure:
       - NN architecture.
       - Input features.
       - Reward shaping.
       - Hyperparameters (epsilon, learning rate, gamma, decay).
   - The user clicks **Start Training**:
     - Training begins with a compact interface for **tunable parameters** (with an expandable “Advanced” panel).
   - At any time during training:
     - User can **pause training** and start an **Eval run** from the current checkpoint.
     - In Eval:
       - Policy runs greedily (epsilon = 0 or very small).
       - If the user is happy with performance, they can **submit to leaderboard**.
     - From Eval, user can:
       - Go back to training from the **same checkpoint**.
       - Or **reset training from scratch** and reconfigure network/inputs/rewards.

### 9. Performance Considerations

1. Decouple:
   - **Rendering** (60 FPS or vsync) from
   - **Simulation** (adjustable steps per second) and
   - **Training** (mini-batches per second).
2. Use `requestAnimationFrame` for drawing, while simulation/training loops can be:
   - Tick-based within each frame (multiple steps per frame).
   - Or run in a Web Worker (advanced optimization, optional).
3. For NN visualization:
   - Draw **every neuron and connection**.
   - Prefer small/medium networks so visualization remains clear and performant.

### 10. Deployment and Integration with Existing Project

1. Build the Vue app as a static bundle (e.g. via `vite build`).
2. Serve the built assets:
   - Either via the existing `server/` in the Python project.
   - Or as a separate frontend deployment (Caddy, Nginx, etc.).
3. Configure CORS / reverse proxy for leaderboard API if it’s on a different origin.
4. Optionally, keep:
   - Original Python/pygame version as a local dev tool / RL reference.
   - New `web_client` as the public-facing interactive demo.

---

## Suggested First Implementation Milestones

1. **Milestone 1: Game-only demo**
   - Implement `GameEngine`, `Renderer`, and `GameCanvas.vue`.
   - User can manually play Flappy Bird in the browser with keyboard.

2. **Milestone 2: Basic DQN training (no UI tuning yet)**
   - Implement RL core (`DQNAgent`, `ReplayBuffer`, `TrainingLoop`) with fixed hyperparams.
   - Agent learns over multiple episodes, logs to console.

3. **Milestone 3: Control panel + metrics**
   - Add `ControlPanel.vue` and `MetricsPanel.vue`.
   - Wire up reactive hyperparameters and live metrics display.

4. **Milestone 4: NN visualization**
   - Implement `NetworkViewer.vue` with basic graph and color-coded activations/weights.

5. **Milestone 5: Leaderboards**
   - Implement leaderboard API client and `Leaderboard.vue`.
   - Connect to backend and allow score submissions.

6. **Milestone 6: Polish and performance**
   - Refine UX, visuals, and performance (speed controls, smoothness).
   - Add options to save/load models and reset training.

This plan should give a future LLM enough structure to **implement the browser-based Flappy AI step by step**, while staying aligned with Vue 3 (Option API), browser-side RL, and an interactive visualization-heavy UX.



