/**
 * Simple Leaderboard API Server
 * Stores per-game leaderboards in local JSON files
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Data file path - persisted in a volume (mutable for tests)
let DATA_DIR = process.env.DATA_DIR || './data';

// Default game ID for backwards compatibility
const DEFAULT_GAME_ID = 'flappy';

// Valid game IDs (can be extended as more games are added)
const VALID_GAME_IDS = ['flappy'];

// Metrics file name (aggregate, no identifiers)
const METRICS_FILE = 'metrics.json';

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getMetricsFilePath() {
  ensureDataDir();
  return path.join(DATA_DIR, METRICS_FILE);
}

function loadMetrics() {
  const metricsFile = getMetricsFilePath();
  try {
    if (fs.existsSync(metricsFile)) {
      const data = fs.readFileSync(metricsFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading metrics file:', error);
  }
  return { visits: 0, players: 0, updatedAt: new Date().toISOString() };
}

function saveMetrics(metrics) {
  const metricsFile = getMetricsFilePath();
  const payload = {
    visits: Math.max(0, Number(metrics.visits) || 0),
    players: Math.max(0, Number(metrics.players) || 0),
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(metricsFile, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('Error saving metrics file:', error);
    throw error;
  }
  return payload;
}

function incrementMetric(key) {
  const metrics = loadMetrics();
  metrics[key] = (metrics[key] || 0) + 1;
  return saveMetrics(metrics);
}

/**
 * Get leaderboard file path for a specific game
 */
function getLeaderboardFile(gameId) {
  // Sanitize gameId to prevent path traversal, fallback to default if empty
  const sanitizedGameId = (gameId || DEFAULT_GAME_ID).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_GAME_ID;
  return path.join(DATA_DIR, `leaderboard-${sanitizedGameId}.json`);
}

/**
 * Load leaderboard data for a specific game
 */
