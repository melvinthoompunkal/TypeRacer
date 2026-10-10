import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

type Phase = 'joining' | 'lobby' | 'countdown' | 'racing' | 'results'

type LobbyPlayer = {
  id: string
  name: string
}

type LobbyState = {
  roomId: string
  players: LobbyPlayer[]
  maxPlayers: number
  startsAt: number
}

type RacerState = {
  id: string
  name: string
  progress: number
  wpm: number
  accuracy: number
  finished: boolean
  placement: number | null
  connected: boolean
}

type RaceResult = RacerState & {
  placement: number
  isBot: boolean
}

type RaceDetails = {
  sentence: string
  packId: string
  packLabel: string
  startsAt: number
}

type JoinResult =
  | { ok: true; playerId: string }
  | { ok: false; error: string }

type ServerToClientEvents = {
  'lobby:update': (lobby: LobbyState) => void
  'race:countdown': (
    payload: RaceDetails & { racers: RacerState[] },
  ) => void
  'race:started': (payload: { startsAt: number }) => void
  'race:state': (payload: { racers: RacerState[] }) => void
  'race:results': (payload: { results: RaceResult[] }) => void
}

type ClientToServerEvents = {
  'quick:join': (
    payload: { name: string },
    acknowledge: (result: JoinResult) => void,
  ) => void
  'race:typed': (payload: { text: string }) => void
  'room:leave': () => void
}

type MultiplayerRaceProps = {
  playerName: string
  onExit: () => void
}

function ordinal(value: number) {
  const remainder = value % 100
  if (remainder >= 11 && remainder <= 13) return `${value}th`
  if (value % 10 === 1) return `${value}st`
  if (value % 10 === 2) return `${value}nd`
  if (value % 10 === 3) return `${value}rd`
  return `${value}th`
}

