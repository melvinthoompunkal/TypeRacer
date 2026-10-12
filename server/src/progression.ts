import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import type { Pool, PoolClient } from 'pg'
import { getAuthenticatedUser, getDatabasePool } from './auth.js'
import { generatePracticeText } from './practiceText.js'

export const CAR_CATALOG = [
  {
    id: 'classic',
    name: 'Classic',
    price: 0,
    description: 'The original TypingRacer roadster.',
    color: '#a15f15',
    accent: '#f0c77a',
  },
  {
    id: 'blaze',
    name: 'Blaze',
    price: 250,
    description: 'Hot paint with a sharp racing stripe.',
    color: '#c74732',
    accent: '#ffd166',
  },
  {
    id: 'volt',
    name: 'Volt',
    price: 450,
    description: 'Electric lime built for late braking.',
    color: '#78a83b',
    accent: '#dfff72',
  },
  {
    id: 'phantom',
    name: 'Phantom',
    price: 700,
    description: 'A midnight body with a violet glow.',
    color: '#45356f',
    accent: '#bd9cff',
  },
] as const

export const TRAIL_CATALOG = [
  {
    id: 'none',
    name: 'No trail',
    price: 0,
    description: 'Keep the road clean and classic.',
    color: '#6e7075',
    accent: '#d8cfbf',
  },
  {
    id: 'ember',
    name: 'Ember',
    price: 180,
    description: 'A warm flame streak that fades behind your car.',
    color: '#e4572e',
    accent: '#ffc857',
  },
  {
    id: 'ion',
    name: 'Ion',
    price: 350,
    description: 'A bright electric wake with a cool neon glow.',
    color: '#36d7d9',
    accent: '#b8ffff',
  },
  {
    id: 'stardust',
    name: 'Stardust',
    price: 550,
    description: 'A violet stream of sparkling particles.',
    color: '#9b72ff',
    accent: '#f3dcff',
  },
] as const

type CarId = (typeof CAR_CATALOG)[number]['id']
type TrailId = (typeof TRAIL_CATALOG)[number]['id']

type ProfileRow = {
  elo: number
  credits: number
  racesPlayed: number
  wins: number
  podiums: number
  equippedCar: CarId
  equippedTrail: TrailId
  placementCompleted: boolean
  placementWpm: number | null
  placementAccuracy: number | null
}

type PlacementChallenge = {
  id: string
  sentence: string
  issuedAt: number
  startedAt: number | null
}

const PLACEMENT_WORD_COUNT = 50
const PLACEMENT_EXPIRY_MS = 15 * 60 * 1_000
const placementChallenges = new Map<string, PlacementChallenge>()

export type RaceRewardInput = {
  userId: string
  placement: number
  fieldSize: number
}

export type RaceReward = {
  eloDelta: number
  creditsEarned: number
  elo: number
  credits: number
}

export function calculatePlacementElo(wpm: number, accuracy: number) {
  const safeWpm = Math.min(200, Math.max(0, Number.isFinite(wpm) ? wpm : 0))
  const safeAccuracy = Math.min(100, Math.max(0, Number.isFinite(accuracy) ? accuracy : 0))
  const effectiveWpm = safeWpm * (safeAccuracy / 100) ** 2
  return Math.min(1_800, Math.max(600, Math.round(1_000 + (effectiveWpm - 42) * 15)))
}

export async function getPlayerSkillRating(userId: string) {
  const database = getDatabasePool()
  if (!database) return 1_000

  const result = await database.query<{ elo: number }>(
    'SELECT elo FROM user_profiles WHERE user_id = $1',
    [userId],
  )
  return result.rows[0]?.elo ?? 1_000
}

function findCar(value: unknown) {
  return typeof value === 'string'
    ? CAR_CATALOG.find((car) => car.id === value)
    : undefined
}

function findTrail(value: unknown) {
  return typeof value === 'string'
    ? TRAIL_CATALOG.find((trail) => trail.id === value)
    : undefined
}

