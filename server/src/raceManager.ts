import type { Server, Socket } from 'socket.io'
import {
  createBotProfile,
  getBotTargetWpms,
  startBotTyping,
} from './botSimulator.js'
import { applyRaceRewards } from './progression.js'
import { getRandomRaceSentence } from './sentences.js'

const MAX_PLAYERS = 4
const COUNTDOWN_MS = 3_000
const ROOM_CLEANUP_MS = 120_000
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MAX_WRONG_CHARACTERS = 5

type RoomStatus = 'waiting' | 'countdown' | 'racing' | 'finished'
type RoomMode = 'quick' | 'private'

type RacePlayer = {
  id: string
  name: string
  userId: string | null
  isGuest: boolean
  isBot: boolean
  skillRating: number
  carId: string
  trailId: string
  targetWpm: number | null
  typedText: string
  correctCharacters: number
  correctKeystrokes: number
  totalKeystrokes: number
  skippedCharacters: Set<number>
  finishedAt: number | null
  placement: number | null
  connected: boolean
  disconnectedAt: number | null
}

type RaceRoom = {
  id: string
  mode: RoomMode
  code: string | null
  hostId: string | null
  status: RoomStatus
  players: Map<string, RacePlayer>
  sentence: string
  packId: string
  packLabel: string
  startsAt: number | null
  waitingEndsAt: number | null
  rematchVotes: Set<string>
  waitingTimer: NodeJS.Timeout | null
  startTimer: NodeJS.Timeout | null
  stateTimer: NodeJS.Timeout | null
  cleanupTimer: NodeJS.Timeout | null
  botStops: Map<string, () => void>
}

type JoinPayload = {
  code?: unknown
}

type TypedPayload = {
  text?: unknown
}

type JoinResult =
  | { ok: true; playerId: string; roomCode: string | null }
  | { ok: false; error: string }

type ActionResult =
  | { ok: true }
  | { ok: false; error: string }

function calculateWpm(correctCharacters: number, elapsedMs: number) {
  if (correctCharacters === 0 || elapsedMs <= 0) return 0
  return Math.round(correctCharacters / 5 / (elapsedMs / 60_000))
}

function calculateAccuracy(correctKeystrokes: number, totalKeystrokes: number) {
  if (totalKeystrokes === 0) return 100
  return Math.round((correctKeystrokes / totalKeystrokes) * 100)
}