export default function MultiplayerRace({ playerName, onExit }: MultiplayerRaceProps) {
  const socket = useMemo<Socket<ServerToClientEvents, ClientToServerEvents>>(
    () => io({ autoConnect: false, reconnection: false }),
    [],
  )
  const [phase, setPhase] = useState<Phase>('joining')
  const [lobby, setLobby] = useState<LobbyState | null>(null)
  const [race, setRace] = useState<RaceDetails | null>(null)
  const [racers, setRacers] = useState<RacerState[]>([])
  const [results, setResults] = useState<RaceResult[]>([])
  const [playerId, setPlayerId] = useState('')
  const [typed, setTyped] = useState('')
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleConnect = () => {
      socket.emit('quick:join', { name: playerName }, (result) => {
        if (!result.ok) {
          setError(result.error)
          return
        }
        setPlayerId(result.playerId)
      })
    }

    const handleLobby = (nextLobby: LobbyState) => {
      setLobby(nextLobby)
      setPhase('lobby')
    }

    const handleCountdown = (payload: RaceDetails & { racers: RacerState[] }) => {
      setRace({
        sentence: payload.sentence,
        packId: payload.packId,
        packLabel: payload.packLabel,
        startsAt: payload.startsAt,
      })
      setRacers(payload.racers)
      setTyped('')
      setPhase('countdown')
    }

    const handleStarted = ({ startsAt }: { startsAt: number }) => {
      setRace((current) => current ? { ...current, startsAt } : current)
      setPhase('racing')
      window.setTimeout(() => inputRef.current?.focus(), 50)
    }

    const handleState = ({ racers: nextRacers }: { racers: RacerState[] }) => {
      setRacers(nextRacers)
    }

    const handleResults = ({ results: nextResults }: { results: RaceResult[] }) => {
      setResults(nextResults)
      setPhase('results')
      inputRef.current?.blur()
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', () => setError('Could not connect to the race server.'))
    socket.on('lobby:update', handleLobby)
    socket.on('race:countdown', handleCountdown)
    socket.on('race:started', handleStarted)
    socket.on('race:state', handleState)
    socket.on('race:results', handleResults)
    socket.connect()

    return () => {
      socket.emit('room:leave')
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [playerName, socket])

  const self = racers.find((racer) => racer.id === playerId)
  const correctCount = useMemo(() => {
    if (!race) return 0
    let count = 0
    while (count < typed.length && typed[count] === race.sentence[count]) count += 1
    return count
  }, [race, typed])
  const hasError = Boolean(race && typed.length > correctCount)
  const countdown = race ? Math.max(0, Math.ceil((race.startsAt - now) / 1_000)) : 0
  const lobbyWait = lobby ? Math.max(0, Math.ceil((lobby.startsAt - now) / 1_000)) : 0

  const handleInput = (rawValue: string) => {
    if (!race || phase !== 'racing' || self?.finished) return

    if (rawValue.length < typed.length) {
      setTyped(rawValue)
      socket.emit('race:typed', { text: rawValue })
      return
    }

    if (hasError || rawValue.length === typed.length) return

    const added = rawValue.slice(typed.length)
    let accepted = typed
    for (const character of added) {
      if (accepted.length >= race.sentence.length) break
      accepted += character
      if (character !== race.sentence[accepted.length - 1]) break
    }

    setTyped(accepted)
    socket.emit('race:typed', { text: accepted })
  }

  const exitRace = () => {
    socket.emit('room:leave')
    onExit()
  }

  if (phase === 'joining' || phase === 'lobby') {
    const slots = Array.from({ length: lobby?.maxPlayers ?? 4 }, (_, index) => (
      lobby?.players[index] ?? null
    ))

    return (
      <main className="app-shell multiplayer-shell">
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>TypeRacer</span>
          </div>
          <button className="text-button" onClick={exitRace}>Leave lobby</button>
        </nav>

        <section className="lobby-panel">
          <span className="eyebrow">Quick match</span>
          <h1>Finding your grid</h1>
          <p>
            {phase === 'joining'
              ? 'Connecting to the race server…'
              : `Race begins in about ${lobbyWait} second${lobbyWait === 1 ? '' : 's'}.`}
          </p>

          {error && <div className="error-banner" role="alert">{error}</div>}

          <div className="lobby-grid" aria-live="polite">
            {slots.map((player, index) => (
              <div className={player ? 'lobby-slot filled' : 'lobby-slot'} key={index}>
                <span className="slot-number">0{index + 1}</span>
                <div className="racer-avatar">{player ? player.name[0].toUpperCase() : '?'}</div>
                <strong>{player?.name ?? 'Waiting…'}</strong>
                <small>{player ? 'Ready' : 'Open slot'}</small>
              </div>
            ))}
          </div>

          <div className="waiting-line"><i /><span>Matchmaking in progress</span></div>
        </section>
      </main>
    )
  }

  if (phase === 'results') {
    const ownResult = results.find((result) => result.id === playerId)
    const won = ownResult?.placement === 1

    return (
      <main className="app-shell multiplayer-shell">
        {won && (
          <div className="celebration" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
          </div>
        )}
        <nav className="topbar">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>TypeRacer</span>
          </div>
          <button className="text-button" onClick={exitRace}>Back home</button>
        </nav>

        <section className="results-panel">
          <span className="eyebrow">Race complete</span>
          <h1>{won ? 'You took the win!' : `${ordinal(ownResult?.placement ?? results.length)} place`}</h1>
          <p>{won ? 'Fast fingers, clean finish.' : 'Another lap is waiting when you are.'}</p>

          <div className="results-table">
            <div className="result-row result-heading">
              <span>Place</span><span>Racer</span><span>WPM</span><span>Accuracy</span>
            </div>
            {results.map((result) => (
              <div
                className={result.id === playerId ? 'result-row own-result' : 'result-row'}
                key={result.id}
              >
                <strong>{ordinal(result.placement)}</strong>
                <span>{result.name}{result.id === playerId && <small> You</small>}</span>
                <strong>{result.wpm}</strong>
                <span>{result.accuracy}%</span>
              </div>
            ))}
          </div>

          <div className="results-actions">
            <button className="primary-button" onClick={exitRace}>Back to home</button>
          </div>
        </section>
      </main>
    )
  }

  if (!race) return null

  return (
    <main className="app-shell multiplayer-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>TypeRacer</span>
        </div>
        <span className="race-pack">{race.packLabel}</span>
      </nav>

      <section className="multiplayer-race">
        <div className="race-status-line">
          <div>
            <span className="eyebrow">Live race</span>
            <h1>{phase === 'countdown' ? 'Get ready' : 'Type!'}</h1>
          </div>
          <div className="live-stats">
            <span><strong>{self?.wpm ?? 0}</strong> WPM</span>
            <span><strong>{self?.accuracy ?? 100}</strong>% accuracy</span>
          </div>
        </div>

        <div className="racer-tracks" aria-live="polite">
          {racers.map((racer) => (
            <div className={racer.connected ? 'racer-track-row' : 'racer-track-row disconnected'} key={racer.id}>
              <div className="track-name">
                <strong>{racer.name}</strong>
                {racer.id === playerId && <small>You</small>}
              </div>
              <div className="track multiplayer-track">
                <div className="track-fill" style={{ width: `${racer.progress}%` }} />
                <div className="car" style={{ left: `${Math.min(racer.progress, 96)}%` }} aria-hidden="true">🏎️</div>
                <div className="finish-line" aria-hidden="true" />
              </div>
              <span className="track-percent">{Math.round(racer.progress)}%</span>
            </div>
          ))}
        </div>

        <section
          className={phase === 'countdown' ? 'race-card countdown-locked' : 'race-card'}
          onClick={() => inputRef.current?.focus()}
        >
          {phase === 'countdown' && (
            <div className="countdown-overlay">
              <strong>{countdown || 'GO'}</strong>
            </div>
          )}

          <div className="sentence" aria-label={race.sentence}>
            {race.sentence.split('').map((character, index) => {
              let state = 'pending'
              if (index < correctCount) state = 'correct'
              else if (index === correctCount && hasError) state = 'wrong'
              else if (index === correctCount && !self?.finished) state = 'current'

              return (
                <span className={`character ${state}`} key={`${character}-${index}`}>
                  {character === ' ' ? '\u00a0' : character}
                </span>
              )
            })}
          </div>

          <input
            ref={inputRef}
            className="typing-input"
            value={typed}
            onChange={(event) => handleInput(event.target.value)}
            onPaste={(event) => event.preventDefault()}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Type the race sentence here"
            disabled={phase !== 'racing' || self?.finished}
          />

          {phase === 'racing' && !self?.finished && (
            <button className="focus-prompt" onClick={() => inputRef.current?.focus()}>
              {hasError ? 'Fix the red character to continue' : 'Tap here to focus your keyboard'}
            </button>
          )}
          {self?.finished && <p className="finished-waiting">Finished — waiting for the field…</p>}
        </section>
      </section>
    </main>
  )
}
