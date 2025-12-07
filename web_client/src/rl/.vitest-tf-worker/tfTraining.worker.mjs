
      import { parentPort } from 'node:worker_threads';
      const self = globalThis;
      self.postMessage = (msg) => parentPort?.postMessage?.(msg);
      self.onmessage = null;
      parentPort?.on?.('message', (data) => self.onmessage?.({ data }));
    

// src/games/flappy/config.ts
var GameConfig = {
  // Canvas dimensions (original Flappy Bird size - scaled via CSS)
  WIDTH: 288,
  HEIGHT: 512,
  VIEWPORT_HEIGHT: 400,
  // Height above floor
  // Bird physics
  BIRD: {
    X: 57,
    // Fixed x position (20% of width)
    INITIAL_Y: 244,
    // Middle of screen
    WIDTH: 34,
    HEIGHT: 24,
    FLAP_VELOCITY: -9,
    // Upward velocity on flap
    GRAVITY: 1,
    // Acceleration per frame
    MAX_VELOCITY_DOWN: 10,
    MAX_VELOCITY_UP: -8,
    ROTATION_SPEED: -3,
    ROTATION_MIN: -90,
    ROTATION_MAX: 20,
    MIN_Y: -48,
    // Allow going slightly above screen
    // Animation
    FRAME_RATE: 5
    // Frames per wing flap cycle
  },
  // Pipe configuration
  PIPE: {
    WIDTH: 52,
    HEIGHT: 320,
    GAP: 120,
    // Gap between upper and lower pipes
    VELOCITY: -5,
    // Horizontal speed
    SPAWN_DISTANCE: 182,
    // Distance between pipe centers (width * 3.5)
    INITIAL_X_OFFSET: 468
    // First pipe x position (width + width*3)
  },
  // Floor
  FLOOR: {
    HEIGHT: 112,
    VELOCITY: -5
    // Same as pipe velocity for parallax
  },
  // Scoring
  SCORE: {
    PASS_PIPE: 1,
    STEP_PENALTY: -0.01,
    DEATH_PENALTY: -1
  },
  // Game loop
  FPS: 30,
  FRAME_TIME: 1e3 / 30
};
var DefaultRewardConfig = {
  stepPenalty: -0.01,
  passPipe: 1,
  deathPenalty: -1,
  flapCost: 3e-3,
  // Match Python default
  centerReward: 0.15
  // Shaping: reward for moving toward gap center
};
var DefaultObservationConfig = {
  birdY: true,
  birdVel: true,
  dx1: true,
  dy1: true,
  dx2: true,
  dy2: true,
  gapVel1: false,
  gapVel2: false
};

