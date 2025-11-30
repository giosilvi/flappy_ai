## Overview

This folder is the **new browser-first implementation** of Flappy AI, designed to:

- Run **game simulation, RL training, and inference entirely in the browser** (on the user’s CPU).
- Provide a **Vue 3 (Option API) UI** with controls for live-tuning training (e.g. epsilon, learning rate, speed).
- Show an **overlay with metrics** (rewards, episode lengths, Q-values, etc.).
- Visualize the **neural network (nodes/edges, activations/weights)** live during inference.
- Support a **leaderboard** for users who clear the most pipes.

The existing Python project (`FlapPyBird/` and `server/`) remains as a **reference implementation and backend support** (RL logic, game design, assets, leaderboard/champion storage), but the new system here is **implemented in JavaScript/TypeScript + Vue** and is intended to be the **main user-facing app**.

---

## High-Level Architecture

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

- **Game Engine (Browser)**  
  - Implemented as a pure JS/TS module using `<canvas>` (2D) to render the Flappy Bird game.
  - Encapsulates:
    - Game loop (step/update, collision detection, scoring).
    - Entities: bird, pipes, background, floor, score display.
    - State representation suitable for RL (e.g. bird y, velocity, pipe distances/gaps).
  - Runs at a **configurable simulation speed** (can be faster than real-time).

- **RL Core (Browser)**  
  - Implemented in JS/TS using **TensorFlow.js** (required dependency).
  - Algorithm: **DQN only for v1** (with common DQN variants left as future work).
  - Responsibilities:
    - DQN policy network + target network.
    - Replay buffer.
    - Epsilon-greedy action selection.
    - Training loop (collect experience, sample batches, update network).
    - Save/load model weights (browser storage and/or backend as needed).

- **Vue 3 App (Option API)**  
  - Root SPA that:
    - Hosts the canvas where the game is drawn.
    - Hosts an **overlay UI** with controls, metrics, and NN visualization.
    - Manages global app state via Vue’s reactivity (or a simple store pattern).

- **Leaderboard Backend (Minimal Server)**  
  - Simple REST API (could be Python/FastAPI, Node, or reuse existing server folder).
  - Endpoints:
    - `GET /leaderboard`: returns top N scores.
    - `POST /leaderboard`: submit `{ name, score, timestamp, maybe model_hash }`.
  - Persistence: SQLite, Postgres, or a simple cloud DB, depending on deployment.

---

## Folder Structure (Proposed)

Inside `web_client/`:

- `assets/`  
  - Reused from `FlapPyBird/assets` (copied already).
  - Sprites, audio, icons.

- `src/`
  - `main.ts` (or `main.js`): Vue app bootstrap.
  - `App.vue`: root component shell (contains layout for canvas + overlays).

  - `components/`
    - `GameCanvas.vue`: wraps `<canvas>`, handles resize, delegates drawing to game engine.
    - `ControlPanel.vue`: sliders/inputs for RL hyperparameters and game speed.
    - `MetricsPanel.vue`: displays rewards, episode lengths, epsilon, loss curves, etc.
    - `NetworkViewer.vue`: NN graph visualization (layers, nodes, edges, activations/weights).
    - `Leaderboard.vue`: shows top scores, allows name submission after a good run.
    - `StatusBar.vue`: small component for quick status info (episode, steps/sec, training mode).

  - `game/`
    - `GameEngine.ts`: core game loop and logic (step/update, collisions, scoring).
    - `GameState.ts`: types/interfaces for game state and RL observation vectors.
    - `Renderer.ts`: rendering logic for drawing sprites, backgrounds, and overlays to canvas.
    - `InputController.ts`: maps user input (for manual mode) or agent actions to game actions.
    - `config.ts`: game-related constants (gravity, jump velocity, pipe speed/gap, etc.).

  - `rl/`
    - `DQNAgent.ts`: main RL agent (policy network, target network, act/train methods).
    - `QNetwork.ts`: model definition (TF.js or custom NN implementation).
    - `ReplayBuffer.ts`: circular buffer for experience tuples.
    - `Scheduler.ts`: helpers for epsilon decay, learning rate schedules, etc.
    - `TrainingLoop.ts`: orchestrates episodes, interacts with `GameEngine`, logs metrics.
    - `serialization.ts`: save/load model parameters to browser storage.

  - `store/` (optional but recommended)
    - `appState.ts`: reactive global state (mode, current epsilon, speed, metrics).
    - `leaderboard.ts`: cached leaderboard entries and API interactions.

  - `services/`
    - `apiClient.ts`: HTTP client for leaderboard API.
    - `metricsLogger.ts`: collects time-series data for rewards, losses, etc.

  - `visualization/`
    - `networkLayout.ts`: utilities to compute node positions for NN visualization.
    - `colorMaps.ts`: mapping activation/weight values to colors.

  - `styles/`
    - Global styles, layout, theme (CSS/SCSS/Tailwind/etc.).

  - `types/`
    - Shared TS interfaces/types (if using TS).

