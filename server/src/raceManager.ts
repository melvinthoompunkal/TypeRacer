import type { Server, Socket } from 'socket.io'
import { getRandomRaceSentence } from './sentences.js'

const MAX_PLAYERS = 4
const COUNTDOWN_MS = 3_000
const ROOM_CLEANUP_MS = 60_000

type RoomStatus = 'waiting' | 'countdown' | 'racing' | 'finished'

type RacePlayer = {
  id: string
  name: string
  typedText: string
  correctCharacters: number
  correctKeystrokes: number
  totalKeystrokes: number
  finishedAt: number | null
  placement: number | null
  connected: boolean
  disconnectedAt: number | null
}

type RaceRoom = {
  id: string
  status: RoomStatus
  players: Map<string, RacePlayer>
  sentence: string
  packId: string
  packLabel: string
  startsAt: number | null
  waitingEndsAt: number
  finishOrder: string[]
  waitingTimer: NodeJS.Timeout | null
  startTimer: NodeJS.Timeout | null
  stateTimer: NodeJS.Timeout | null
  cleanupTimer: NodeJS.Timeout | null
}

type JoinPayload = {
  name?: unknown
}

type TypedPayload = {
  text?: unknown
}

type JoinResult =
  | { ok: true; playerId: string }
  | { ok: false; error: string }

function calculateWpm(correctCharacters: number, elapsedMs: number) {
  if (correctCharacters === 0 || elapsedMs <= 0) return 0
  return Math.round(correctCharacters / 5 / (elapsedMs / 60_000))
}

function calculateAccuracy(correctKeystrokes: number, totalKeystrokes: number) {
  if (totalKeystrokes === 0) return 100
  return Math.round((correctKeystrokes / totalKeystrokes) * 100)
}

function countCorrectPrefix(text: string, sentence: string) {
  let count = 0
  while (count < text.length && text[count] === sentence[count]) count += 1
  return count
}

function countSharedPrefix(left: string, right: string) {
  let count = 0
  while (count < left.length && count < right.length && left[count] === right[count]) {
    count += 1
  }
  return count
}

function sanitizeName(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, 18)
}