// src/games/flappy/GameState.ts
function createInitialState() {
  return {
    birdY: GameConfig.BIRD.INITIAL_Y,
    birdVelY: 0,
    birdRotation: 0,
    pipes: [],
    floorX: 0,
    score: 0,
    done: false,
    frameCount: 0
  };
}
function stateToObservation(state, config2) {
  const obs = [];
  if (config2.birdY) {
    obs.push(state.birdY / GameConfig.VIEWPORT_HEIGHT);
  }
  if (config2.birdVel) {
    const velyCap = Math.max(
      Math.abs(GameConfig.BIRD.MAX_VELOCITY_DOWN),
      Math.abs(GameConfig.BIRD.MAX_VELOCITY_UP)
    );
    const clampedVel = clamp(state.birdVelY, -velyCap, velyCap);
    obs.push(clampedVel / velyCap);
  }
  const pipe1 = state.pipes[0] || createDefaultPipe(1);
  const pipe2 = state.pipes[1] || createDefaultPipe(2);
  if (config2.dx1) {
    obs.push((pipe1.x - GameConfig.BIRD.X) / GameConfig.WIDTH);
  }
  if (config2.dy1) {
    obs.push((pipe1.gapCenterY - state.birdY) / GameConfig.VIEWPORT_HEIGHT);
  }
  if (config2.dx2) {
    obs.push((pipe2.x - GameConfig.BIRD.X) / GameConfig.WIDTH);
  }
  if (config2.dy2) {
    obs.push((pipe2.gapCenterY - state.birdY) / GameConfig.VIEWPORT_HEIGHT);
  }
  if (config2.gapVel1) {
    obs.push((pipe1.gapVelY || 0) / GameConfig.VIEWPORT_HEIGHT);
  }
  if (config2.gapVel2) {
    obs.push((pipe2.gapVelY || 0) / GameConfig.VIEWPORT_HEIGHT);
  }
  return obs;
}
function createDefaultPipe(index) {
  return {
    x: GameConfig.WIDTH + GameConfig.PIPE.SPAWN_DISTANCE * index,
    gapCenterY: GameConfig.VIEWPORT_HEIGHT / 2,
    gapVelY: 0,
    passed: false
  };
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// src/games/flappy/GameEngine.ts
var GameEngine = class {
  state;
  rewardConfig;
  observationConfig;
  prevScore = 0;
  episode = 0;
  totalSteps = 0;
  constructor(rewardConfig2 = DefaultRewardConfig, observationConfig = DefaultObservationConfig) {
    this.rewardConfig = rewardConfig2;
    this.observationConfig = observationConfig;
    this.state = createInitialState();
  }
  /**
   * Reset the game and return initial observation
   */
  reset() {
    this.state = createInitialState();
    this.prevScore = 0;
    this.episode++;
    this.state.birdVelY = GameConfig.BIRD.FLAP_VELOCITY;
    this.state.birdRotation = 80;
    this.spawnInitialPipes();
    return this.getObservation();
  }
  /**
   * Execute one game step with the given action
   */
  step(action) {
    if (this.state.done) {
      return {
        observation: this.getObservation(),
        reward: 0,
        done: true,
        info: this.getInfo()
      };
    }
    if (action === 1) {
      this.flap();
    }
    this.updateBird();
    this.updatePipes();
    this.checkCollisions();
    this.updateScore();
    const reward = this.calculateReward(action);
    this.prevScore = this.state.score;
    this.state.frameCount++;
    this.totalSteps++;
    return {
      observation: this.getObservation(),
      reward,
      done: this.state.done,
      info: this.getInfo()
    };
  }
  /**
   * Get the current observation vector
   */
  getObservation() {
    return stateToObservation(this.state, this.observationConfig);
  }
  /**
   * Get raw game state (for rendering)
   */
  getState() {
    return this.state;
  }
  /**
   * Get episode info
   */
  getInfo() {
    return {
      score: this.state.score,
      episode: this.episode,
      steps: this.totalSteps
    };
  }
  /**
   * Update reward configuration (live during training)
   */
  setRewardConfig(config2) {
    this.rewardConfig = { ...this.rewardConfig, ...config2 };
  }
  // ===== Private methods =====
  flap() {
    if (this.state.birdY > GameConfig.BIRD.MIN_Y) {
      this.state.birdVelY = GameConfig.BIRD.FLAP_VELOCITY;
      this.state.birdRotation = 80;
    }
  }
  updateBird() {
    if (this.state.birdVelY < GameConfig.BIRD.MAX_VELOCITY_DOWN) {
      this.state.birdVelY += GameConfig.BIRD.GRAVITY;
    }
    this.state.birdY = clamp(
      this.state.birdY + this.state.birdVelY,
      GameConfig.BIRD.MIN_Y,
      GameConfig.VIEWPORT_HEIGHT - GameConfig.BIRD.HEIGHT * 0.75
    );
    this.state.birdRotation = clamp(
      this.state.birdRotation + GameConfig.BIRD.ROTATION_SPEED,
      GameConfig.BIRD.ROTATION_MIN,
      GameConfig.BIRD.ROTATION_MAX
    );
  }
  updatePipes() {
    for (const pipe of this.state.pipes) {
      pipe.x += GameConfig.PIPE.VELOCITY;
    }
    const floorWidth = 336;
    this.state.floorX = (this.state.floorX + GameConfig.FLOOR.VELOCITY) % floorWidth;
    if (this.state.floorX > 0) this.state.floorX -= floorWidth;
    this.state.pipes = this.state.pipes.filter(
      (pipe) => pipe.x > -GameConfig.PIPE.WIDTH
    );
    this.maybeSpawnPipe();
  }
  maybeSpawnPipe() {
    if (this.state.pipes.length === 0) {
      this.spawnPipe();
      return;
    }
    const lastPipe = this.state.pipes[this.state.pipes.length - 1];
    const distanceFromLast = GameConfig.WIDTH - (lastPipe.x + GameConfig.PIPE.WIDTH);
    if (distanceFromLast > GameConfig.PIPE.WIDTH * 2.5) {
      this.spawnPipe();
    }
  }
  spawnPipe() {
    const baseY = GameConfig.VIEWPORT_HEIGHT;
    const minGapY = baseY * 0.2 + GameConfig.PIPE.GAP / 2;
    const maxGapY = baseY * 0.8 - GameConfig.PIPE.GAP / 2;
    const gapCenterY = minGapY + Math.random() * (maxGapY - minGapY);
    this.state.pipes.push({
      x: GameConfig.WIDTH + 10,
      gapCenterY,
      gapVelY: 0,
      passed: false
    });
  }
  spawnInitialPipes() {
    const pipe1 = this.createRandomPipe();
    pipe1.x = GameConfig.PIPE.INITIAL_X_OFFSET;
    const pipe2 = this.createRandomPipe();
    pipe2.x = pipe1.x + GameConfig.PIPE.SPAWN_DISTANCE;
    this.state.pipes = [pipe1, pipe2];
  }
  createRandomPipe() {
    const baseY = GameConfig.VIEWPORT_HEIGHT;
    const minGapY = baseY * 0.2 + GameConfig.PIPE.GAP / 2;
    const maxGapY = baseY * 0.8 - GameConfig.PIPE.GAP / 2;
    const gapCenterY = minGapY + Math.random() * (maxGapY - minGapY);
    return {
      x: GameConfig.WIDTH + 10,
      gapCenterY,
      gapVelY: 0,
      passed: false
    };
  }
  checkCollisions() {
    const birdX = GameConfig.BIRD.X;
    const birdY = this.state.birdY;
    const birdW = GameConfig.BIRD.WIDTH;
    const birdH = GameConfig.BIRD.HEIGHT;
    if (birdY + birdH >= GameConfig.VIEWPORT_HEIGHT) {
      this.state.done = true;
      return;
    }
    if (birdY <= GameConfig.BIRD.MIN_Y) {
    }
    for (const pipe of this.state.pipes) {
      if (birdX + birdW > pipe.x && birdX < pipe.x + GameConfig.PIPE.WIDTH) {
        const gapTop = pipe.gapCenterY - GameConfig.PIPE.GAP / 2;
        const gapBottom = pipe.gapCenterY + GameConfig.PIPE.GAP / 2;
        if (birdY < gapTop || birdY + birdH > gapBottom) {
          this.state.done = true;
          return;
        }
      }
    }
  }
  updateScore() {
    const birdCenterX = GameConfig.BIRD.X + GameConfig.BIRD.WIDTH / 2;
    for (const pipe of this.state.pipes) {
      if (!pipe.passed) {
        const pipeCenterX = pipe.x + GameConfig.PIPE.WIDTH / 2;
        if (birdCenterX >= pipeCenterX && birdCenterX < pipeCenterX - GameConfig.PIPE.VELOCITY) {
          pipe.passed = true;
          this.state.score++;
        }
      }
    }
  }
  calculateReward(action) {
    let reward = 0;
    const scoreDelta = this.state.score - this.prevScore;
    reward += scoreDelta * this.rewardConfig.passPipe;
    reward += this.rewardConfig.stepPenalty;
    if (action === 1 && !this.state.done && this.rewardConfig.flapCost > 0) {
      reward -= this.rewardConfig.flapCost;
    }
    if (this.state.done) {
      reward = this.rewardConfig.deathPenalty;
    } else {
      if (this.state.birdY < 0) {
        reward -= 0.1;
      }
    }
    if (!this.state.done && this.rewardConfig.centerReward > 0) {
      const pipe1 = this.state.pipes[0];
      if (pipe1) {
        const distance = Math.abs(pipe1.gapCenterY - this.state.birdY);
        const maxDistance = GameConfig.VIEWPORT_HEIGHT / 2;
        const proximity = Math.max(0, 1 - distance / maxDistance);
        reward += this.rewardConfig.centerReward * proximity;
      }
    }
    return reward;
  }
};

// src/games/flappy/VectorizedEnv.ts
var VectorizedEnv = class {
  engines;
  numEnvs;
  rewardConfig;
  observationConfig;
  // Per-environment episode tracking
  episodeRewards;
  episodeLengths;
  episodeCounts;
  // Per-environment last step reward (for visualization)
  lastStepRewards;
  // Callbacks for episode completion
  onEpisodeComplete;
  constructor(numEnvs2, rewardConfig2 = DefaultRewardConfig, observationConfig = DefaultObservationConfig) {
    this.numEnvs = numEnvs2;
    this.rewardConfig = rewardConfig2;
    this.observationConfig = observationConfig;
    this.engines = [];
    this.episodeRewards = [];
    this.episodeLengths = [];
    this.episodeCounts = [];
    this.lastStepRewards = [];
    for (let i = 0; i < numEnvs2; i++) {
      this.engines.push(new GameEngine(rewardConfig2, observationConfig));
      this.episodeRewards.push(0);
      this.episodeLengths.push(0);
      this.episodeCounts.push(0);
      this.lastStepRewards.push(0);
    }
    console.log(`[VectorizedEnv] Created ${numEnvs2} parallel environments`);
  }
  /**
   * Reset all environments and return initial observations
   */
  resetAll() {
    const observations = [];
    for (let i = 0; i < this.numEnvs; i++) {
      observations.push(this.engines[i].reset());
      this.episodeRewards[i] = 0;
      this.episodeLengths[i] = 0;
      this.lastStepRewards[i] = 0;
    }
    return observations;
  }
  /**
   * Reset specific environments by index
   */
  resetIndices(indices) {
    for (const i of indices) {
      if (i >= 0 && i < this.numEnvs) {
        this.engines[i].reset();
        this.episodeRewards[i] = 0;
        this.episodeLengths[i] = 0;
        this.lastStepRewards[i] = 0;
      }
    }
  }
  /**
   * Step all environments with given actions
   * @param actions - Array of actions, one per environment (0 = idle, 1 = flap)
   * @param autoReset - If true, automatically reset environments that are done (training mode)
   */
  stepAll(actions, autoReset = true) {
    if (actions.length !== this.numEnvs) {
      throw new Error(`Expected ${this.numEnvs} actions, got ${actions.length}`);
    }
    const observations = [];
    const rewards = [];
    const dones = [];
    const scores = [];
    const infos = [];
    const completedEpisodes = [];
    for (let i = 0; i < this.numEnvs; i++) {
      if (!autoReset && this.engines[i].getState().done) {
        const observation = this.engines[i].getObservation();
        const info = this.engines[i].getInfo();
        observations.push(observation);
        rewards.push(0);
        dones.push(true);
        scores.push(info.score);
        infos.push(info);
        continue;
      }
      const result = this.engines[i].step(actions[i]);
      this.lastStepRewards[i] = result.reward;
      this.episodeRewards[i] += result.reward;
      this.episodeLengths[i]++;
      if (result.done) {
        completedEpisodes.push({
          envIndex: i,
          score: result.info.score,
          reward: this.episodeRewards[i],
          length: this.episodeLengths[i]
        });
        this.episodeCounts[i]++;
        if (autoReset) {
          const newObs = this.engines[i].reset();
          observations.push(newObs);
          this.episodeRewards[i] = 0;
          this.episodeLengths[i] = 0;
          this.lastStepRewards[i] = 0;
        } else {
          observations.push(result.observation);
        }
      } else {
        observations.push(result.observation);
      }
      rewards.push(result.reward);
      dones.push(result.done);
      scores.push(result.info.score);
      infos.push(result.info);
    }
    if (this.onEpisodeComplete) {
      for (const stats of completedEpisodes) {
        this.onEpisodeComplete(stats);
      }
    }
    return { observations, rewards, dones, scores, infos };
  }
  /**
   * Get current observations from all environments
   */
  getObservations() {
    return this.engines.map((engine2) => engine2.getObservation());
  }
  /**
   * Get raw game states from all environments (for visualization)
   */
  getStates() {
    return this.engines.map((engine2) => engine2.getState());
  }
  /**
   * Get states with reward information for visualization
   */
  getStatesWithRewards() {
    return this.engines.map((engine2, i) => ({
      state: engine2.getState(),
      reward: this.lastStepRewards[i],
      cumulativeReward: this.episodeRewards[i]
    }));
  }
  /**
   * Get states only for environments that are not done
   */
  getActiveStates() {
    const states = [];
    const indices = [];
    for (let i = 0; i < this.numEnvs; i++) {
      const state = this.engines[i].getState();
      if (!state.done) {
        states.push(state);
        indices.push(i);
      }
    }
    return { states, indices };
  }
  /**
   * Check which environments are done
   */
  getDoneMask() {
    return this.engines.map((engine2) => engine2.getState().done);
  }
  /**
   * Count number of active (not done) environments
   */
  countActive() {
    return this.engines.filter((e) => !e.getState().done).length;
  }
  /**
   * Set callback for episode completion
   */
  setOnEpisodeComplete(callback) {
    this.onEpisodeComplete = callback ?? void 0;
  }
  /**
   * Clear the episode completion callback
   */
  clearOnEpisodeComplete() {
    this.onEpisodeComplete = void 0;
  }
  /**
   * Update reward configuration for all environments
   */
  setRewardConfig(config2) {
    this.rewardConfig = { ...this.rewardConfig, ...config2 };
    for (const engine2 of this.engines) {
      engine2.setRewardConfig(config2);
    }
  }
  /**
   * Get current episode stats for all environments
   */
  getEpisodeStats() {
    return {
      rewards: [...this.episodeRewards],
      lengths: [...this.episodeLengths],
      counts: [...this.episodeCounts]
    };
  }
  /**
   * Get aggregate statistics across all environments
   */
  getAggregateStats() {
    const totalEpisodes = this.episodeCounts.reduce((a, b) => a + b, 0);
    const avgReward = this.episodeRewards.reduce((a, b) => a + b, 0) / this.numEnvs;
    const avgLength = this.episodeLengths.reduce((a, b) => a + b, 0) / this.numEnvs;
    return { totalEpisodes, avgReward, avgLength };
  }
  /**
   * Resize the environment (change number of parallel instances)
   */
  resize(newNumEnvs) {
    if (newNumEnvs === this.numEnvs) return;
    if (newNumEnvs > this.numEnvs) {
      for (let i = this.numEnvs; i < newNumEnvs; i++) {
        this.engines.push(new GameEngine(this.rewardConfig, this.observationConfig));
        this.engines[i].reset();
        this.episodeRewards.push(0);
        this.episodeLengths.push(0);
        this.episodeCounts.push(0);
        this.lastStepRewards.push(0);
      }
    } else {
      this.engines = this.engines.slice(0, newNumEnvs);
      this.episodeRewards = this.episodeRewards.slice(0, newNumEnvs);
      this.episodeLengths = this.episodeLengths.slice(0, newNumEnvs);
      this.episodeCounts = this.episodeCounts.slice(0, newNumEnvs);
      this.lastStepRewards = this.lastStepRewards.slice(0, newNumEnvs);
    }
    this.numEnvs = newNumEnvs;
    console.log(`[VectorizedEnv] Resized to ${newNumEnvs} environments`);
  }
  /**
   * Get number of environments
   */
  getNumEnvs() {
    return this.numEnvs;
  }
  /**
   * Get scores from all environments
   */
  getScores() {
    return this.engines.map((e) => e.getInfo().score);
  }
};
var MAX_VISUALIZED_INSTANCES = 16;

// src/games/flappy/renderShared.ts
var SPRITE_BASE_PATH = "/assets/sprites";
var REWARD_FONT = {
  LABEL: 11,
  VALUE: 18,
  CUMULATIVE: 15
};
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${SPRITE_BASE_PATH}/${path}`;
  });
}
function flipImageVertically(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.translate(0, canvas.height);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0);
  const flipped = new Image();
  flipped.src = canvas.toDataURL();
  return flipped;
}
async function loadAllSprites(includeMessage = false) {
  const imagePromises = [
    loadImage("background-day.png"),
    loadImage("base.png"),
    loadImage("yellowbird-upflap.png"),
    loadImage("yellowbird-midflap.png"),
    loadImage("yellowbird-downflap.png"),
    loadImage("pipe-green.png"),
    loadImage("gameover.png"),
    loadImage("0.png"),
    loadImage("1.png"),
    loadImage("2.png"),
    loadImage("3.png"),
    loadImage("4.png"),
    loadImage("5.png"),
    loadImage("6.png"),
    loadImage("7.png"),
    loadImage("8.png"),
    loadImage("9.png")
  ];
  if (includeMessage) {
    imagePromises.push(loadImage("message.png"));
  }
  const images = await Promise.all(imagePromises);
  const [
    background,
    floor,
    bird0,
    bird1,
    bird2,
    pipeGreen,
    gameOver,
    d0,
    d1,
    d2,
    d3,
    d4,
    d5,
    d6,
    d7,
    d8,
    d9,
    ...rest
  ] = images;
  const message = includeMessage ? rest[0] : void 0;
  return {
    background,
    floor,
    bird: [bird0, bird1, bird2, bird1],
    // Animation cycle: up, mid, down, mid
    pipeUp: flipImageVertically(pipeGreen),
    pipeDown: pipeGreen,
    digits: [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9],
    gameOver,
    message
  };
}
function drawOutlinedText(ctx, text, x, y, fillColor, fontSize, align = "right", baseline = "bottom") {
  ctx.save();
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000000";
  ctx.shadowColor = "transparent";
  ctx.strokeText(text, x, y);
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}
function getRewardColor(reward) {
  if (reward > 0.5) {
    return "#7fff00";
  } else if (reward > 0) {
    return "#98fb98";
  } else if (reward > -0.1) {
    return "#fff8dc";
  } else if (reward > -0.5) {
    return "#ffa500";
  } else {
    return "#ff6347";
  }
}
function formatReward(reward, decimals = 3) {
  const sign = reward >= 0 ? "+" : "";
  return `${sign}${reward.toFixed(decimals)}`;
}
function drawRewardIndicator(ctx, reward, cumulativeReward, x, y) {
  ctx.save();
  drawOutlinedText(ctx, "REWARD", x, y - 20, "#ffffff", REWARD_FONT.LABEL);
  const color = getRewardColor(reward);
  const rewardText = formatReward(reward, 3);
  drawOutlinedText(ctx, rewardText, x, y, color, REWARD_FONT.VALUE);
  if (cumulativeReward !== void 0) {
    const cumText = `\u03A3 ${formatReward(cumulativeReward, 2)}`;
    const cumColor = cumulativeReward >= 0 ? "#98fb98" : "#ff6347";
    drawOutlinedText(ctx, cumText, x, y + 20, cumColor, REWARD_FONT.CUMULATIVE);
  }
  ctx.restore();
}
function drawScore(ctx, sprites, score, canvasWidth, topY, sizeScale = 1) {
  const scoreStr = score.toString();
  const digitWidth = sprites.digits[0].width * sizeScale;
  const digitHeight = sprites.digits[0].height * sizeScale;
  const totalWidth = scoreStr.length * digitWidth;
  const startX = (canvasWidth - totalWidth) / 2;
  for (let i = 0; i < scoreStr.length; i++) {
    const digit = parseInt(scoreStr[i], 10);
    ctx.drawImage(
      sprites.digits[digit],
      startX + i * digitWidth,
      topY,
      digitWidth,
      digitHeight
    );
  }
}
function drawPipes(ctx, sprites, pipes) {
  for (const pipe of pipes) {
    const gapTop = pipe.gapCenterY - GameConfig.PIPE.GAP / 2;
    const gapBottom = pipe.gapCenterY + GameConfig.PIPE.GAP / 2;
    const upperY = gapTop - sprites.pipeUp.height;
    ctx.drawImage(sprites.pipeUp, pipe.x, upperY);
    ctx.drawImage(sprites.pipeDown, pipe.x, gapBottom);
  }
}
function drawFloor(ctx, sprites, floorX) {
  const floorY = GameConfig.VIEWPORT_HEIGHT;
  ctx.drawImage(sprites.floor, floorX, floorY);
  ctx.drawImage(sprites.floor, floorX + sprites.floor.width, floorY);
}
function drawBird(ctx, sprites, currentFrame, frameCount, x, y, rotationDeg) {
  let nextFrame = currentFrame;
  if (frameCount % GameConfig.BIRD.FRAME_RATE === 0) {
    nextFrame = (currentFrame + 1) % sprites.bird.length;
  }
  const birdImg = sprites.bird[nextFrame];
  ctx.save();
  ctx.translate(x + birdImg.width / 2, y + birdImg.height / 2);
  ctx.rotate(rotationDeg * Math.PI / 180);
  ctx.drawImage(birdImg, -birdImg.width / 2, -birdImg.height / 2);
  ctx.restore();
  return nextFrame;
}
function drawGameOver(ctx, sprites, canvasWidth, canvasHeight, overlayAlpha, offsetY) {
  ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  const goX = (canvasWidth - sprites.gameOver.width) / 2;
  const goY = (canvasHeight - sprites.gameOver.height) / 2 + offsetY;
  ctx.drawImage(sprites.gameOver, goX, goY);
}

// src/games/flappy/Renderer.ts
var Renderer = class {
  canvas;
  ctx;
  sprites = null;
  birdFrame = 0;
  frameCount = 0;
  loaded = false;
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    this.ctx = ctx;
    this.canvas.width = GameConfig.WIDTH;
    this.canvas.height = GameConfig.HEIGHT;
    this.ctx.imageSmoothingEnabled = false;
  }
  /**
   * Load all game sprites
   */
  async loadSprites() {
    this.sprites = await loadAllSprites(true);
    this.loaded = true;
  }
  /**
   * Check if sprites are loaded
   */
  isLoaded() {
    return this.loaded;
  }
  /**
   * Render a frame of the game
   * @param state - Current game state
   * @param showMessage - Whether to show welcome message
   * @param reward - Optional per-frame reward value to display during training
   * @param cumulativeReward - Optional cumulative episode reward
   */
  render(state, showMessage = false, reward, cumulativeReward) {
    if (!this.sprites) return;
    this.frameCount++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    this.drawPipes(state);
    this.drawFloor(state);
    this.drawBird(state);
    this.drawScore(state.score);
    if (reward !== void 0) {
      this.drawReward(reward, cumulativeReward);
    }
    if (showMessage) {
      this.drawMessage();
    }
    if (state.done) {
      this.drawGameOver();
    }
  }
  drawBackground() {
    if (!this.sprites) return;
    this.ctx.drawImage(this.sprites.background, 0, 0);
  }
  drawFloor(state) {
    if (!this.sprites) return;
    drawFloor(this.ctx, this.sprites, state.floorX);
  }
  drawPipes(state) {
    if (!this.sprites) return;
    drawPipes(this.ctx, this.sprites, state.pipes);
  }
  drawBird(state) {
    if (!this.sprites) return;
    const birdX = GameConfig.BIRD.X;
    const birdY = state.birdY;
    this.birdFrame = drawBird(
      this.ctx,
      this.sprites,
      this.birdFrame,
      this.frameCount,
      birdX,
      birdY,
      state.birdRotation
    );
  }
  drawScore(score) {
    if (!this.sprites) return;
    drawScore(this.ctx, this.sprites, score, GameConfig.WIDTH, 30, 1);
  }
  drawMessage() {
    if (!this.sprites || !this.sprites.message) return;
    const msgX = (GameConfig.WIDTH - this.sprites.message.width) / 2;
    const msgY = (GameConfig.HEIGHT - this.sprites.message.height) / 2 - 50;
    this.ctx.drawImage(this.sprites.message, msgX, msgY);
  }
  drawGameOver() {
    if (!this.sprites) return;
    drawGameOver(
      this.ctx,
      this.sprites,
      GameConfig.WIDTH,
      GameConfig.HEIGHT,
      0.3,
      -50
    );
  }
  /**
   * Draw reward indicator in bottom right (over ground texture)
   */
  drawReward(reward, cumulativeReward) {
    const x = GameConfig.WIDTH - 12;
    const y = GameConfig.HEIGHT - 24;
    drawRewardIndicator(this.ctx, reward, cumulativeReward, x, y);
  }
  /**
   * Reset animation state (for new game)
   */
  resetFloor() {
    this.birdFrame = 0;
    this.frameCount = 0;
  }
  /**
   * Get canvas for external use
   */
  getCanvas() {
    return this.canvas;
  }
};

// src/games/flappy/TiledRenderer.ts
function calculateLayout(numInstances, canvasWidth, canvasHeight) {
  let cols;
  let rows;
  if (numInstances === 1) {
    cols = 1;
    rows = 1;
  } else if (numInstances <= 4) {
    cols = 2;
    rows = 2;
  } else if (numInstances <= 16) {
    cols = 4;
    rows = 4;
  } else {
    cols = 4;
    rows = 4;
  }
  const tileWidth = Math.floor(canvasWidth / cols);
  const tileHeight = Math.floor(canvasHeight / rows);
  const scaleX = tileWidth / GameConfig.WIDTH;
  const scaleY = tileHeight / GameConfig.HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  return { cols, rows, tileWidth, tileHeight, scale };
}
var TiledRenderer = class {
  canvas;
  ctx;
  sprites = null;
  loaded = false;
  numInstances = 1;
  layout;
  // Animation state per tile
  birdFrames = [];
  frameCount = 0;
  // Canvas dimensions
  canvasWidth;
  canvasHeight;
  constructor(canvas, canvasWidth = 576, canvasHeight = 768) {
    this.canvas = canvas;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    this.ctx = ctx;
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.layout = calculateLayout(1, canvasWidth, canvasHeight);
  }
  /**
   * Load all game sprites
   */
  async loadSprites() {
    this.sprites = await loadAllSprites(false);
    this.loaded = true;
  }
  /**
   * Set the number of instances to render
   */
  setInstanceCount(count) {
    this.numInstances = count;
    this.layout = calculateLayout(count, this.canvasWidth, this.canvasHeight);
    this.birdFrames = new Array(count).fill(0);
    this.frameCount = 0;
    console.log(`[TiledRenderer] Layout: ${this.layout.cols}x${this.layout.rows}, scale: ${this.layout.scale.toFixed(2)}`);
  }
  /**
   * Render multiple game states as tiles
   * @param states - Game states for each instance
   * @param rewards - Optional instant reward for each instance
   * @param cumulativeRewards - Optional cumulative episode reward for each instance
   */
  render(states, rewards, cumulativeRewards) {
    if (!this.sprites || !this.loaded) return;
    this.frameCount++;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const instancesToRender = Math.min(states.length, this.numInstances);
    for (let i = 0; i < instancesToRender; i++) {
      const reward = rewards?.[i];
      const cumulativeReward = cumulativeRewards?.[i];
      this.renderTile(i, states[i], reward, cumulativeReward);
    }
    for (let i = instancesToRender; i < this.numInstances; i++) {
      this.renderEmptyTile(i);
    }
  }
  /**
   * Render a single game instance in its tile
   */
  renderTile(index, state, reward, cumulativeReward) {
    if (!this.sprites) return;
    const { cols, tileWidth, tileHeight, scale } = this.layout;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const offsetX = col * tileWidth;
    const offsetY = row * tileHeight;
    this.ctx.save();
    this.ctx.translate(offsetX, offsetY);
    this.ctx.scale(scale, scale);
    this.ctx.beginPath();
    this.ctx.rect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT);
    this.ctx.clip();
    this.ctx.drawImage(this.sprites.background, 0, 0);
    drawPipes(this.ctx, this.sprites, state.pipes);
    drawFloor(this.ctx, this.sprites, state.floorX);
    const birdX = GameConfig.BIRD.X;
    const birdY = state.birdY;
    this.birdFrames[index] = drawBird(
      this.ctx,
      this.sprites,
      this.birdFrames[index] || 0,
      this.frameCount,
      birdX,
      birdY,
      state.birdRotation
    );
    this.drawScore(state.score, this.getScoreScale());
    if (state.done) {
      drawGameOver(
        this.ctx,
        this.sprites,
        GameConfig.WIDTH,
        GameConfig.HEIGHT,
        0.4,
        -this.sprites.gameOver.height / 2
      );
    }
    this.drawTileLabel(index, scale);
    if (this.numInstances > 1) {
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 1 / scale;
      this.ctx.strokeRect(0, 0, GameConfig.WIDTH, GameConfig.HEIGHT);
    }
    this.ctx.restore();
    if (reward !== void 0) {
      this.drawRewardUnscaled(reward, cumulativeReward, offsetX, offsetY, tileWidth, tileHeight);
    }
  }
  /**
   * Render an empty placeholder tile
   */
  renderEmptyTile(index) {
    const { cols, tileWidth, tileHeight, scale } = this.layout;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const offsetX = col * tileWidth;
    const offsetY = row * tileHeight;
    this.ctx.save();
    this.ctx.translate(offsetX, offsetY);
    this.ctx.fillStyle = "#1a1a2e";
    this.ctx.fillRect(0, 0, tileWidth, tileHeight);
    this.ctx.fillStyle = "#4a4a6a";
    this.ctx.font = `${Math.floor(16 * scale)}px Arial`;
    this.ctx.textAlign = "center";
    this.ctx.fillText(`#${index + 1}`, tileWidth / 2, tileHeight / 2);
    if (this.numInstances > 1) {
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(0, 0, tileWidth, tileHeight);
    }
    this.ctx.restore();
  }
  /**
   * Draw score in the tile
   */
  drawScore(score, sizeScale = 1) {
    if (!this.sprites) return;
    drawScore(this.ctx, this.sprites, score, GameConfig.WIDTH, 20, sizeScale);
  }
  /**
   * Scale score digits based on number of tiles:
   * 1 tile -> 1.0, 4 tiles -> 1.1, 16 tiles -> 1.25
   */
  getScoreScale() {
    if (this.numInstances <= 1) return 1;
    if (this.numInstances <= 4) return 1.1;
    return 1.25;
  }
  /**
   * Draw tile index label
   */
  drawTileLabel(index, scale) {
    if (this.numInstances <= 1) return;
    const fontSize = Math.max(10, Math.floor(14 / scale));
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(2, 2, 24, 16);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`#${index + 1}`, 5, 4);
  }
  /**
   * Draw reward indicator in bottom right (fixed size, not scaled)
   * Draws in screen space after context restore
   * Anchored to tile's bottom-right corner with fixed pixel offset
   */
  drawRewardUnscaled(reward, cumulativeReward, tileOffsetX, tileOffsetY, tileWidth, tileHeight) {
    const offsetFromRight = 12;
    const offsetFromBottom = 24;
    const screenX = tileOffsetX + tileWidth - offsetFromRight;
    const screenY = tileOffsetY + tileHeight - offsetFromBottom;
    drawRewardIndicator(this.ctx, reward, cumulativeReward, screenX, screenY);
  }
  /**
   * Check if sprites are loaded
   */
  isLoaded() {
    return this.loaded;
  }
  /**
   * Get current tile layout info
   */
  getLayout() {
    return { ...this.layout };
  }
  /**
   * Get canvas dimensions
   */
  getCanvasSize() {
    return { width: this.canvasWidth, height: this.canvasHeight };
  }
};

