import express from 'express'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from 'socket.io'
import { config } from './config.js'
import { registerRaceHandlers } from './raceManager.js'
import { getPackSummaries, getRandomSentence, isPackId } from './sentences.js'

const app = express()
const httpServer = createServer(app)

// Socket.IO is initialized now so steps 3–5 can add race rooms without changing deployment.
const io = new Server(httpServer, {
  cors: {
    origin: config.clientOrigins,
    credentials: true,
  },
})

registerRaceHandlers(io)

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json())

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

  response.set('Cache-Control', 'no-store').json({
    packId,
    sentence: getRandomSentence(
      packId,
      typeof request.query.exclude === 'string' ? request.query.exclude : undefined,
    ),
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

httpServer.listen(config.port, config.host, () => {
  console.log(`TypeRacer server listening on ${config.host}:${config.port}`)
})