export function registerRaceHandlers(io: Server) {
  const rooms = new Map<string, RaceRoom>()
  const socketRooms = new Map<string, string>()
  let roomSequence = 0

  const getPlayerState = (room: RaceRoom, player: RacePlayer, now = Date.now()) => {
    const elapsedMs = room.startsAt === null
      ? 0
      : (player.finishedAt ?? now) - room.startsAt

    return {
      id: player.id,
      name: player.name,
      progress: room.sentence.length === 0
        ? 0
        : Math.round((player.correctCharacters / room.sentence.length) * 10_000) / 100,
      wpm: calculateWpm(player.correctCharacters, elapsedMs),
      accuracy: calculateAccuracy(player.correctKeystrokes, player.totalKeystrokes),
      finished: player.finishedAt !== null,
      placement: player.placement,
      connected: player.connected,
    }
  }

  const emitLobby = (room: RaceRoom) => {
    io.to(room.id).emit('lobby:update', {
      roomId: room.id,
      players: [...room.players.values()].map(({ id, name }) => ({ id, name })),
      maxPlayers: MAX_PLAYERS,
      startsAt: room.waitingEndsAt,
    })
  }

  const emitRaceState = (room: RaceRoom) => {
    io.to(room.id).emit('race:state', {
      racers: [...room.players.values()].map((player) => getPlayerState(room, player)),
    })
  }

  const emitCountdown = (room: RaceRoom) => {
    io.to(room.id).emit('race:countdown', {
      sentence: room.sentence,
      packId: room.packId,
      packLabel: room.packLabel,
      startsAt: room.startsAt,
      racers: [...room.players.values()].map((player) => getPlayerState(room, player)),
    })
  }

  const deleteRoom = (room: RaceRoom) => {
    if (room.waitingTimer) clearTimeout(room.waitingTimer)
    if (room.startTimer) clearTimeout(room.startTimer)
    if (room.stateTimer) clearInterval(room.stateTimer)
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    rooms.delete(room.id)
  }

  const finishRoom = (room: RaceRoom) => {
    if (room.status === 'finished') return
    room.status = 'finished'
    if (room.stateTimer) clearInterval(room.stateTimer)

    const orderedPlayers = [
      ...room.finishOrder
        .map((playerId) => room.players.get(playerId))
        .filter((player): player is RacePlayer => Boolean(player)),
      ...[...room.players.values()]
        .filter((player) => player.finishedAt === null)
        .sort((left, right) => (left.disconnectedAt ?? 0) - (right.disconnectedAt ?? 0)),
    ]

    orderedPlayers.forEach((player, index) => {
      player.placement = index + 1
    })

    io.to(room.id).emit('race:results', {
      results: orderedPlayers.map((player) => ({
        ...getPlayerState(room, player),
        placement: player.placement,
        isBot: false,
      })),
    })

    room.cleanupTimer = setTimeout(() => deleteRoom(room), ROOM_CLEANUP_MS)
  }

  const maybeFinishRoom = (room: RaceRoom) => {
    const connectedPlayers = [...room.players.values()].filter((player) => player.connected)
    if (connectedPlayers.length === 0) {
      deleteRoom(room)
      return
    }

    if (connectedPlayers.every((player) => player.finishedAt !== null)) {
      finishRoom(room)
    }
  }

  const beginRace = (room: RaceRoom) => {
    if (room.status !== 'countdown' || room.players.size === 0) return
    room.status = 'racing'
    io.to(room.id).emit('race:started', { startsAt: room.startsAt })
    emitRaceState(room)
    room.stateTimer = setInterval(() => emitRaceState(room), 500)
  }

  const startCountdown = (room: RaceRoom) => {
    if (room.status !== 'waiting' || room.players.size === 0) return
    if (room.waitingTimer) clearTimeout(room.waitingTimer)

    const raceSentence = getRandomRaceSentence()
    room.status = 'countdown'
    room.sentence = raceSentence.sentence
    room.packId = raceSentence.packId
    room.packLabel = raceSentence.packLabel
    room.startsAt = Date.now() + COUNTDOWN_MS

    emitCountdown(room)
    room.startTimer = setTimeout(() => beginRace(room), COUNTDOWN_MS)
  }

  const createRoom = () => {
    roomSequence += 1
    const waitMs = 3_000 + Math.floor(Math.random() * 2_001)
    const room: RaceRoom = {
      id: `quick-${roomSequence}`,
      status: 'waiting',
      players: new Map(),
      sentence: '',
      packId: '',
      packLabel: '',
      startsAt: null,
      waitingEndsAt: Date.now() + waitMs,
      finishOrder: [],
      waitingTimer: null,
      startTimer: null,
      stateTimer: null,
      cleanupTimer: null,
    }

    rooms.set(room.id, room)
    room.waitingTimer = setTimeout(() => startCountdown(room), waitMs)
    return room
  }

  const leaveRoom = (socket: Socket) => {
    const roomId = socketRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    socketRooms.delete(socket.id)
    socket.leave(roomId)
    if (!room) return

    const player = room.players.get(socket.id)
    if (!player) return

    if (room.status === 'racing') {
      player.connected = false
      player.disconnectedAt = Date.now()
      emitRaceState(room)
      maybeFinishRoom(room)
      return
    }

    room.players.delete(socket.id)
    if (room.players.size === 0) {
      deleteRoom(room)
    } else if (room.status === 'waiting') {
      emitLobby(room)
    } else if (room.status === 'countdown') {
      emitCountdown(room)
    }
  }

  io.on('connection', (socket) => {
    socket.on(
      'quick:join',
      (payload: JoinPayload, acknowledge?: (result: JoinResult) => void) => {
        const requestedName = sanitizeName(payload?.name)
        if (!requestedName) {
          acknowledge?.({ ok: false, error: 'Enter a racer name first.' })
          return
        }

        leaveRoom(socket)

        const room = [...rooms.values()].find(
          (candidate) => candidate.status === 'waiting' && candidate.players.size < MAX_PLAYERS,
        ) ?? createRoom()

        const existingNames = new Set(
          [...room.players.values()].map((player) => player.name.toLowerCase()),
        )
        let name = requestedName
        let suffix = 2
        while (existingNames.has(name.toLowerCase())) {
          name = `${requestedName.slice(0, 15)} ${suffix}`
          suffix += 1
        }

        room.players.set(socket.id, {
          id: socket.id,
          name,
          typedText: '',
          correctCharacters: 0,
          correctKeystrokes: 0,
          totalKeystrokes: 0,
          finishedAt: null,
          placement: null,
          connected: true,
          disconnectedAt: null,
        })
        socketRooms.set(socket.id, room.id)
        socket.join(room.id)

        acknowledge?.({ ok: true, playerId: socket.id })
        emitLobby(room)

        if (room.players.size === MAX_PLAYERS) {
          startCountdown(room)
        }
      },
    )

    socket.on('race:typed', (payload: TypedPayload) => {
      const roomId = socketRooms.get(socket.id)
      const room = roomId ? rooms.get(roomId) : undefined
      const player = room?.players.get(socket.id)

      if (
        !room
        || !player
        || room.status !== 'racing'
        || room.startsAt === null
        || Date.now() < room.startsAt
        || player.finishedAt !== null
        || typeof payload?.text !== 'string'
      ) {
        return
      }

      const nextText = payload.text.slice(0, room.sentence.length + 1)
      const sharedPrefixLength = countSharedPrefix(player.typedText, nextText)

      for (let index = sharedPrefixLength; index < nextText.length; index += 1) {
        player.totalKeystrokes += 1
        if (nextText[index] === room.sentence[index]) {
          player.correctKeystrokes += 1
        }
      }

      player.typedText = nextText
      player.correctCharacters = countCorrectPrefix(nextText, room.sentence)

      if (nextText === room.sentence) {
        player.finishedAt = Date.now()
        room.finishOrder.push(player.id)
        player.placement = room.finishOrder.length
      }

      emitRaceState(room)
      if (player.finishedAt !== null) maybeFinishRoom(room)
    })

    socket.on('room:leave', () => leaveRoom(socket))
    socket.on('disconnect', () => leaveRoom(socket))
  })
}