// src/games/index.ts
var flappyModule = {
  createEnv: (numEnvs2, rewardConfig2) => {
    return new VectorizedEnv(numEnvs2, { ...DefaultRewardConfig, ...rewardConfig2 });
  },
  createRenderer: (canvas) => {
    return new Renderer(canvas);
  },
  createTiledRenderer: (canvas, cols, rows) => {
    return new TiledRenderer(canvas, cols, rows);
  },
  defaultRewardConfig: DefaultRewardConfig,
  info: {
    id: "flappy",
    name: "Flappy Bird",
    description: "Navigate through pipes by flapping at the right moment",
    thumbnail: "/assets/sprites/yellowbird-midflap.png",
    inputDim: 6,
    outputDim: 2
  }
};
var gameRegistry = {
  flappy: flappyModule
};
function getGame(gameId) {
  return gameRegistry[gameId];
}
var DEFAULT_GAME_ID = "flappy";

// src/rl/TFDQNAgent.ts
import * as tf from "@tensorflow/tfjs";
var DefaultTFDQNConfig = {
  inputDim: 6,
  hiddenLayers: [64, 64],
  actionDim: 2,
  learningRate: 5e-4,
  gamma: 0.99,
  batchSize: 64,
  bufferSize: 5e4,
  epsilonStart: 0.5,
  epsilonEnd: 0.05,
  epsilonDecaySteps: 1e5,
  targetUpdateFreq: 500
};
function createDQNModel(inputDim, hiddenLayers, actionDim, learningRate) {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [inputDim],
    units: hiddenLayers[0],
    activation: "relu",
    kernelInitializer: "glorotUniform"
  }));
  for (let i = 1; i < hiddenLayers.length; i++) {
    model.add(tf.layers.dense({
      units: hiddenLayers[i],
      activation: "relu",
      kernelInitializer: "glorotUniform"
    }));
  }
  model.add(tf.layers.dense({
    units: actionDim,
    activation: "linear",
    kernelInitializer: "glorotUniform"
  }));
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: tf.losses.huberLoss
  });
  return model;
}
var TFDQNAgent = class {
  config;
  policyNetwork;
  targetNetwork;
  optimizer;
  // Training state
  trainingSteps = 0;
  totalEnvSteps = 0;
  // Total environment steps (for epsilon decay)
  epsilon;
  autoDecayEnabled = true;
  decayStartEpsilon;
  decayStartEnvStep = 0;
  // Env step when decay started
  // LR scheduler state
  lrSchedulerEnabled = false;
  lrSchedulerBestAvgReward = -Infinity;
  lrSchedulerPatienceCounter = 0;
  LR_SCHEDULER_PATIENCE = 20;
  LR_DECAY_FACTOR = 0.5;
  LR_MIN = 1e-5;
  // Metrics
  lastLoss = 0;
  lastQValues = [0, 0];
  constructor(config2 = {}) {
    this.config = { ...DefaultTFDQNConfig, ...config2 };
    this.epsilon = this.config.epsilonStart;
    this.decayStartEpsilon = this.config.epsilonStart;
    console.log(`[TFDQNAgent] Constructor: epsilonStart=${this.config.epsilonStart}, epsilonEnd=${this.config.epsilonEnd}, epsilonDecaySteps=${this.config.epsilonDecaySteps}`);
    this.policyNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    );
    this.targetNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    );
    this.syncTargetNetwork();
    this.optimizer = tf.train.adam(this.config.learningRate);
    console.log("[TFDQNAgent] Created with config:", this.config);
  }
  /**
   * Select action for a single state using epsilon-greedy policy
   */
  act(state, training = true) {
    const qValues = this.predictSingle(state);
    this.lastQValues = qValues;
    if (training && Math.random() < this.epsilon) {
      return Math.random() < 0.2 ? 1 : 0;
    }
    return qValues[0] > qValues[1] ? 0 : 1;
  }
  /**
   * Select actions for multiple states (batched inference)
   * Returns array of actions, one per state
   */
  actBatch(states, training = true) {
    const qValuesBatch = this.predictBatch(states);
    return qValuesBatch.map((qValues) => {
      if (training && Math.random() < this.epsilon) {
        return Math.random() < 0.2 ? 1 : 0;
      }
      return qValues[0] > qValues[1] ? 0 : 1;
    });
  }
  /**
   * Predict Q-values for a single state
   */
  predictSingle(state) {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state], [1, this.config.inputDim]);
      const prediction = this.policyNetwork.predict(stateTensor);
      return Array.from(prediction.dataSync());
    });
  }
  /**
   * Predict Q-values for a batch of states
   */
  predictBatch(states) {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d(states, [states.length, this.config.inputDim]);
      const prediction = this.policyNetwork.predict(stateTensor);
      const data = prediction.arraySync();
      return data;
    });
  }
  /**
   * Train on a batch of transitions
   * Returns the average loss
   */
  trainBatch(states, actions, rewards, nextStates, dones) {
    const batchSize = states.length;
    const loss = tf.tidy(() => {
      const statesTensor = tf.tensor2d(states, [batchSize, this.config.inputDim]);
      const nextStatesTensor = tf.tensor2d(nextStates, [batchSize, this.config.inputDim]);
      const rewardsTensor = tf.tensor1d(rewards);
      const donesTensor = tf.tensor1d(dones.map((d) => d ? 0 : 1));
      const nextQValues = this.targetNetwork.predict(nextStatesTensor);
      const maxNextQ = nextQValues.max(1);
      const targets = rewardsTensor.add(
        donesTensor.mul(tf.scalar(this.config.gamma)).mul(maxNextQ)
      );
      const currentQValues = this.policyNetwork.predict(statesTensor);
      const actionIndices = tf.tensor1d(actions, "int32");
      const batchIndices = tf.range(0, batchSize, 1, "int32");
      const indices = tf.stack([batchIndices, actionIndices], 1);
      const targetQValues = currentQValues.clone();
      const targetValues = tf.tensorScatterUpdate(
        targetQValues,
        indices,
        targets
      );
      const lossValue = tf.losses.huberLoss(targetValues, currentQValues);
      return lossValue.dataSync()[0];
    });
    this.optimizerStep(states, actions, rewards, nextStates, dones);
    this.trainingSteps++;
    this.lastLoss = loss;
    if (this.trainingSteps % this.config.targetUpdateFreq === 0) {
      this.syncTargetNetwork();
    }
    return loss;
  }
  /**
   * Perform optimizer step with gradient clipping
   */
  optimizerStep(states, actions, rewards, nextStates, dones) {
    const batchSize = states.length;
    tf.tidy(() => {
      const statesTensor = tf.tensor2d(states, [batchSize, this.config.inputDim]);
      const nextStatesTensor = tf.tensor2d(nextStates, [batchSize, this.config.inputDim]);
      const rewardsTensor = tf.tensor1d(rewards);
      const donesTensor = tf.tensor1d(dones.map((d) => d ? 0 : 1));
      const nextQValues = this.targetNetwork.predict(nextStatesTensor);
      const maxNextQ = nextQValues.max(1);
      const targets = rewardsTensor.add(
        donesTensor.mul(tf.scalar(this.config.gamma)).mul(maxNextQ)
      );
      const actionTensor = tf.tensor1d(actions, "int32");
      const lossFn = () => {
        const currentQValues = this.policyNetwork.predict(statesTensor);
        const actionOneHot = tf.oneHot(actionTensor, this.config.actionDim);
        const predictedQ = tf.sum(tf.mul(currentQValues, actionOneHot), 1);
        const lossTensor = tf.losses.huberLoss(targets, predictedQ);
        return lossTensor;
      };
      this.optimizer.minimize(
        lossFn,
        /* returnCost */
        false
      );
    });
  }
  /**
   * Copy weights from policy network to target network
   */
  syncTargetNetwork() {
    const policyWeights = this.policyNetwork.getWeights();
    this.targetNetwork.setWeights(policyWeights);
  }
  /**
   * Update epsilon based on decay schedule (uses total env steps for consistent decay across instance counts)
   */
  updateEpsilon() {
    if (!this.autoDecayEnabled) return;
    const stepsSinceDecayStart = this.totalEnvSteps - this.decayStartEnvStep;
    const frac = Math.min(1, stepsSinceDecayStart / this.config.epsilonDecaySteps);
    const newEpsilon = this.decayStartEpsilon + frac * (this.config.epsilonEnd - this.decayStartEpsilon);
    this.epsilon = newEpsilon;
  }
  /**
   * Record environment steps (call this from training loop)
   */
  recordEnvSteps(count) {
    this.totalEnvSteps += count;
    this.updateEpsilon();
  }
  /**
   * Get total environment steps
   */
  getTotalEnvSteps() {
    return this.totalEnvSteps;
  }
  // ===== Getters and Setters =====
  getEpsilon() {
    return this.epsilon;
  }
  setEpsilon(value) {
    const newEpsilon = Math.max(0, Math.min(1, value));
    if (this.autoDecayEnabled && newEpsilon !== this.epsilon) {
      this.decayStartEpsilon = newEpsilon;
      this.decayStartEnvStep = this.totalEnvSteps;
    }
    this.epsilon = newEpsilon;
  }
  getAutoDecay() {
    return this.autoDecayEnabled;
  }
  setAutoDecay(enabled) {
    console.log(`[TFDQNAgent] setAutoDecay(${enabled}): was=${this.autoDecayEnabled}, totalEnvSteps=${this.totalEnvSteps}, currentEpsilon=${this.epsilon}`);
    if (enabled && !this.autoDecayEnabled) {
      this.decayStartEpsilon = this.epsilon;
      this.decayStartEnvStep = this.totalEnvSteps;
      console.log(`[TFDQNAgent] Reset decay: decayStartEpsilon=${this.decayStartEpsilon}, decayStartEnvStep=${this.decayStartEnvStep}`);
    }
    this.autoDecayEnabled = enabled;
  }
  getEpsilonDecaySteps() {
    return this.config.epsilonDecaySteps;
  }
  setEpsilonDecaySteps(steps) {
    const newSteps = Math.max(1e3, steps);
    if (this.autoDecayEnabled && newSteps !== this.config.epsilonDecaySteps) {
      this.decayStartEpsilon = this.epsilon;
      this.decayStartEnvStep = this.totalEnvSteps;
    }
    this.config.epsilonDecaySteps = newSteps;
  }
  getLearningRate() {
    return this.config.learningRate;
  }
  setLearningRate(lr) {
    this.config.learningRate = lr;
    this.optimizer = tf.train.adam(lr);
  }
  getLRSchedulerEnabled() {
    return this.lrSchedulerEnabled;
  }
  setLRScheduler(enabled) {
    this.lrSchedulerEnabled = enabled;
    if (enabled) {
      this.lrSchedulerBestAvgReward = -Infinity;
      this.lrSchedulerPatienceCounter = 0;
    }
  }
  /**
   * Update LR scheduler based on average reward (call periodically during training)
   * @returns true if learning rate was reduced
   */
  updateLRScheduler(avgReward) {
    if (!this.lrSchedulerEnabled) return false;
    if (avgReward > this.lrSchedulerBestAvgReward) {
      this.lrSchedulerBestAvgReward = avgReward;
      this.lrSchedulerPatienceCounter = 0;
      return false;
    }
    this.lrSchedulerPatienceCounter++;
    if (this.lrSchedulerPatienceCounter >= this.LR_SCHEDULER_PATIENCE) {
      const newLR = Math.max(this.LR_MIN, this.config.learningRate * this.LR_DECAY_FACTOR);
      if (newLR < this.config.learningRate) {
        console.log(`[TFDQNAgent] LR scheduler: reducing LR from ${this.config.learningRate} to ${newLR}`);
        this.setLearningRate(newLR);
        this.lrSchedulerPatienceCounter = 0;
        return true;
      }
    }
    return false;
  }
  getGamma() {
    return this.config.gamma;
  }
  setGamma(value) {
    this.config.gamma = Math.max(0, Math.min(1, value));
  }
  getTrainingSteps() {
    return this.trainingSteps;
  }
  getLastLoss() {
    return this.lastLoss;
  }
  getLastQValues() {
    return this.lastQValues;
  }
  getConfig() {
    return { ...this.config };
  }
  /**
   * Save model weights to JSON format
   */
  async save() {
    return {
      weights: this.getWeightsJSON(),
      config: this.config
    };
  }
  /**
   * Export weights as a serializable object for checkpoints
   */
  getWeightsJSON() {
    const weights = this.policyNetwork.getWeights();
    const layerWeights = [];
    for (const w of weights) {
      const data = w.arraySync();
      if (Array.isArray(data)) {
        layerWeights.push(data);
      }
    }
    return { layerWeights };
  }
  /**
   * Load weights from a serializable object
   */
  loadWeightsJSON(data) {
    const currentWeights = this.policyNetwork.getWeights();
    const newWeights = [];
    let dataIdx = 0;
    for (const w of currentWeights) {
      const shape = w.shape;
      if (dataIdx < data.layerWeights.length) {
        newWeights.push(tf.tensor(data.layerWeights[dataIdx], shape));
        dataIdx++;
      } else {
        newWeights.push(w.clone());
      }
    }
    this.policyNetwork.setWeights(newWeights);
    this.syncTargetNetwork();
    newWeights.forEach((t) => t.dispose());
  }
  /**
   * Reset the agent to initial state
   */
  reset() {
    this.trainingSteps = 0;
    this.totalEnvSteps = 0;
    this.epsilon = this.config.epsilonStart;
    this.decayStartEpsilon = this.config.epsilonStart;
    this.decayStartEnvStep = 0;
    this.lastLoss = 0;
    this.lastQValues = [0, 0];
    this.policyNetwork.dispose();
    this.targetNetwork.dispose();
    this.policyNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    );
    this.targetNetwork = createDQNModel(
      this.config.inputDim,
      this.config.hiddenLayers,
      this.config.actionDim,
      this.config.learningRate
    );
    this.syncTargetNetwork();
  }
  /**
   * Dispose TensorFlow resources
   */
  dispose() {
    this.policyNetwork.dispose();
    this.targetNetwork.dispose();
  }
};

