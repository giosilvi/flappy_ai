/**
 * API Client for leaderboard - uses server API for shared leaderboard
 */

// Reference network size for efficiency calculation (6→64→64→2)
export const REFERENCE_PARAMS = 8706

// API base URL - use relative path in production (Caddy proxies /api to backend)
const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Default game ID for backwards compatibility
const DEFAULT_GAME_ID = 'flappy'

export interface LeaderboardEntry {
  id: string
  name: string
  score: number           // Efficiency-adjusted score
  pipes: number           // Raw pipes passed
  params: number          // Total network parameters
  architecture: string    // e.g. "6→64→64→2"
  createdAt: string
  isChampion?: boolean
  isYou?: boolean
  gameId?: string         // Game identifier
}

/**
 * Calculate efficiency-adjusted score
 * Smaller networks get bonus points: score = pipes * sqrt(reference / actual_params)
 */
export function calculateAdjustedScore(pipes: number, params: number): number {
  if (params <= 0) return pipes
  const efficiency = Math.sqrt(REFERENCE_PARAMS / params)
  return Math.round(pipes * efficiency * 10) / 10  // Round to 1 decimal
}

/**
 * Get efficiency multiplier for display
 */
export function getEfficiencyMultiplier(params: number): number {
  if (params <= 0) return 1
  return Math.sqrt(REFERENCE_PARAMS / params)
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  champion?: LeaderboardEntry
}

export interface SubmitScoreRequest {
  name: string
  pipes: number           // Raw pipes passed
  params: number          // Network parameters
  architecture: string
  gameId?: string         // Optional game identifier
}

export interface SubmitScoreResponse {
  success: boolean
  entry: LeaderboardEntry
  isNewChampion: boolean
}

export interface TrafficMetrics {
  visits: number
  players: number
  updatedAt?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl
  }

  /**
   * Get leaderboard entries from server
   * @param gameId - Game identifier (defaults to 'flappy')
   * @param limit - Maximum number of entries to return
   */
  async getLeaderboard(gameId: string = DEFAULT_GAME_ID, limit: number = 10): Promise<LeaderboardResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/leaderboard?gameId=${encodeURIComponent(gameId)}&limit=${limit}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.warn('Failed to fetch leaderboard from server:', error)
      // Return empty leaderboard on error
      return { entries: [], champion: undefined }
    }
  }

  /**
   * Submit a new score to the leaderboard (saves to server)
   * @param request - Score submission request
   * @param gameId - Game identifier (defaults to 'flappy')
   */
  async submitScore(request: SubmitScoreRequest, gameId: string = DEFAULT_GAME_ID): Promise<SubmitScoreResponse> {
    // Calculate efficiency-adjusted score
    const adjustedScore = calculateAdjustedScore(request.pipes, request.params)

    try {
      const response = await fetch(`${this.baseUrl}/leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: request.name,
          pipes: request.pipes,
          params: request.params,
          architecture: request.architecture,
          score: adjustedScore,
          gameId: request.gameId || gameId,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      // Mark the entry as "you" on the client side
      if (result.entry) {
        result.entry.isYou = true
      }
      return result
    } catch (error) {
      console.error('Failed to submit score:', error)
      // Return a failed response
      return {
        success: false,
        entry: {
          id: '',
          name: request.name,
          score: adjustedScore,
          pipes: request.pipes,
          params: request.params,
          architecture: request.architecture,
          createdAt: new Date().toISOString(),
          gameId,
        },
        isNewChampion: false,
      }
    }
  }

  /**
   * Get the lowest score on the leaderboard (or 0 if empty/less than 10 entries)
   * @param gameId - Game identifier (defaults to 'flappy')
   */
  async getLowestScore(gameId: string = DEFAULT_GAME_ID): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/leaderboard/lowest?gameId=${encodeURIComponent(gameId)}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data.lowestScore || 0
    } catch (error) {
      console.warn('Failed to get lowest score:', error)
      return 0  // Allow submission on error
    }
  }

  async getMetrics(): Promise<TrafficMetrics> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.warn('Failed to get metrics:', error)
      return { visits: 0, players: 0 }
    }
  }

  async incrementVisit(): Promise<TrafficMetrics> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics/visit`, { method: 'POST' })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.warn('Failed to record visit:', error)
      return { visits: 0, players: 0 }
    }
  }

  async incrementPlayer(): Promise<TrafficMetrics> {
    try {
      const response = await fetch(`${this.baseUrl}/metrics/player`, { method: 'POST' })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.warn('Failed to record player:', error)
      return { visits: 0, players: 0 }
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient()

// Export class for custom instantiation
export { ApiClient }
