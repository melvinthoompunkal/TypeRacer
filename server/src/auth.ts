import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import pg, { type PoolClient } from 'pg'
import { config } from './config.js'

const SESSION_COOKIE = 'type-racer-session'
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000
const PASSWORD_KEY_LENGTH = 64
const AUTH_WINDOW_MS = 15 * 60 * 1_000
const AUTH_ATTEMPT_LIMIT = 10

export type AuthUser = {
  id: string
  username: string
  isGuest: boolean
}

type UserRow = AuthUser & {
  password_hash: string | null
}

type AttemptWindow = {
  count: number
  resetsAt: number
}

const authAttempts = new Map<string, AttemptWindow>()
const pool = config.databaseUrl
  ? new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    })
  : null

function scryptPassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derivedKey = await scryptPassword(password, salt)
  return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltText, hashText] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false

  try {
    const expected = Buffer.from(hashText, 'base64')
    const actual = await scryptPassword(password, Buffer.from(saltText, 'base64'))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key !== name) continue
    try {
      return decodeURIComponent(valueParts.join('='))
    } catch {
      return null
    }
  }

  return null
}

function sessionCookie(token: string, maxAgeSeconds: number) {
  const secure = config.isProduction ? '; Secure' : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeRacerName(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 18) : ''
}

function validateRacerName(name: string) {
  if (!/^[\p{L}\p{N}_ -]{1,18}$/u.test(name)) {
    return 'Racer name must be 1-18 characters using letters, numbers, spaces, underscores, or hyphens.'
  }
  return null
}

function validateUsername(username: string) {
  if (!/^[a-z0-9_]{3,18}$/.test(username)) {
    return 'Username must be 3-18 characters using letters, numbers, or underscores.'
  }
  if (username.startsWith('guest_')) {
    return 'Usernames beginning with guest_ are reserved for guest sessions.'
  }
  return null
}

function validateCredentials(username: string, password: unknown) {
  const usernameError = validateUsername(username)
  if (usernameError) return usernameError
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be between 8 and 128 characters.'
  }
  return null
}

function authAttemptKey(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

function consumeAuthAttempt(request: Request, response: Response) {
  const key = authAttemptKey(request)
  const now = Date.now()
  const current = authAttempts.get(key)
  const window = !current || current.resetsAt <= now
    ? { count: 0, resetsAt: now + AUTH_WINDOW_MS }
    : current

  window.count += 1
  authAttempts.set(key, window)
  if (window.count <= AUTH_ATTEMPT_LIMIT) return true

  response.set('Retry-After', String(Math.ceil((window.resetsAt - now) / 1_000)))
  response.status(429).json({ error: 'Too many login attempts. Try again in a few minutes.' })
  return false
}

function clearAuthAttempts(request: Request) {
  authAttempts.delete(authAttemptKey(request))
}

function requireDatabase(response: Response) {
  if (pool) return pool
  response.status(503).json({
    error: 'Login is not configured yet. Add DATABASE_URL to the server environment.',
  })
  return null
}

async function createSession(client: PoolClient, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS)
  await client.query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashSessionToken(token), userId, expiresAt],
  )
  return token
}

function sendUser(response: Response, user: AuthUser, token: string) {
  response
    .set('Cache-Control', 'no-store')
    .setHeader('Set-Cookie', sessionCookie(token, SESSION_LIFETIME_MS / 1_000))
    .status(200)
    .json({ user })
}