// src/rl/ReplayBuffer.ts
var ReplayBuffer = class {
  buffer = [];
  maxSize;
  position = 0;
  constructor(maxSize = 1e5) {
    this.maxSize = maxSize;
  }
  /**
   * Add a transition to the buffer
   */
  add(transition) {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(transition);
    } else {
      this.buffer[this.position] = transition;
    }
    this.position = (this.position + 1) % this.maxSize;
  }
  /**
   * Sample a random batch of transitions
   */
  sample(batchSize) {
    const batch = [];
    const indices = /* @__PURE__ */ new Set();
    while (indices.size < Math.min(batchSize, this.buffer.length)) {
      indices.add(Math.floor(Math.random() * this.buffer.length));
    }
    for (const idx of indices) {
      batch.push(this.buffer[idx]);
    }
    return batch;
  }
  /**
   * Get current buffer size
   */
  size() {
    return this.buffer.length;
  }
  /**
   * Check if buffer has enough samples for training
   */
  canSample(batchSize) {
    return this.buffer.length >= batchSize;
  }
  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = [];
    this.position = 0;
  }
  /**
   * Resize the buffer capacity, preserving the most recent transitions
   * - Growing: just increases maxSize, existing data stays
   * - Shrinking: keeps the most recent min(newCapacity, currentSize) transitions
   */
  resize(newCapacity) {
    if (newCapacity === this.maxSize) return;
    if (newCapacity > this.maxSize) {
      this.maxSize = newCapacity;
      return;
    }
    const keepCount = Math.min(newCapacity, this.buffer.length);
    if (keepCount === 0) {
      this.buffer = [];
      this.position = 0;
      this.maxSize = newCapacity;
      return;
    }
    const newBuffer = [];
    const startIdx = (this.position - keepCount + this.buffer.length) % this.buffer.length;
    for (let i = 0; i < keepCount; i++) {
      newBuffer.push(this.buffer[(startIdx + i) % this.buffer.length]);
    }
    this.buffer = newBuffer;
    this.maxSize = newCapacity;
    this.position = keepCount % newCapacity;
  }
};