function calculateCompetitiveScore(wpm: number, accuracy: number) {
  const accuracyRatio = accuracy / 100
  return Math.round(wpm * accuracyRatio * accuracyRatio * 10) / 10
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

function getNextWordStart(target: string, currentIndex: number) {
  let nextIndex = currentIndex
  while (nextIndex < target.length && target[nextIndex] !== ' ') nextIndex += 1
  while (nextIndex < target.length && target[nextIndex] === ' ') nextIndex += 1
  return nextIndex
}

function sanitizeCode(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

function resetPlayer(player: RacePlayer) {
  player.typedText = ''
  player.correctCharacters = 0
  player.correctKeystrokes = 0
  player.totalKeystrokes = 0
  player.skippedCharacters.clear()
  player.finishedAt = null
  player.placement = null
  player.disconnectedAt = null
}

export function registerRaceHandlers(io: Server) {
  const rooms = new Map<string, RaceRoom>()
  const socketRooms = new Map<string, string>()
  let roomSequence = 0
  let botSequence = 0

  function humanPlayers(room: RaceRoom, connectedOnly = false) {
    return [...room.players.values()].filter(
      (player) => !player.isBot && (!connectedOnly || player.connected),
    )
  }

  function getPlayerState(room: RaceRoom, player: RacePlayer, now = Date.now()) {
    const elapsedMs = room.startsAt === null
      ? 0
      : Math.max(0, (player.finishedAt ?? now) - room.startsAt)

    const wpm = calculateWpm(
      Math.max(0, player.correctCharacters - player.skippedCharacters.size),
      elapsedMs,
    )
    const accuracy = calculateAccuracy(player.correctKeystrokes, player.totalKeystrokes)

    return {
      id: player.id,
      name: player.name,
      carId: player.carId,
      trailId: player.trailId,
      progress: room.sentence.length === 0
        ? 0
        : Math.round((player.correctCharacters / room.sentence.length) * 10_000) / 100,
      wpm,
      accuracy,
      score: calculateCompetitiveScore(wpm, accuracy),
      finished: player.finishedAt !== null,
      placement: player.placement,
      connected: player.connected,
    }
  }

  function clearRaceTimers(room: RaceRoom) {
    if (room.waitingTimer) clearTimeout(room.waitingTimer)
    if (room.startTimer) clearTimeout(room.startTimer)
    if (room.stateTimer) clearInterval(room.stateTimer)
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer)
    room.waitingTimer = null
    room.startTimer = null
    room.stateTimer = null
    room.cleanupTimer = null
  }

  function stopBots(room: RaceRoom) {
    room.botStops.forEach((stop) => stop())
    room.botStops.clear()
  }

  function deleteRoom(room: RaceRoom) {
    clearRaceTimers(room)
    stopBots(room)
    humanPlayers(room).forEach((player) => socketRooms.delete(player.id))
    rooms.delete(room.id)
  }

  function emitLobby(room: RaceRoom) {
    io.to(room.id).emit('lobby:update', {
      roomId: room.id,
      mode: room.mode,
      roomCode: room.code,
      hostId: room.hostId,
      players: [...room.players.values()].map(({ id, name }) => ({ id, name })),
      maxPlayers: MAX_PLAYERS,
      startsAt: room.waitingEndsAt,
    })
  }

  function emitRaceState(room: RaceRoom) {
    io.to(room.id).emit('race:state', {
      racers: [...room.players.values()].map((player) => getPlayerState(room, player)),
    })
  }

  function emitCountdown(room: RaceRoom) {
    io.to(room.id).emit('race:countdown', {
      sentence: room.sentence,
      packId: room.packId,
      packLabel: room.packLabel,
      startsAt: room.startsAt,
      racers: [...room.players.values()].map((player) => getPlayerState(room, player)),
    })
  }

  function emitRematch(room: RaceRoom) {
    io.to(room.id).emit('rematch:update', {
      votes: room.rematchVotes.size,
      required: humanPlayers(room, true).length,
    })
  }

  function assignHost(room: RaceRoom) {
    const currentHost = room.hostId ? room.players.get(room.hostId) : undefined
    if (currentHost?.connected && !currentHost.isBot) return
    room.hostId = humanPlayers(room, true)[0]?.id ?? null
  }

  function generateRoomCode() {
    let code = ''
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
      ).join('')
    } while (rooms.has(`private-${code}`))
    return code
  }

  function scheduleQuickStart(room: RaceRoom) {
    const waitMs = 3_000 + Math.floor(Math.random() * 2_001)
    room.waitingEndsAt = Date.now() + waitMs
    room.waitingTimer = setTimeout(() => fillBotsAndStart(room), waitMs)
  }

  function createRoom(mode: RoomMode, code: string | null = null) {
    roomSequence += 1
    const room: RaceRoom = {
      id: mode === 'private' ? `private-${code}` : `quick-${roomSequence}`,
      mode,
      code,
      hostId: null,
      status: 'waiting',
      players: new Map(),
      sentence: '',
      packId: '',
      packLabel: '',
      startsAt: null,
      waitingEndsAt: null,
      rematchVotes: new Set(),
      waitingTimer: null,
      startTimer: null,
      stateTimer: null,
      cleanupTimer: null,
      botStops: new Map(),
    }

    rooms.set(room.id, room)
    if (mode === 'quick') scheduleQuickStart(room)
    return room
  }

  function uniqueHumanName(room: RaceRoom, requestedName: string) {
    const existingNames = new Set(
      [...room.players.values()].map((player) => player.name.toLowerCase()),
    )
    let name = requestedName
    let suffix = 2
    while (existingNames.has(name.toLowerCase())) {
      name = `${requestedName.slice(0, 15)} ${suffix}`
      suffix += 1
    }
    return name
  }

  function addHuman(
    socket: Socket,
    room: RaceRoom,
    requestedName: string,
    userId: string,
    isGuest: boolean,
    skillRating: number,
    carId: string,
    trailId: string,
  ) {
    const player: RacePlayer = {
      id: socket.id,
      name: uniqueHumanName(room, requestedName),
      userId,
      isGuest,
      isBot: false,
      skillRating,
      carId,
      trailId,
      targetWpm: null,
      typedText: '',
      correctCharacters: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 0,
      skippedCharacters: new Set(),
      finishedAt: null,
      placement: null,
      connected: true,
      disconnectedAt: null,
    }

    room.players.set(player.id, player)
    socketRooms.set(socket.id, room.id)
    socket.join(room.id)
    return player
  }

  function addBot(room: RaceRoom, targetWpm: number) {
    botSequence += 1
    const usedNames = new Set(
      [...room.players.values()].map((player) => player.name.toLowerCase()),
    )
    const profile = createBotProfile(usedNames, targetWpm)
    const bot: RacePlayer = {
      id: `bot-${roomSequence}-${botSequence}`,
      name: profile.name,
      userId: null,
      isGuest: false,
      isBot: true,
      skillRating: 0,
      carId: 'classic',
      trailId: 'none',
      targetWpm: profile.targetWpm,
      typedText: '',
      correctCharacters: 0,
      correctKeystrokes: 0,
      totalKeystrokes: 0,
      skippedCharacters: new Set(),
      finishedAt: null,
      placement: null,
      connected: true,
      disconnectedAt: null,
    }
    room.players.set(bot.id, bot)
  }

  function applyTypedText(room: RaceRoom, player: RacePlayer, rawText: string) {
    if (room.status !== 'racing' || room.startsAt === null || player.finishedAt !== null) return

    const unboundedText = rawText.slice(0, room.sentence.length + MAX_WRONG_CHARACTERS)
    const correctPrefix = countCorrectPrefix(unboundedText, room.sentence)
    const nextText = unboundedText.slice(0, correctPrefix + MAX_WRONG_CHARACTERS)
    const sharedPrefixLength = countSharedPrefix(player.typedText, nextText)
    for (let index = sharedPrefixLength; index < nextText.length; index += 1) {
      player.totalKeystrokes += 1
      if (nextText[index] === room.sentence[index]) player.correctKeystrokes += 1
    }

    player.typedText = nextText
    player.correctCharacters = countCorrectPrefix(nextText, room.sentence)
    player.skippedCharacters.forEach((index) => {
      if (index >= player.correctCharacters) player.skippedCharacters.delete(index)
    })

    if (nextText === room.sentence) {
      player.finishedAt = Date.now()
    }

    emitRaceState(room)
    if (player.finishedAt !== null) maybeFinishRoom(room)
  }

  function skipCurrentWord(room: RaceRoom, player: RacePlayer) {
    if (room.status !== 'racing' || room.startsAt === null || player.finishedAt !== null) return

    const nextWordStart = getNextWordStart(room.sentence, player.correctCharacters)
    if (nextWordStart <= player.correctCharacters) return

    for (let index = player.correctCharacters; index < nextWordStart; index += 1) {
      player.skippedCharacters.add(index)
    }
    player.totalKeystrokes += nextWordStart - player.correctCharacters
    player.typedText = room.sentence.slice(0, nextWordStart)
    player.correctCharacters = nextWordStart

    if (nextWordStart === room.sentence.length) {
      player.finishedAt = Date.now()
    }

    emitRaceState(room)
    if (player.finishedAt !== null) maybeFinishRoom(room)
  }

  function startBots(room: RaceRoom) {
    ;[...room.players.values()]
      .filter((player) => player.isBot && player.targetWpm !== null)
      .forEach((bot) => {
        const stop = startBotTyping({
          sentence: room.sentence,
          targetWpm: bot.targetWpm as number,
          isActive: () => room.status === 'racing' && bot.connected,
          onText: (text) => applyTypedText(room, bot, text),
        })
        room.botStops.set(bot.id, stop)
      })
  }

  async function finalizeRoomResults(
    room: RaceRoom,
    orderedPlayers: RacePlayer[],
    rankedAt: number,
  ) {
    let rewards = new Map<string, {
      eloDelta: number
      creditsEarned: number
      elo: number
      credits: number
    }>()
    try {
      rewards = await applyRaceRewards(
        orderedPlayers
          .filter((player) => (
            orderedPlayers.length >= 2
              && !player.isBot
              && !player.isGuest
              && player.userId
          ))
          .map((player) => ({
            userId: player.userId as string,
            placement: player.placement as number,
            fieldSize: orderedPlayers.length,
          })),
      )
    } catch (error) {
      console.error('Could not apply race rewards:', error)
    }

    orderedPlayers.forEach((player) => {
      const reward = player.userId ? rewards.get(player.userId) : undefined
      if (reward) player.skillRating = reward.elo
    })

    io.to(room.id).emit('race:results', {
      results: orderedPlayers.map((player) => {
        const reward = player.userId ? rewards.get(player.userId) : undefined
        return {
          ...getPlayerState(room, player, rankedAt),
          placement: player.placement,
          isBot: player.isBot,
          ranked: Boolean(reward),
          eloDelta: reward?.eloDelta ?? 0,
          creditsEarned: reward?.creditsEarned ?? 0,
          elo: reward?.elo ?? null,
          credits: reward?.credits ?? null,
        }
      }),
    })
    emitRematch(room)
    room.cleanupTimer = setTimeout(() => deleteRoom(room), ROOM_CLEANUP_MS)
  }

  function finishRoom(room: RaceRoom) {
    if (room.status === 'finished') return
    room.status = 'finished'
    if (room.stateTimer) clearInterval(room.stateTimer)
    room.stateTimer = null
    stopBots(room)

    const rankedAt = Date.now()
    const orderedPlayers = [...room.players.values()].sort((left, right) => {
      const leftFinished = left.finishedAt !== null
      const rightFinished = right.finishedAt !== null
      if (leftFinished !== rightFinished) return leftFinished ? -1 : 1

      const leftState = getPlayerState(room, left, rankedAt)
      const rightState = getPlayerState(room, right, rankedAt)
      if (rightState.score !== leftState.score) return rightState.score - leftState.score
      if (rightState.accuracy !== leftState.accuracy) {
        return rightState.accuracy - leftState.accuracy
      }
      if (rightState.wpm !== leftState.wpm) return rightState.wpm - leftState.wpm

      return (left.finishedAt ?? Number.POSITIVE_INFINITY)
        - (right.finishedAt ?? Number.POSITIVE_INFINITY)
    })

    orderedPlayers.forEach((player, index) => {
      player.placement = index + 1
    })

    void finalizeRoomResults(room, orderedPlayers, rankedAt)
  }

  function maybeFinishRoom(room: RaceRoom) {
    if (humanPlayers(room, true).length === 0) {
      deleteRoom(room)
      return
    }

    const activePlayers = [...room.players.values()].filter((player) => player.connected)
    if (activePlayers.every((player) => player.finishedAt !== null)) finishRoom(room)
  }

  function beginRace(room: RaceRoom) {
    if (room.status !== 'countdown' || humanPlayers(room, true).length === 0) return
    room.status = 'racing'
    io.to(room.id).emit('race:started', { startsAt: room.startsAt })
    emitRaceState(room)
    room.stateTimer = setInterval(() => emitRaceState(room), 500)
    startBots(room)
  }

  function startCountdown(room: RaceRoom) {
    if (room.status !== 'waiting' || humanPlayers(room, true).length === 0) return
    if (room.waitingTimer) clearTimeout(room.waitingTimer)
    room.waitingTimer = null

    const raceSentence = getRandomRaceSentence()
    room.status = 'countdown'
    room.sentence = raceSentence.sentence
    room.packId = raceSentence.packId
    room.packLabel = raceSentence.packLabel
    room.startsAt = Date.now() + COUNTDOWN_MS
    room.waitingEndsAt = null

    emitCountdown(room)
    room.startTimer = setTimeout(() => beginRace(room), COUNTDOWN_MS)
  }

  function fillBotsAndStart(room: RaceRoom) {
    if (room.status !== 'waiting' || humanPlayers(room, true).length === 0) return
    const humans = humanPlayers(room, true)
    const botTargets = getBotTargetWpms(
      humans.map((player) => player.skillRating),
      MAX_PLAYERS - room.players.size,
    )
    botTargets.forEach((targetWpm) => addBot(room, targetWpm))
    startCountdown(room)
  }

  function prepareRematch(room: RaceRoom) {
    clearRaceTimers(room)
    stopBots(room)

    for (const [playerId, player] of room.players) {
      if (player.isBot || !player.connected) room.players.delete(playerId)
      else resetPlayer(player)
    }

    if (humanPlayers(room, true).length === 0) {
      deleteRoom(room)
      return
    }

    room.status = 'waiting'
    room.sentence = ''
    room.packId = ''
    room.packLabel = ''
    room.startsAt = null
    room.waitingEndsAt = null
    room.rematchVotes.clear()
    assignHost(room)

    if (room.mode === 'quick') scheduleQuickStart(room)
    emitLobby(room)
  }

  function leaveRoom(socket: Socket) {
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
    room.rematchVotes.delete(socket.id)
    assignHost(room)

    if (humanPlayers(room, true).length === 0) {
      deleteRoom(room)
    } else if (room.status === 'waiting') {
      emitLobby(room)
    } else if (room.status === 'countdown') {
      emitCountdown(room)
    } else if (room.status === 'finished') {
      emitRematch(room)
      const required = humanPlayers(room, true).length
      if (required > 0 && room.rematchVotes.size >= required) prepareRematch(room)
    }
  }

  function acknowledgeJoin(
    acknowledge: ((result: JoinResult) => void) | undefined,
    player: RacePlayer,
    room: RaceRoom,
  ) {
    acknowledge?.({ ok: true, playerId: player.id, roomCode: room.code })
  }

  io.on('connection', (socket) => {
    const authenticatedName = String(socket.data.user?.username ?? '')
    const authenticatedUserId = String(socket.data.user?.id ?? '')
    const authenticatedIsGuest = Boolean(socket.data.user?.isGuest)
    const rawSkillRating = Number(socket.data.user?.skillRating)
    const authenticatedSkillRating = Number.isFinite(rawSkillRating)
      ? Math.max(0, Math.round(rawSkillRating))
      : 1_000
    const equippedCar = String(socket.data.user?.carId ?? 'classic')
    const equippedTrail = String(socket.data.user?.trailId ?? 'none')

    socket.on(
      'quick:join',
      (_payload: JoinPayload, acknowledge?: (result: JoinResult) => void) => {
        if (!authenticatedName) {
          acknowledge?.({ ok: false, error: 'Sign in before joining a race.' })
          return
        }

        leaveRoom(socket)
        const room = [...rooms.values()].find(
          (candidate) => candidate.mode === 'quick'
            && candidate.status === 'waiting'
            && candidate.players.size < MAX_PLAYERS,
        ) ?? createRoom('quick')
        const player = addHuman(
          socket,
          room,
          authenticatedName,
          authenticatedUserId,
          authenticatedIsGuest,
          authenticatedSkillRating,
          equippedCar,
          equippedTrail,
        )

        acknowledgeJoin(acknowledge, player, room)
        emitLobby(room)
        if (room.players.size === MAX_PLAYERS) startCountdown(room)
      },
    )

    socket.on(
      'private:create',
      (_payload: JoinPayload, acknowledge?: (result: JoinResult) => void) => {
        if (!authenticatedName) {
          acknowledge?.({ ok: false, error: 'Sign in before joining a race.' })
          return
        }

        leaveRoom(socket)
        const room = createRoom('private', generateRoomCode())
        const player = addHuman(
          socket,
          room,
          authenticatedName,
          authenticatedUserId,
          authenticatedIsGuest,
          authenticatedSkillRating,
          equippedCar,
          equippedTrail,
        )
        room.hostId = player.id

        acknowledgeJoin(acknowledge, player, room)
        emitLobby(room)
      },
    )

    socket.on(
      'private:join',
      (payload: JoinPayload, acknowledge?: (result: JoinResult) => void) => {
        const code = sanitizeCode(payload?.code)
        const room = rooms.get(`private-${code}`)

        if (!authenticatedName) {
          acknowledge?.({ ok: false, error: 'Sign in before joining a race.' })
          return
        }
        if (code.length !== 4 || !room) {
          acknowledge?.({ ok: false, error: 'That room code does not exist.' })
          return
        }
        if (room.status !== 'waiting' || room.players.size >= MAX_PLAYERS) {
          acknowledge?.({ ok: false, error: 'That room is already racing or full.' })
          return
        }

        leaveRoom(socket)
        const player = addHuman(
          socket,
          room,
          authenticatedName,
          authenticatedUserId,
          authenticatedIsGuest,
          authenticatedSkillRating,
          equippedCar,
          equippedTrail,
        )
        acknowledgeJoin(acknowledge, player, room)
        emitLobby(room)
      },
    )

    socket.on(
      'private:start',
      (acknowledge?: (result: ActionResult) => void) => {
        const roomId = socketRooms.get(socket.id)
        const room = roomId ? rooms.get(roomId) : undefined
        if (!room || room.mode !== 'private' || room.status !== 'waiting') {
          acknowledge?.({ ok: false, error: 'This room cannot start right now.' })
          return
        }
        if (room.hostId !== socket.id) {
          acknowledge?.({ ok: false, error: 'Only the host can start this race.' })
          return
        }

        acknowledge?.({ ok: true })
        startCountdown(room)
      },
    )

    socket.on('race:typed', (payload: TypedPayload) => {
      const roomId = socketRooms.get(socket.id)
      const room = roomId ? rooms.get(roomId) : undefined
      const player = room?.players.get(socket.id)

      if (
        !room
        || !player
        || player.isBot
        || room.status !== 'racing'
        || room.startsAt === null
        || Date.now() < room.startsAt
        || typeof payload?.text !== 'string'
      ) {
        return
      }

      applyTypedText(room, player, payload.text)
    })

    socket.on('race:skip-word', () => {
      const roomId = socketRooms.get(socket.id)
      const room = roomId ? rooms.get(roomId) : undefined
      const player = room?.players.get(socket.id)

      if (
        !room
        || !player
        || player.isBot
        || room.status !== 'racing'
        || room.startsAt === null
        || Date.now() < room.startsAt
      ) {
        return
      }

      skipCurrentWord(room, player)
    })

    socket.on('race:rematch', () => {
      const roomId = socketRooms.get(socket.id)
      const room = roomId ? rooms.get(roomId) : undefined
      const player = room?.players.get(socket.id)
      if (!room || !player || player.isBot || !player.connected || room.status !== 'finished') {
        return
      }

      room.rematchVotes.add(player.id)
      emitRematch(room)
      const required = humanPlayers(room, true).length
      if (required > 0 && room.rematchVotes.size >= required) prepareRematch(room)
    })

    socket.on('room:leave', () => leaveRoom(socket))
    socket.on('disconnect', () => leaveRoom(socket))
  })
}