async function ensureProfile(database: Pool | PoolClient, userId: string) {
  await database.query(
    `INSERT INTO user_profiles (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  )
}

async function loadProfile(database: Pool | PoolClient, userId: string) {
  await ensureProfile(database, userId)
  const profileResult = await database.query<ProfileRow>(
    `SELECT elo, credits, races_played AS "racesPlayed", wins, podiums,
            equipped_car AS "equippedCar", equipped_trail AS "equippedTrail",
            placement_completed AS "placementCompleted",
            placement_wpm AS "placementWpm",
            placement_accuracy AS "placementAccuracy"
     FROM user_profiles WHERE user_id = $1`,
    [userId],
  )
  const ownedResult = await database.query<{ carId: CarId }>(
    `SELECT car_id AS "carId" FROM user_cars
     WHERE user_id = $1 ORDER BY purchased_at`,
    [userId],
  )
  const ownedTrailsResult = await database.query<{ trailId: TrailId }>(
    `SELECT trail_id AS "trailId" FROM user_trails
     WHERE user_id = $1 ORDER BY purchased_at`,
    [userId],
  )

  return {
    ...profileResult.rows[0],
    ownedCars: ['classic', ...ownedResult.rows.map(({ carId }) => carId)] as CarId[],
    ownedTrails: [
      'none',
      ...ownedTrailsResult.rows.map(({ trailId }) => trailId),
    ] as TrailId[],
  }
}

async function getRegisteredUser(request: Request, response: Response) {
  const database = getDatabasePool()
  if (!database) {
    response.status(503).json({ error: 'The progression database is unavailable.' })
    return null
  }

  const user = await getAuthenticatedUser(request.headers.cookie)
  if (!user) {
    response.status(401).json({ error: 'Log in to view your profile.' })
    return null
  }
  if (user.isGuest) {
    response.status(403).json({ error: 'Create an account to earn ELO and unlock cars.' })
    return null
  }
  return { database, user }
}

function calculateEloDelta(placement: number, fieldSize: number) {
  if (fieldSize < 2) return 0
  const actualScore = 1 - ((placement - 1) / (fieldSize - 1))
  return Math.round(40 * (actualScore - 0.5))
}

function calculateCredits(placement: number) {
  return [60, 40, 25, 15][placement - 1] ?? 10
}

export async function initializeProgressionDatabase() {
  const database = getDatabasePool()
  if (!database) return

  await database.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      elo INTEGER NOT NULL DEFAULT 1000 CHECK (elo >= 0),
      credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
      races_played INTEGER NOT NULL DEFAULT 0 CHECK (races_played >= 0),
      wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
      podiums INTEGER NOT NULL DEFAULT 0 CHECK (podiums >= 0),
      equipped_car VARCHAR(32) NOT NULL DEFAULT 'classic',
      equipped_trail VARCHAR(32) NOT NULL DEFAULT 'none',
      placement_completed BOOLEAN NOT NULL DEFAULT FALSE,
      placement_wpm INTEGER CHECK (placement_wpm >= 0),
      placement_accuracy INTEGER CHECK (placement_accuracy BETWEEN 0 AND 100),
      placement_completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS equipped_trail VARCHAR(32) NOT NULL DEFAULT 'none';

    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS placement_completed BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS placement_wpm INTEGER CHECK (placement_wpm >= 0),
      ADD COLUMN IF NOT EXISTS placement_accuracy INTEGER CHECK (placement_accuracy BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS placement_completed_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS user_cars (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      car_id VARCHAR(32) NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, car_id)
    );

    CREATE TABLE IF NOT EXISTS user_trails (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trail_id VARCHAR(32) NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, trail_id)
    );

    INSERT INTO user_profiles (user_id)
    SELECT id FROM users WHERE is_guest = FALSE
    ON CONFLICT (user_id) DO NOTHING;
  `)
  console.log('Progression database ready.')
}