// src/rl/types.ts
var DefaultTrainingMetrics = {
  episode: 0,
  episodeReward: 0,
  episodeLength: 0,
  avgReward: 0,
  avgLength: 0,
  epsilon: 1,
  loss: 0,
  bufferSize: 0,
  totalSteps: 0,
  learningRate: 5e-4,
  stepsPerSecond: 0,
  episodesPerSecond: 0,
  isWarmup: true,
  isAutoEval: false,
  numInstances: 1,
  backend: "cpu"
};
var DefaultMetricsConfig = {
  emitIntervalMs: 500,
  rollingWindowSize: 50,
  warmupSize: 1e4
};
var MetricsCollector = class {
  config;
  metrics;
  recentRewards = [];
  recentLengths = [];
  lastEmitTime = 0;
  stepsSinceLastEmit = 0;
  episodesSinceLastEmit = 0;
  constructor(config2 = {}) {
    this.config = { ...DefaultMetricsConfig, ...config2 };
    this.metrics = { ...DefaultTrainingMetrics };
    this.lastEmitTime = performance.now();
  }
  /**
   * Record an episode completion
   */
  recordEpisode(reward, length, _score) {
    this.metrics.episode++;
    this.metrics.episodeReward = reward;
    this.metrics.episodeLength = length;
    this.episodesSinceLastEmit++;
    this.recentRewards.push(reward);
    this.recentLengths.push(length);
    if (this.recentRewards.length > this.config.rollingWindowSize) {
      this.recentRewards.shift();
      this.recentLengths.shift();
    }
    this.metrics.avgReward = this.recentRewards.reduce((a, b) => a + b, 0) / this.recentRewards.length;
    this.metrics.avgLength = this.recentLengths.reduce((a, b) => a + b, 0) / this.recentLengths.length;
  }
  /**
   * Record environment steps
   */
  recordSteps(count) {
    this.metrics.totalSteps += count;
    this.stepsSinceLastEmit += count;
  }
  /**
   * Update training metrics
   */
  updateTrainingMetrics(update) {
    Object.assign(this.metrics, update);
  }
  /**
   * Check if it's time to emit metrics
   */
  shouldEmit() {
    const now = performance.now();
    return now - this.lastEmitTime >= this.config.emitIntervalMs;
  }
  /**
   * Get current metrics and reset interval counters
   */
  emit() {
    const now = performance.now();
    const elapsed = now - this.lastEmitTime;
    this.metrics.stepsPerSecond = this.stepsSinceLastEmit / elapsed * 1e3;
    this.metrics.episodesPerSecond = this.episodesSinceLastEmit / elapsed * 1e3;
    this.metrics.isWarmup = this.metrics.bufferSize < this.config.warmupSize;
    this.stepsSinceLastEmit = 0;
    this.episodesSinceLastEmit = 0;
    this.lastEmitTime = now;
    return { ...this.metrics };
  }
  /**
   * Get current metrics without resetting counters
   */
  getMetrics() {
    return { ...this.metrics };
  }
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = { ...DefaultTrainingMetrics };
    this.recentRewards = [];
    this.recentLengths = [];
    this.stepsSinceLastEmit = 0;
    this.episodesSinceLastEmit = 0;
    this.lastEmitTime = performance.now();
  }
};

