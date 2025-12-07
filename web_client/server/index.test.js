import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer } from './index.js'

let server
let baseUrl
let dataDir

/**
 * Simple helper around fetch
 */
async function request(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  return { status: response.status, data }
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leaderboard-test-'))
  server = startServer(0, dataDir)

  // Wait for the server to actually start
  await new Promise((resolve) => server.on('listening', resolve))
  const { port } = server.address()
  baseUrl = `http://127.0.0.1:${port}/api`
})

afterAll(async () => {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('Leaderboard API', () => {
  it('responds to health check', async () => {
    const res = await request('GET', '/health')
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('ok')
  })

  it('returns an empty leaderboard for a new game', async () => {
    const res = await request('GET', '/leaderboard?gameId=flappy&limit=5')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data.entries)).toBe(true)
    expect(res.data.entries.length).toBe(0)
    expect(res.data.champion ?? null).toBe(null)
  })

  it('accepts a score submission and marks champion', async () => {
    const submission = {
      name: 'TestBot',
      pipes: 10,
      params: 8706,
      architecture: '6→64→64→2',
      score: 10,
      gameId: 'flappy',
    }

    const res = await request('POST', '/leaderboard', submission)
    expect(res.status).toBe(200)
    expect(res.data.success).toBe(true)
    expect(res.data.entry.name).toBe('TestBot')
    expect(res.data.entry.gameId).toBe('flappy')
    expect(res.data.isNewChampion).toBe(true)
  })

  it('lists submitted scores with champion flag', async () => {
    const res = await request('GET', '/leaderboard?gameId=flappy&limit=10')
    expect(res.status).toBe(200)
    const testBotEntry = res.data.entries.find((e) => e.name === 'TestBot')
    expect(testBotEntry).toBeDefined()
    expect(res.data.champion.name).toBe('TestBot')
    expect(res.data.champion.isChampion).toBe(true)
  })

  it('detects a new champion when a higher score is submitted', async () => {
    const betterSubmission = {
      name: 'ChampionBot',
      pipes: 50,
      params: 8706,
      architecture: '6→64→64→2',
      score: 50,
      gameId: 'flappy',
    }

    const res = await request('POST', '/leaderboard', betterSubmission)
    expect(res.status).toBe(200)
    expect(res.data.isNewChampion).toBe(true)
  })

  it('validates required fields', async () => {
    const res = await request('POST', '/leaderboard', { name: 'NoData' })
    expect(res.status).toBe(400)
  })

  it('enforces name length limit and per-game isolation', async () => {
    const longNameEntry = {
      name: 'ThisIsAVeryLongNameThatShouldBeTruncated',
      pipes: 5,
      params: 8706,
      architecture: '6→64→64→2',
      score: 5,
      gameId: 'flappy-alt',
    }

    const res = await request('POST', '/leaderboard', longNameEntry)
    expect(res.status).toBe(200)
    expect(res.data.entry.name.length).toBeLessThanOrEqual(20)
    expect(res.data.entry.gameId).toBe('flappy-alt')

    // flappy-alt leaderboard should be independent from flappy
    const altBoard = await request(
      'GET',
      '/leaderboard?gameId=flappy-alt&limit=5'
    )
    expect(altBoard.data.entries[0].name).toContain('ThisIsAVeryLongName')

    const defaultBoard = await request('GET', '/leaderboard?gameId=flappy')
    const inDefault = defaultBoard.data.entries.find(
      (e) => e.name === longNameEntry.name
    )
    expect(inDefault).toBeUndefined()
  })

  it('returns lowest score threshold (0 when fewer than 10 entries)', async () => {
    const res = await request('GET', '/leaderboard/lowest?gameId=flappy')
    expect(res.status).toBe(200)
    expect(res.data.lowestScore).toBe(0)
  })
})