export async function applyRaceRewards(inputs: RaceRewardInput[]) {
  const rewards = new Map<string, RaceReward>()
  const database = getDatabasePool()
  if (!database) return rewards

  const uniqueInputs = [...inputs]
    .sort((left, right) => left.placement - right.placement)
    .filter((input, index, all) => (
      all.findIndex((candidate) => candidate.userId === input.userId) === index
    ))
  if (uniqueInputs.length === 0) return rewards

  const client = await database.connect()
  try {
    await client.query('BEGIN')
    for (const input of uniqueInputs) {
      await ensureProfile(client, input.userId)
      const currentResult = await client.query<{ elo: number; credits: number }>(
        'SELECT elo, credits FROM user_profiles WHERE user_id = $1 FOR UPDATE',
        [input.userId],
      )
      const current = currentResult.rows[0]
      const requestedDelta = calculateEloDelta(input.placement, input.fieldSize)
      const nextElo = Math.max(0, current.elo + requestedDelta)
      const eloDelta = nextElo - current.elo
      const creditsEarned = input.fieldSize >= 2 ? calculateCredits(input.placement) : 0
      const updatedResult = await client.query<{ elo: number; credits: number }>(
        `UPDATE user_profiles
         SET elo = $2,
             credits = credits + $3,
             races_played = races_played + 1,
             wins = wins + CASE WHEN $4 = 1 THEN 1 ELSE 0 END,
             podiums = podiums + CASE WHEN $4 <= 3 THEN 1 ELSE 0 END,
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING elo, credits`,
        [input.userId, nextElo, creditsEarned, input.placement],
      )
      rewards.set(input.userId, {
        eloDelta,
        creditsEarned,
        elo: updatedResult.rows[0].elo,
        credits: updatedResult.rows[0].credits,
      })
    }
    await client.query('COMMIT')
    return rewards
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const profileRouter = Router()

profileRouter.get('/', async (request, response, next) => {
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const profile = await loadProfile(authenticated.database, authenticated.user.id)
    response.set('Cache-Control', 'no-store').json({
      user: authenticated.user,
      profile,
      cars: CAR_CATALOG,
      trails: TRAIL_CATALOG,
    })
  } catch (error) {
    next(error)
  }
})

profileRouter.get('/placement-test', async (request, response, next) => {
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const profile = await loadProfile(authenticated.database, authenticated.user.id)
    if (profile.placementCompleted || profile.racesPlayed > 0) {
      response.status(409).json({ error: 'Placement is only available before your first race.' })
      return
    }

    const challenge: PlacementChallenge = {
      id: randomUUID(),
      sentence: generatePracticeText('famous-lines', PLACEMENT_WORD_COUNT),
      issuedAt: Date.now(),
      startedAt: null,
    }
    placementChallenges.set(authenticated.user.id, challenge)
    response.set('Cache-Control', 'no-store').json({
      challengeId: challenge.id,
      sentence: challenge.sentence,
      startingElo: 1_000,
    })
  } catch (error) {
    next(error)
  }
})

profileRouter.post('/placement-test/start', async (request, response, next) => {
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const challenge = placementChallenges.get(authenticated.user.id)
    if (
      !challenge
      || challenge.id !== request.body?.challengeId
      || Date.now() - challenge.issuedAt > PLACEMENT_EXPIRY_MS
    ) {
      placementChallenges.delete(authenticated.user.id)
      response.status(410).json({ error: 'That placement test expired. Start a new one.' })
      return
    }

    challenge.startedAt ??= Date.now()
    response.json({ started: true })
  } catch (error) {
    next(error)
  }
})