// src/rl/backendUtils.ts
import * as tf2 from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgpu";
var BACKEND_INFO = {
  webgpu: { name: "webgpu", displayName: "WebGPU", isGPU: true },
  webgl: { name: "webgl", displayName: "WebGL", isGPU: true },
  cpu: { name: "cpu", displayName: "CPU", isGPU: false }
};
async function initBestBackend(preferred = "auto") {
  if (preferred !== "auto") {
    const success = await trySetBackend(preferred);
    if (success) {
      console.log(`[TF.js] Initialized with preferred backend: ${preferred}`);
      return BACKEND_INFO[preferred];
    }
    console.warn(`[TF.js] Preferred backend '${preferred}' not available, falling back to auto-detect`);
  }
  const backendPriority = ["webgpu", "webgl", "cpu"];
  for (const backend of backendPriority) {
    const success = await trySetBackend(backend);
    if (success) {
      console.log(`[TF.js] Initialized with backend: ${backend}`);
      return BACKEND_INFO[backend];
    }
  }
  throw new Error("[TF.js] Failed to initialize any backend");
}
async function trySetBackend(backend) {
  try {
    const registeredBackends = tf2.engine().registryFactory;
    if (!registeredBackends[backend]) {
      return false;
    }
    await tf2.setBackend(backend);
    await tf2.ready();
    const currentBackend2 = tf2.getBackend();
    return currentBackend2 === backend;
  } catch (error) {
    console.warn(`[TF.js] Backend '${backend}' initialization failed:`, error);
    return false;
  }
}

