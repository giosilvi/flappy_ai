## Flappy AI Project Structure

This repository now has **two main parts**:

- **`web_client/`**  
  - The **primary, browser-first Flappy AI app**.  
  - Vue 3 (Option API) frontend that:
    - Runs the Flappy Bird game, RL training, and inference **entirely in the browser**.
    - Provides the interactive UI, live-tunable training controls, metrics, NN visualization, and leaderboard integration.

- **Python code (existing project)**  
  - `FlapPyBird/`: Original Python implementation of the game and RL logic (kept as a **reference** for physics, rewards, and RL behavior, and as a local playground).
  - `server/`: Python server code that can be used/extended as the **backend** for:
    - Leaderboard endpoints.
    - Storing champion model weights (for the “champion showcase” on the landing page).

### Which part should I work in?

- If you are implementing or modifying the **new web experience**, work in **`web_client/`**.  
  Start by reading `web_client/README.md` – it contains a detailed architecture and step-by-step implementation plan tailored for future work.

- If you need to:
  - Inspect the **original game logic or RL algorithm**, or
  - Extend the **backend for leaderboards/champion storage**,  
  then look at `FlapPyBird/` and `server/`.

The long-term goal is that **`web_client/` is the main user-facing app**, with the Python code mainly serving as reference and backend support.








