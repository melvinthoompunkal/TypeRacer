import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { authRouter, getAuthenticatedUser, initializeAuthDatabase } from './auth.js'
import { config } from './config.js'
import {
  initializeProgressionDatabase,
  profileRouter,
} from './progression.js'
import { registerRaceHandlers } from './raceManager.js'
import {
  getPackSummaries,
  getPracticeText,
  isPackId,
} from './sentences.js'

const app = express()
const httpServer = createServer(app)

// Socket.IO is initialized now so steps 3–5 can add race rooms without changing deployment.
const io = new Server(httpServer, {
  cors: {
    origin: config.clientOrigins,
    credentials: true,
  },
})

io.use(async (socket, next) => {
  try {
    const user = await getAuthenticatedUser(socket.handshake.headers.cookie)
    if (!user) {
      next(new Error('Authentication required.'))
      return
    }
    socket.data.user = {
      ...user,
      carId: user.equippedCar,
      trailId: user.equippedTrail,
    }
    next()
  } catch {
    next(new Error('Could not verify your login.'))
  }
})

registerRaceHandlers(io)

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/profile', profileRouter)

app.get('/health', (_request, response) => {
  response.type('text/plain').send('ok')
})

app.get('/api/packs', (_request, response) => {
  response.json({ packs: getPackSummaries() })
})

app.get('/api/practice/:packId', (request, response) => {
  const { packId } = request.params

  if (!isPackId(packId)) {
    response.status(404).json({ error: 'Unknown sentence pack.' })
    return
  }

  const requestedWords = Number(request.query.words ?? 25)
  if (!Number.isInteger(requestedWords) || requestedWords < 10 || requestedWords > 500) {
    response.status(400).json({ error: 'Word count must be between 10 and 500.' })
    return
  }

  response.set('Cache-Control', 'no-store').json({
    packId,
    sentence: getPracticeText(packId, requestedWords),
  })
})

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const clientDirectory = path.resolve(currentDirectory, '../../client/dist')

if (existsSync(path.join(clientDirectory, 'index.html'))) {
  app.use(express.static(clientDirectory))
  app.get('*', (_request, response) => {
    response.sendFile(path.join(clientDirectory, 'index.html'))
  })
}

app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    next(error)
    return
  }
  console.error('TypeRacer request failed:', error)
  response.status(500).json({ error: 'Something went wrong on the server.' })
})

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      'Cannot start TypeRacer: port ' + config.port + ' is already in use.\n'
      + 'Stop the existing server, or set PORT to another value before running npm run dev.',
    )
  } else {
    console.error('TypeRacer server failed to start:', error)
  }

  process.exit(1)
})

initializeAuthDatabase()
  .then(() => initializeProgressionDatabase())
  .then(() => {
    httpServer.listen(config.port, config.host, () => {
      console.log(`TypeRacer server listening on ${config.host}:${config.port}`)
    })
  })
  .catch((error) => {
    console.error('Could not initialize the authentication database:', error)
    process.exit(1)
  })