// src/rl/tfTraining.worker.ts
var agent = null;
var env = null;
var buffer = null;
var metricsCollector = null;
var config = { ...DefaultTFDQNConfig };
var rewardConfig = { ...DefaultRewardConfig };
var currentBackend = "cpu";
var currentGameId = DEFAULT_GAME_ID;
var isTraining = false;
var isEval = false;
var visualize = false;
var numEnvs = 1;
var autoRestartEval = false;
var frameLimitEnabled = false;
var lastFrameTime = 0;
var lastTrainingNumEnvs = null;
var ranEvalSinceLastTraining = false;
var FRAME_INTERVAL_MS = 1e3 / 30;
var autoEvalEnabled = true;
var autoEvalInterval = 5e3;
var autoEvalTrials = 64;
var isAutoEvalRunning = false;
var lastAutoEvalEpisode = 0;
var savedEpsilonBeforeAutoEval = 0.3;
var savedNumEnvsBeforeAutoEval = 1;
var BASE_WARMUP_SIZE = 1e4;
var MAX_BUFFER_SIZE = 1e6;
var TARGET_SCALE_DIVISOR = 32;
var baseEpsilonDecaySteps = DefaultTFDQNConfig.epsilonDecaySteps;
var baseBufferSize = DefaultTFDQNConfig.bufferSize;
var baseTargetUpdateFreq = DefaultTFDQNConfig.targetUpdateFreq;
var baseLearningRate = DefaultTFDQNConfig.learningRate;
var warmupSize = BASE_WARMUP_SIZE;
var bufferCapacity = DefaultTFDQNConfig.bufferSize;
var lastMetricsTime = 0;
var lastStatesTime = 0;
var lastNetworkVizTime = 0;
var previousWeights = null;
var METRICS_INTERVAL = 500;
var STATES_INTERVAL = 33;
var NETWORK_VIZ_INTERVAL = 33;
var TRAIN_FREQ = 4;
var BATCH_SIZE = 64;
function applyScaling(currentNumEnvs) {
  const N = Math.max(1, currentNumEnvs);
  warmupSize = BASE_WARMUP_SIZE;
  const newBufferCapacity = Math.min(baseBufferSize * N, MAX_BUFFER_SIZE);
  config.epsilonDecaySteps = Math.max(1, Math.round(baseEpsilonDecaySteps * N));
  const targetScale = Math.max(1, N / TARGET_SCALE_DIVISOR);
  config.targetUpdateFreq = Math.max(1, Math.round(baseTargetUpdateFreq * targetScale));
  config.learningRate = baseLearningRate / Math.sqrt(targetScale);
  if (agent) {
    agent.setEpsilonDecaySteps(config.epsilonDecaySteps);
    agent.setLearningRate(config.learningRate);
    agent.config.targetUpdateFreq = config.targetUpdateFreq;
  }
  if (!buffer) {
    buffer = new ReplayBuffer(newBufferCapacity);
  } else if (bufferCapacity !== newBufferCapacity) {
    buffer.resize(newBufferCapacity);
  }
  bufferCapacity = newBufferCapacity;
  if (metricsCollector) {
    metricsCollector = new MetricsCollector({
      emitIntervalMs: METRICS_INTERVAL,
      warmupSize
    });
    if (env) {
      env.clearOnEpisodeComplete();
      const collector = metricsCollector;
      if (collector) {
        env.setOnEpisodeComplete((stats) => {
          collector.recordEpisode(stats.reward, stats.length, stats.score);
        });
      }
    }
  }
}
async function initialize(agentConfig, initialNumEnvs, backend, gameId = DEFAULT_GAME_ID) {
  try {
    const backendInfo = await initBestBackend(backend);
    currentBackend = backendInfo.name;
    console.log(`[TFWorker] TF.js initialized with backend: ${currentBackend}`);
    currentGameId = gameId || DEFAULT_GAME_ID;
    const resolvedGameId = currentGameId || DEFAULT_GAME_ID;
    const gameModule = getGame(resolvedGameId) || getGame(DEFAULT_GAME_ID);
    if (!gameModule) {
      throw new Error(`Game module not found for id: ${resolvedGameId}`);
    }
    const { inputDim, outputDim } = gameModule.info;
    config = {
      ...DefaultTFDQNConfig,
      inputDim,
      actionDim: outputDim,
      ...agentConfig
      // User config can still override if needed
    };
    numEnvs = initialNumEnvs;
    baseEpsilonDecaySteps = config.epsilonDecaySteps;
    baseBufferSize = config.bufferSize;
    baseTargetUpdateFreq = config.targetUpdateFreq;
    baseLearningRate = config.learningRate;
    applyScaling(numEnvs);
    agent = new TFDQNAgent(config);
    const defaultRewards = gameModule.defaultRewardConfig || DefaultRewardConfig;
    rewardConfig = { ...defaultRewards };
    env = gameModule.createEnv(numEnvs, rewardConfig);
    buffer = new ReplayBuffer(bufferCapacity);
    metricsCollector = new MetricsCollector({
      emitIntervalMs: METRICS_INTERVAL,
      warmupSize
    });
    metricsCollector.updateTrainingMetrics({
      numInstances: numEnvs,
      backend: currentBackend
    });
    env.setOnEpisodeComplete((stats) => {
      metricsCollector?.recordEpisode(stats.reward, stats.length, stats.score);
    });
    self.postMessage({ type: "ready", backend: currentBackend });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", message: `Initialization failed: ${msg}` });
  }
}
function runTrainingBatch() {
  if (!isTraining || !agent || !env || !buffer || !metricsCollector) return;
  if (visualize && frameLimitEnabled) {
    const now2 = performance.now();
    const elapsed = now2 - lastFrameTime;
    if (elapsed < FRAME_INTERVAL_MS) {
      setTimeout(runTrainingBatch, FRAME_INTERVAL_MS - elapsed);
      return;
    }
    lastFrameTime = now2;
  }
  const startTime = performance.now();
  const batchSteps = visualize && frameLimitEnabled ? 1 : 512;
  let observations = env.getObservations();
  for (let i = 0; i < batchSteps && isTraining; i++) {
    const actions = agent.actBatch(observations, true);
    const result = env.stepAll(actions, true);
    for (let j = 0; j < numEnvs; j++) {
      buffer.add({
        state: observations[j],
        action: actions[j],
        reward: result.rewards[j],
        nextState: result.observations[j],
        done: result.dones[j]
      });
    }
    metricsCollector.recordSteps(numEnvs);
    agent.recordEnvSteps(numEnvs);
    const totalSteps = metricsCollector.getMetrics().totalSteps;
    const bufferSize = buffer.size();
    if (bufferSize >= warmupSize && totalSteps % TRAIN_FREQ === 0) {
      const batch = buffer.sample(BATCH_SIZE);
      const loss = agent.trainBatch(
        batch.map((t) => t.state),
        batch.map((t) => t.action),
        batch.map((t) => t.reward),
        batch.map((t) => t.nextState),
        batch.map((t) => t.done)
      );
      metricsCollector.updateTrainingMetrics({ loss, bufferSize });
    }
    metricsCollector.updateTrainingMetrics({ epsilon: agent.getEpsilon() });
    observations = result.observations;
    const currentEpisode = metricsCollector.getMetrics().episode;
    if (autoEvalEnabled && !isAutoEvalRunning && bufferSize >= warmupSize && currentEpisode > 0 && currentEpisode - lastAutoEvalEpisode >= autoEvalInterval) {
      runAutoEval();
      return;
    }
    if (performance.now() - startTime > 50) break;
  }
  const now = performance.now();
  if (now - lastMetricsTime >= METRICS_INTERVAL) {
    emitMetrics();
    emitWeightHealth();
    lastMetricsTime = now;
  }
  if (visualize && numEnvs <= MAX_VISUALIZED_INSTANCES && now - lastStatesTime >= STATES_INTERVAL) {
    emitGameStates();
    lastStatesTime = now;
  }
  if (visualize && numEnvs === 1 && now - lastNetworkVizTime >= NETWORK_VIZ_INTERVAL) {
    emitNetworkViz();
    lastNetworkVizTime = now;
  }
  if (isTraining) {
    setTimeout(runTrainingBatch, 0);
  }
}
function runEvalBatch() {
  if (!isEval || !agent || !env) return;
  if (visualize && frameLimitEnabled) {
    const now2 = performance.now();
    const elapsed = now2 - lastFrameTime;
    if (elapsed < FRAME_INTERVAL_MS) {
      setTimeout(runEvalBatch, FRAME_INTERVAL_MS - elapsed);
      return;
    }
    lastFrameTime = now2;
  }
  const startTime = performance.now();
  const batchSteps = visualize && frameLimitEnabled ? 1 : 64;
  let observations = env.getObservations();
  for (let i = 0; i < batchSteps && isEval; i++) {
    if (!autoRestartEval && env.countActive() === 0) {
      finishEval();
      return;
    }
    const actions = agent.actBatch(observations, false);
    const result = env.stepAll(actions, autoRestartEval);
    observations = result.observations;
    if (performance.now() - startTime > 30) break;
  }
  const now = performance.now();
  if (numEnvs <= MAX_VISUALIZED_INSTANCES && now - lastStatesTime >= STATES_INTERVAL) {
    emitGameStates();
    lastStatesTime = now;
  }
  if (numEnvs === 1 && now - lastNetworkVizTime >= NETWORK_VIZ_INTERVAL) {
    emitNetworkViz();
    lastNetworkVizTime = now;
  }
  if (isEval) {
    setTimeout(runEvalBatch, 0);
  }
}
function finishEval() {
  if (!env) return;
  const wasAutoEval = isAutoEvalRunning;
  isEval = false;
  const scores = env.getScores();
  const result = {
    avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    medianScore: scores.length > 0 ? [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0,
    scores: [...scores],
    episode: metricsCollector?.getMetrics().episode || 0,
    numTrials: scores.length,
    isAutoEval: wasAutoEval
  };
  if (wasAutoEval) {
    finishAutoEval(result);
  } else {
    self.postMessage({ type: "autoEvalResult", result });
  }
}
function runAutoEval() {
  if (!agent || !env || isAutoEvalRunning) return;
  const currentEpisode = metricsCollector?.getMetrics().episode || 0;
  console.log(`[TFWorker] Starting auto-eval at episode ${currentEpisode}`);
  isAutoEvalRunning = true;
  isTraining = false;
  savedEpsilonBeforeAutoEval = agent.getEpsilon();
  agent.setEpsilon(0);
  savedNumEnvsBeforeAutoEval = numEnvs;
  const autoEvalNumEnvs = autoEvalTrials;
  if (env) {
    env.resize(autoEvalNumEnvs);
    numEnvs = autoEvalNumEnvs;
  }
  env?.clearOnEpisodeComplete();
  env?.resetAll();
  isEval = true;
  visualize = autoEvalNumEnvs <= MAX_VISUALIZED_INSTANCES;
  autoRestartEval = false;
  lastStatesTime = performance.now();
  lastFrameTime = performance.now();
  runEvalBatch();
}
function finishAutoEval(result) {
  if (!env || !agent || !metricsCollector) return;
  console.log("[TFWorker] Finishing auto-eval");
  isAutoEvalRunning = false;
  agent.setEpsilon(savedEpsilonBeforeAutoEval);
  env.resize(savedNumEnvsBeforeAutoEval);
  numEnvs = savedNumEnvsBeforeAutoEval;
  env.clearOnEpisodeComplete();
  const collector = metricsCollector;
  if (collector) {
    env.setOnEpisodeComplete((stats) => {
      collector.recordEpisode(stats.reward, stats.length, stats.score);
    });
  }
  lastAutoEvalEpisode = result.episode;
  self.postMessage({ type: "autoEvalResult", result });
  isTraining = true;
  visualize = numEnvs <= MAX_VISUALIZED_INSTANCES;
  env.resetAll();
  lastMetricsTime = performance.now();
  lastStatesTime = performance.now();
  runTrainingBatch();
}
function emitMetrics() {
  if (!metricsCollector || !agent) return;
  if (!isAutoEvalRunning) {
    const currentMetrics = metricsCollector.getMetrics();
    agent.updateLRScheduler(currentMetrics.avgReward);
  }
  metricsCollector.updateTrainingMetrics({
    epsilon: agent.getEpsilon(),
    // Always include current epsilon
    learningRate: agent.getLearningRate(),
    bufferSize: buffer?.size() || 0,
    isAutoEval: isAutoEvalRunning,
    autoEvalTrial: isAutoEvalRunning ? env?.countActive() || 0 : void 0,
    autoEvalTrials: isAutoEvalRunning ? autoEvalTrials : void 0
  });
  const metrics = metricsCollector.emit();
  self.postMessage({ type: "metrics", data: metrics });
}
function emitGameStates() {
  if (!env) return;
  const statesWithRewards = env.getStatesWithRewards();
  const states = statesWithRewards.map((s) => s.state);
  const rewards = statesWithRewards.map((s) => s.reward);
  const cumulativeRewards = statesWithRewards.map((s) => s.cumulativeReward);
  self.postMessage({
    type: "gameStates",
    states,
    rewards,
    cumulativeRewards
  });
}
function emitWeightHealth() {
  if (!agent) return;
  const currentWeights = agent.getWeightsJSON().layerWeights;
  if (!previousWeights) {
    previousWeights = currentWeights;
    return;
  }
  let deltaSum = 0;
  let signSum = 0;
  let count = 0;
  for (let l = 0; l < currentWeights.length; l++) {
    const prevLayer = previousWeights[l];
    const newLayer = currentWeights[l];
    if (!prevLayer || !newLayer) continue;
    for (let i = 0; i < newLayer.length; i++) {
      const prevRow = prevLayer[i];
      const newRow = newLayer[i];
      if (!prevRow || !newRow) continue;
      for (let j = 0; j < newRow.length; j++) {
        const diff = newRow[j] - (prevRow[j] ?? 0);
        deltaSum += diff * diff;
        signSum += Math.sign(diff);
        count++;
      }
    }
  }
  const weightDelta = count > 0 ? Math.sqrt(deltaSum / count) : 0;
  const avgGradSign = count > 0 ? signSum / count : 0;
  previousWeights = currentWeights;
  const health = {
    weightDelta,
    avgGradSign,
    gradientNorm: 0,
    // TODO: capture during training
    timestamp: performance.now()
  };
  self.postMessage({ type: "weightHealth", data: health });
}
function emitNetworkViz() {
  if (!agent || !env || numEnvs !== 1) return;
  const observations = env.getObservations();
  if (!observations || observations.length === 0) return;
  const state = observations[0];
  const qValues = agent.predictSingle(state);
  const greedyAction = qValues[0] > qValues[1] ? 0 : 1;
  const epsilon = agent.getEpsilon();
  const exploreRoll = Math.random();
  const isExploring = isTraining && exploreRoll < epsilon;
  const selectedAction = isExploring ? Math.random() < 0.2 ? 1 : 0 : greedyAction;
  self.postMessage({
    type: "network",
    data: {
      input: state,
      qValues,
      selectedAction,
      greedyAction,
      epsilon,
      isExploring
    }
  });
}
self.onmessage = async (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "init":
        await initialize(msg.config, msg.numEnvs, msg.backend, msg.gameId || DEFAULT_GAME_ID);
        break;
      case "setNumEnvs":
        numEnvs = msg.count;
        applyScaling(numEnvs);
        env?.resize(numEnvs);
        metricsCollector?.updateTrainingMetrics({ numInstances: numEnvs });
        if (isTraining || isEval) {
          visualize = numEnvs <= MAX_VISUALIZED_INSTANCES;
          lastFrameTime = performance.now();
        }
        break;
      case "startTraining":
        if (!agent || !env || !buffer) {
          self.postMessage({ type: "error", message: "Not initialized" });
          return;
        }
        const shouldResetEnv = lastTrainingNumEnvs === null || numEnvs !== lastTrainingNumEnvs || ranEvalSinceLastTraining;
        isTraining = true;
        isEval = false;
        visualize = msg.visualize && numEnvs <= MAX_VISUALIZED_INSTANCES;
        lastFrameTime = performance.now();
        env.clearOnEpisodeComplete();
        const collector = metricsCollector;
        if (collector) {
          env.setOnEpisodeComplete((stats) => {
            collector.recordEpisode(stats.reward, stats.length, stats.score);
          });
        }
        if (shouldResetEnv) {
          env.resetAll();
        }
        lastMetricsTime = performance.now();
        lastStatesTime = performance.now();
        lastNetworkVizTime = 0;
        lastTrainingNumEnvs = numEnvs;
        ranEvalSinceLastTraining = false;
        runTrainingBatch();
        break;
      case "stopTraining":
        isTraining = false;
        break;
      case "startEval":
        if (!agent) {
          self.postMessage({ type: "error", message: "Not initialized" });
          return;
        }
        isEval = true;
        isTraining = false;
        ranEvalSinceLastTraining = true;
        autoRestartEval = msg.autoRestart;
        lastFrameTime = performance.now();
        if (msg.numEnvs !== numEnvs) {
          env?.resize(msg.numEnvs);
          numEnvs = msg.numEnvs;
        }
        visualize = numEnvs <= MAX_VISUALIZED_INSTANCES;
        if (!autoRestartEval && env) {
          env.setOnEpisodeComplete((stats) => {
            self.postMessage({
              type: "episodeEnd",
              score: stats.score,
              reward: stats.reward,
              length: stats.length,
              envIndex: stats.envIndex
            });
          });
        } else if (env) {
          env.clearOnEpisodeComplete();
        }
        env?.resetAll();
        lastStatesTime = performance.now();
        runEvalBatch();
        break;
      case "stopEval":
        isEval = false;
        break;
      case "setFrameLimit":
        frameLimitEnabled = msg.enabled;
        lastFrameTime = performance.now();
        break;
      case "requestWeights":
        if (agent) {
          const weights = agent.getWeightsJSON();
          self.postMessage({ type: "weights", data: weights });
        }
        break;
      case "setWeights":
        agent?.loadWeightsJSON(msg.data);
        break;
      case "setEpsilon":
        agent?.setEpsilon(msg.value);
        break;
      case "setAutoDecay":
        agent?.setAutoDecay(msg.enabled);
        break;
      case "setEpsilonDecaySteps":
        agent?.setEpsilonDecaySteps(msg.steps);
        break;
      case "setLearningRate":
        agent?.setLearningRate(msg.value);
        break;
      case "setLRScheduler":
        agent?.setLRScheduler(msg.enabled);
        break;
      case "setGamma":
        agent?.setGamma(msg.value);
        break;
      case "setRewardConfig":
        {
          const sanitized = { ...rewardConfig };
          for (const [key, value] of Object.entries(msg.config)) {
            if (typeof value === "number") {
              sanitized[key] = value;
            }
          }
          rewardConfig = sanitized;
          env?.setRewardConfig(sanitized);
        }
        break;
      case "setAutoEval":
        autoEvalEnabled = msg.enabled;
        if (typeof msg.interval === "number" && msg.interval > 0) {
          autoEvalInterval = msg.interval;
        }
        if (typeof msg.trials === "number" && msg.trials > 0) {
          autoEvalTrials = Math.min(msg.trials, 64);
        }
        lastAutoEvalEpisode = 0;
        console.log(
          `[TFWorker] Auto-eval ${autoEvalEnabled ? "enabled" : "disabled"} (every ${autoEvalInterval} eps, ${autoEvalTrials} trials)`
        );
        break;
      case "reset":
        isTraining = false;
        isEval = false;
        isAutoEvalRunning = false;
        lastAutoEvalEpisode = 0;
        agent?.reset();
        buffer?.clear();
        env?.resetAll();
        metricsCollector?.reset();
        previousWeights = null;
        break;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", message: errorMsg });
  }
};