- `public/`
  - `index.html`: app entry.
  - Favicon, manifest, etc.

- `package.json`, `vite.config.ts` (or similar bundler config)

---

## Detailed Implementation Plan (Step-by-Step)

### 1. Bootstrapping the Vue 3 App (Option API)

1. Initialize a Vue 3 project (with Vite or similar) inside `web_client/`.
2. Configure:
   - TypeScript (optional but recommended).
   - ESLint + Prettier (or preferred linting/formatting).
3. In `main.ts`:
   - Create the Vue app and mount it to `#app`.
   - Use **Option API** in all components (`export default { data() { ... }, methods: { ... }, computed: { ... } }`).
4. In `App.vue`:
   - Layout with:
     - A main area containing `GameCanvas`.
     - Side/top/bottom panels for `ControlPanel`, `MetricsPanel`, `NetworkViewer`, `Leaderboard`.

### 2. Implementing the Game Engine

1. In `game/GameState.ts`:
   - Define interfaces for:
     - Raw game state (bird position/velocity, pipe positions/gaps, score, done flag).
     - RL observation vector (normalized floats / scaled values).
2. In `game/config.ts`:
   - Port physics and game rules from Python:
     - Gravity, jump impulse, pipe speed, spacing, floor height, etc.
   - Keep constants in one place to allow experiments and future tuning.
   - Aim for **game fidelity as close as possible to the existing Python version**.
3. In `game/GameEngine.ts`:
   - Implement:
     - `reset()` to initialize a new episode.
     - `step(action)` where action is e.g. `0 = do nothing`, `1 = flap`.
     - Collision detection (bird with pipes/floor/ceiling).
     - Reward function:
       - Small negative/zero per step, positive for passing pipes, large negative on death.
      - Reward structure should **mimic the Python version**, but:
        - Expose individual reward components (e.g. per-step, pipe-passed, death-penalty) so the user can **toggle them on/off** and **scale their magnitude**.
        - Once a training run starts, reward config is **frozen** until a full reset.
     - Methods to:
       - Get current raw game state.
       - Transform raw state into RL observation vector (using `GameState` helpers).
4. In `game/Renderer.ts`:
   - Load sprites from `assets/sprites`.
   - Implement draw functions:
     - Background, pipes, floor, bird, score.
   - Support:
     - Fixed logical resolution and scaling to canvas size.
     - Optional rendering of debug info (hitboxes, etc.).
5. In `game/GameEngine.ts` or a small orchestrator:
   - Implement a **time-scaled loop**:
     - For **training mode**, allow decoupling simulation step rate from screen refresh:
       - Speed factor `k` in the range **0.25x–10x**.
       - For `k > 1`, run multiple simulation steps per animation frame.
       - For `k < 1`, effectively slow motion (fewer steps per second).
     - For **evaluation mode**, **force 1x speed** (no speed control, stable viewing).
   - Ensure **manual control**:
     - Keyboard (space/arrow/tap) and mobile touch support.
     - When the user presses a control, mark the episode as **manual**.
     - Manual episodes should still produce transitions that go into the **replay buffer**.

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