export async function initializeAuthDatabase() {
  if (!pool) {
    console.warn('DATABASE_URL is not set; account login is unavailable.')
    return
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username VARCHAR(18) NOT NULL UNIQUE,
      display_name VARCHAR(18),
      password_hash TEXT,
      is_guest BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(18);
    UPDATE users SET display_name = username WHERE display_name IS NULL;
    ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);
  `)

  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()')
  await pool.query(`
    DELETE FROM users
    WHERE is_guest = TRUE
      AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE auth_sessions.user_id = users.id)
  `)
  console.log('Authentication database ready.')
}

export async function getAuthenticatedUser(cookieHeader: string | undefined): Promise<AuthUser | null> {
  if (!pool) return null
  const token = readCookie(cookieHeader, SESSION_COOKIE)
  if (!token) return null

  const result = await pool.query<AuthUser>(
    `SELECT users.id, users.display_name AS username, users.is_guest AS "isGuest"
     FROM auth_sessions
     JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > NOW()`,
    [hashSessionToken(token)],
  )
  return result.rows[0] ?? null
}

export const authRouter = Router()

authRouter.get('/me', async (request, response, next) => {
  try {
    if (!requireDatabase(response)) return
    const user = await getAuthenticatedUser(request.headers.cookie)
    if (!user) {
      response.status(401).json({ error: 'Not signed in.' })
      return
    }
    response.set('Cache-Control', 'no-store').json({ user })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/register', async (request, response, next) => {
  const database = requireDatabase(response)
  if (!database || !consumeAuthAttempt(request, response)) return

  const username = normalizeUsername(request.body?.username)
  const password = request.body?.password
  const validationError = validateCredentials(username, password)
  if (validationError) {
    response.status(400).json({ error: validationError })
    return
  }

  let client: PoolClient | null = null
  try {
    client = await database.connect()
    const passwordHash = await hashPassword(password)
    const user: AuthUser = { id: randomUUID(), username, isGuest: false }
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (id, username, display_name, password_hash)
       VALUES ($1, $2, $2, $3)`,
      [user.id, user.username, passwordHash],
    )
    const token = await createSession(client, user.id)
    await client.query('COMMIT')
    clearAuthAttempts(request)
    sendUser(response, user, token)
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The original database error is more useful than a failed rollback.
      }
    }
    if ((error as { code?: string }).code === '23505') {
      response.status(409).json({ error: 'That username is already taken.' })
      return
    }
    next(error)
  } finally {
    client?.release()
  }
})

authRouter.post('/login', async (request, response, next) => {
  const database = requireDatabase(response)
  if (!database || !consumeAuthAttempt(request, response)) return

  const username = normalizeUsername(request.body?.username)
  const password = request.body?.password
  if (typeof password !== 'string' || password.length > 128) {
    response.status(401).json({ error: 'Invalid username or password.' })
    return
  }

  try {
    const result = await database.query<UserRow>(
      `SELECT id, display_name AS username, password_hash, is_guest AS "isGuest"
       FROM users WHERE username = $1 AND is_guest = FALSE`,
      [username],
    )
    const row = result.rows[0]
    let valid = false
    if (row?.password_hash) valid = await verifyPassword(password, row.password_hash)
    else await scryptPassword(password, randomBytes(16))

    if (!row || !valid) {
      response.status(401).json({ error: 'Invalid username or password.' })
      return
    }

    const client = await database.connect()
    try {
      const token = await createSession(client, row.id)
      clearAuthAttempts(request)
      sendUser(
        response,
        { id: row.id, username: row.username, isGuest: row.isGuest },
        token,
      )
    } finally {
      client.release()
    }
  } catch (error) {
    next(error)
  }
})

authRouter.post('/guest', async (request, response, next) => {
  const database = requireDatabase(response)
  if (!database || !consumeAuthAttempt(request, response)) return

  const displayName = normalizeRacerName(request.body?.name)
  const nameError = validateRacerName(displayName)
  if (nameError) {
    response.status(400).json({ error: nameError })
    return
  }

  let client: PoolClient | null = null
  try {
    client = await database.connect()
    const user: AuthUser = {
      id: randomUUID(),
      username: displayName,
      isGuest: true,
    }
    const internalUsername = `guest_${randomBytes(4).toString('hex')}`

    await client.query('BEGIN')
    await client.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()')
    await client.query(`
      DELETE FROM users
      WHERE is_guest = TRUE
        AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE auth_sessions.user_id = users.id)
    `)
    const registeredName = await client.query(
      'SELECT 1 FROM users WHERE LOWER(display_name) = LOWER($1) AND is_guest = FALSE',
      [displayName],
    )
    if (registeredName.rowCount) {
      await client.query('ROLLBACK')
      response.status(409).json({ error: 'That racer name belongs to an account. Try another.' })
      return
    }
    await client.query(
      `INSERT INTO users (id, username, display_name, password_hash, is_guest)
       VALUES ($1, $2, $3, NULL, TRUE)`,
      [user.id, internalUsername, displayName],
    )
    const token = await createSession(client, user.id)
    await client.query('COMMIT')
    sendUser(response, user, token)
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // The original database error is more useful than a failed rollback.
      }
    }
    next(error)
  } finally {
    client?.release()
  }
})

authRouter.post('/logout', async (request, response, next) => {
  const database = requireDatabase(response)
  if (!database) return

  try {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE)
    if (token) {
      const tokenHash = hashSessionToken(token)
      await database.query(
        `DELETE FROM users
         WHERE is_guest = TRUE
           AND id IN (SELECT user_id FROM auth_sessions WHERE token_hash = $1)`,
        [tokenHash],
      )
      await database.query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash])
    }
    response
      .setHeader('Set-Cookie', sessionCookie('', 0))
      .status(204)
      .end()
  } catch (error) {
    next(error)
  }
})