function getLeaderboard(gameId = DEFAULT_GAME_ID) {
  const leaderboardFile = getLeaderboardFile(gameId);
  try {
    if (fs.existsSync(leaderboardFile)) {
      const data = fs.readFileSync(leaderboardFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading leaderboard for ${gameId}:`, error);
  }
  
  // If no game-specific leaderboard exists, check for legacy leaderboard
  // (for backwards compatibility with existing data)
  if (gameId === DEFAULT_GAME_ID) {
    const legacyFile = path.join(DATA_DIR, 'leaderboard.json');
    try {
      if (fs.existsSync(legacyFile)) {
        const data = fs.readFileSync(legacyFile, 'utf-8');
        const legacyData = JSON.parse(data);
        // Migrate to new format - add gameId to each entry
        legacyData.entries.forEach(entry => {
          entry.gameId = DEFAULT_GAME_ID;
        });
        // Save to new location
        saveLeaderboard(legacyData, gameId);
        console.log(`[Leaderboard] Migrated legacy leaderboard to ${gameId}-specific file`);
        return legacyData;
      }
    } catch (error) {
      console.error('Error reading legacy leaderboard:', error);
    }
  }
  
  return { entries: [] };
}

/**
 * Save leaderboard data for a specific game
 */
function saveLeaderboard(data, gameId = DEFAULT_GAME_ID) {
  const leaderboardFile = getLeaderboardFile(gameId);
  try {
    fs.writeFileSync(leaderboardFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving leaderboard for ${gameId}:`, error);
    throw error;
  }
}

// GET /api/leaderboard - Get leaderboard entries for a specific game
app.get('/api/leaderboard', (req, res) => {
  const gameId = req.query.gameId || DEFAULT_GAME_ID;
  const limit = parseInt(req.query.limit) || 10;
  const data = getLeaderboard(gameId);
  
  // Sort by score descending
  const sortedEntries = [...data.entries].sort((a, b) => b.score - a.score);
  
  // Limit entries
  const limitedEntries = sortedEntries.slice(0, limit);
  
  // Mark champion
  limitedEntries.forEach((entry, index) => {
    entry.isChampion = index === 0;
  });
  
  const champion = limitedEntries.length > 0 ? limitedEntries[0] : null;
  
  res.json({
    entries: limitedEntries,
    champion,
    gameId,
  });
});

// POST /api/leaderboard - Submit a new score for a specific game
app.post('/api/leaderboard', (req, res) => {
  const { name, pipes, params, architecture, score, gameId: bodyGameId } = req.body;
  const gameId = bodyGameId || DEFAULT_GAME_ID;
  const parsedScore = Number(score);
  
  const hasValidName = typeof name === 'string' && name.trim().length > 0;
  const hasValidPipes = typeof pipes === 'number' && Number.isFinite(pipes);
  const hasValidParams = typeof params === 'number' && Number.isFinite(params);
  const hasValidScore = Number.isFinite(parsedScore);

  if (!hasValidName || !hasValidScore || !hasValidPipes || !hasValidParams) {
    return res.status(400).json({ error: 'Missing or invalid fields: name, score, pipes, params' });
  }
  
  const data = getLeaderboard(gameId);
  
  // Create new entry
  const newEntry = {
    id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim().substring(0, 20), // Limit name length
    score: parsedScore, // Pre-calculated adjusted score from client
    pipes,
    params,
    architecture: architecture || 'unknown',
    createdAt: new Date().toISOString(),
    gameId,
  };
  
  // Check if this is a new champion
  const sortedEntries = [...data.entries].sort((a, b) => b.score - a.score);
  const currentChampion = sortedEntries[0];
  const isNewChampion = !currentChampion || parsedScore > currentChampion.score;
  
  // Add new entry
  data.entries.push(newEntry);
  
  // Save
  saveLeaderboard(data, gameId);
  
  console.log(`[Leaderboard:${gameId}] New entry: ${newEntry.name} - ${newEntry.score} pts (${pipes} pipes)`);
  
  res.json({
    success: true,
    entry: newEntry,
    isNewChampion,
  });
});

// GET /api/leaderboard/lowest - Get the lowest score threshold for a specific game
app.get('/api/leaderboard/lowest', (req, res) => {
  const gameId = req.query.gameId || DEFAULT_GAME_ID;
  const data = getLeaderboard(gameId);
  const sortedEntries = [...data.entries].sort((a, b) => b.score - a.score);
  
  // If less than 10 entries, threshold is 0 (anyone can join)
  if (sortedEntries.length < 10) {
    return res.json({ lowestScore: 0, gameId });
  }
  
  // Otherwise return the 10th entry's score
  res.json({ lowestScore: sortedEntries[9]?.score || 0, gameId });
});

// GET /api/games - Get list of available games (for future use)
app.get('/api/games', (req, res) => {
  res.json({
    games: VALID_GAME_IDS.map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
    })),
  });
});

// GET /api/metrics - Get aggregate visit/player counts (no identifiers)
app.get('/api/metrics', (req, res) => {
  const metrics = loadMetrics();
  res.json(metrics);
});

// POST /api/metrics/visit - Increment visit counter (no cookies or IDs)
app.post('/api/metrics/visit', (req, res) => {
  try {
    const metrics = incrementMetric('visits');
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record visit' });
  }
});

// POST /api/metrics/player - Increment player counter (no cookies or IDs)
app.post('/api/metrics/player', (req, res) => {
  try {
    const metrics = incrementMetric('players');
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to record player' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Start the HTTP server.
 * Exposed for testing so we can spin up an isolated instance.
 */
function startServer(port = PORT, dataDir = DATA_DIR) {
  DATA_DIR = dataDir;
  ensureDataDir();
  const server = app.listen(port, () => {
    console.log(`🏆 Leaderboard API running on port ${server.address().port}`);
    console.log(`   Data stored in: ${DATA_DIR}`);
  });
  return server;
}

// Only start automatically when running directly, not when imported (e.g., tests)
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