profileRouter.post('/placement-test/complete', async (request, response, next) => {
  let client: PoolClient | null = null
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const challenge = placementChallenges.get(authenticated.user.id)
    const now = Date.now()
    if (
      !challenge
      || challenge.id !== request.body?.challengeId
      || now - challenge.issuedAt > PLACEMENT_EXPIRY_MS
    ) {
      placementChallenges.delete(authenticated.user.id)
      response.status(410).json({ error: 'That placement test expired. Start a new one.' })
      return
    }
    if (challenge.startedAt === null || now - challenge.startedAt < 5_000) {
      response.status(400).json({ error: 'The placement test did not record a valid typing time.' })
      return
    }

    const totalKeystrokes = Number(request.body?.totalKeystrokes)
    const correctKeystrokes = Number(request.body?.correctKeystrokes)
    if (
      request.body?.text !== challenge.sentence
      || !Number.isInteger(totalKeystrokes)
      || !Number.isInteger(correctKeystrokes)
      || correctKeystrokes < challenge.sentence.length
      || totalKeystrokes < correctKeystrokes
      || totalKeystrokes > challenge.sentence.length * 20
    ) {
      response.status(400).json({ error: 'The placement result could not be verified.' })
      return
    }

    const elapsedMs = now - challenge.startedAt
    const wpm = Math.round((challenge.sentence.length / 5) / (elapsedMs / 60_000))
    const accuracy = Math.round((correctKeystrokes / totalKeystrokes) * 100)
    const elo = calculatePlacementElo(wpm, accuracy)

    client = await authenticated.database.connect()
    await client.query('BEGIN')
    await ensureProfile(client, authenticated.user.id)
    const profileResult = await client.query<{
      placementCompleted: boolean
      racesPlayed: number
    }>(
      `SELECT placement_completed AS "placementCompleted", races_played AS "racesPlayed"
       FROM user_profiles WHERE user_id = $1 FOR UPDATE`,
      [authenticated.user.id],
    )
    const profile = profileResult.rows[0]
    if (profile.placementCompleted || profile.racesPlayed > 0) {
      await client.query('ROLLBACK')
      response.status(409).json({ error: 'Placement is only available before your first race.' })
      return
    }

    await client.query(
      `UPDATE user_profiles
       SET elo = $2,
           placement_completed = TRUE,
           placement_wpm = $3,
           placement_accuracy = $4,
           placement_completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1`,
      [authenticated.user.id, elo, wpm, accuracy],
    )
    await client.query('COMMIT')
    placementChallenges.delete(authenticated.user.id)
    response.json({ elo, wpm, accuracy })
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK') } catch { /* Preserve the original error. */ }
    }
    next(error)
  } finally {
    client?.release()
  }
})

profileRouter.post('/purchase', async (request, response, next) => {
  let client: PoolClient | null = null
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const car = findCar(request.body?.carId)
    if (!car || car.id === 'classic') {
      response.status(400).json({ error: 'That car is not available for purchase.' })
      return
    }

    client = await authenticated.database.connect()
    await client.query('BEGIN')
    await ensureProfile(client, authenticated.user.id)
    const profileResult = await client.query<{ credits: number }>(
      'SELECT credits FROM user_profiles WHERE user_id = $1 FOR UPDATE',
      [authenticated.user.id],
    )
    const ownedResult = await client.query(
      'SELECT 1 FROM user_cars WHERE user_id = $1 AND car_id = $2',
      [authenticated.user.id, car.id],
    )
    if (ownedResult.rowCount) {
      await client.query('ROLLBACK')
      response.status(409).json({ error: 'You already own that car.' })
      return
    }
    if (profileResult.rows[0].credits < car.price) {
      await client.query('ROLLBACK')
      response.status(400).json({ error: `You need ${car.price} credits for that car.` })
      return
    }

    await client.query(
      'UPDATE user_profiles SET credits = credits - $2, updated_at = NOW() WHERE user_id = $1',
      [authenticated.user.id, car.price],
    )
    await client.query(
      'INSERT INTO user_cars (user_id, car_id) VALUES ($1, $2)',
      [authenticated.user.id, car.id],
    )
    const profile = await loadProfile(client, authenticated.user.id)
    await client.query('COMMIT')
    response.json({ profile })
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK') } catch { /* Preserve the original error. */ }
    }
    next(error)
  } finally {
    client?.release()
  }
})

profileRouter.post('/equip', async (request, response, next) => {
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const car = findCar(request.body?.carId)
    if (!car) {
      response.status(400).json({ error: 'That car does not exist.' })
      return
    }
    if (car.id !== 'classic') {
      const owned = await authenticated.database.query(
        'SELECT 1 FROM user_cars WHERE user_id = $1 AND car_id = $2',
        [authenticated.user.id, car.id],
      )
      if (!owned.rowCount) {
        response.status(403).json({ error: 'Purchase that car before equipping it.' })
        return
      }
    }

    await ensureProfile(authenticated.database, authenticated.user.id)
    await authenticated.database.query(
      'UPDATE user_profiles SET equipped_car = $2, updated_at = NOW() WHERE user_id = $1',
      [authenticated.user.id, car.id],
    )
    response.json({ profile: await loadProfile(authenticated.database, authenticated.user.id) })
  } catch (error) {
    next(error)
  }
})

profileRouter.post('/purchase-trail', async (request, response, next) => {
  let client: PoolClient | null = null
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const trail = findTrail(request.body?.trailId)
    if (!trail || trail.id === 'none') {
      response.status(400).json({ error: 'That trail is not available for purchase.' })
      return
    }

    client = await authenticated.database.connect()
    await client.query('BEGIN')
    await ensureProfile(client, authenticated.user.id)
    const profileResult = await client.query<{ credits: number }>(
      'SELECT credits FROM user_profiles WHERE user_id = $1 FOR UPDATE',
      [authenticated.user.id],
    )
    const ownedResult = await client.query(
      'SELECT 1 FROM user_trails WHERE user_id = $1 AND trail_id = $2',
      [authenticated.user.id, trail.id],
    )
    if (ownedResult.rowCount) {
      await client.query('ROLLBACK')
      response.status(409).json({ error: 'You already own that trail.' })
      return
    }
    if (profileResult.rows[0].credits < trail.price) {
      await client.query('ROLLBACK')
      response.status(400).json({ error: `You need ${trail.price} credits for that trail.` })
      return
    }

    await client.query(
      'UPDATE user_profiles SET credits = credits - $2, updated_at = NOW() WHERE user_id = $1',
      [authenticated.user.id, trail.price],
    )
    await client.query(
      'INSERT INTO user_trails (user_id, trail_id) VALUES ($1, $2)',
      [authenticated.user.id, trail.id],
    )
    const profile = await loadProfile(client, authenticated.user.id)
    await client.query('COMMIT')
    response.json({ profile })
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK') } catch { /* Preserve the original error. */ }
    }
    next(error)
  } finally {
    client?.release()
  }
})

profileRouter.post('/equip-trail', async (request, response, next) => {
  try {
    const authenticated = await getRegisteredUser(request, response)
    if (!authenticated) return
    const trail = findTrail(request.body?.trailId)
    if (!trail) {
      response.status(400).json({ error: 'That trail does not exist.' })
      return
    }
    if (trail.id !== 'none') {
      const owned = await authenticated.database.query(
        'SELECT 1 FROM user_trails WHERE user_id = $1 AND trail_id = $2',
        [authenticated.user.id, trail.id],
      )
      if (!owned.rowCount) {
        response.status(403).json({ error: 'Purchase that trail before equipping it.' })
        return
      }
    }

    await ensureProfile(authenticated.database, authenticated.user.id)
    await authenticated.database.query(
      'UPDATE user_profiles SET equipped_trail = $2, updated_at = NOW() WHERE user_id = $1',
      [authenticated.user.id, trail.id],
    )
    response.json({ profile: await loadProfile(authenticated.database, authenticated.user.id) })
  } catch (error) {
    next(error)
  }
})
