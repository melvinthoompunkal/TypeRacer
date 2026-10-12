import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import MultiplayerRace, { type MultiplayerEntry } from './MultiplayerRace'
import {
  playGameSound,
  primeGameAudio,
  RaceCar,
  SoundButton,
} from './gamePolish'

type Screen = 'home' | 'practice-setup' | 'practice' | 'multiplayer'
type PracticeModeType = 'words' | 'time'

type PracticeMode = {
  type: PracticeModeType
  value: number
}

type Pack = {
  id: string
  label: string
  count: number
}

type PracticeRound = {
  packId: string
  sentence: string
}

const PRACTICE_OPTIONS: Record<PracticeModeType, number[]> = {
  words: [10, 25, 50, 100],
  time: [15, 30, 60, 120],
}

const DEFAULT_PRACTICE_VALUES: Record<PracticeModeType, number> = {
  words: 25,
  time: 30,
}

const TIMED_TEST_WORDS = 500

const PACK_DETAILS: Record<string, { icon: string; description: string }> = {
  'movie-quotes': { icon: '🎬', description: 'Iconic lines from the big screen' },
  'famous-lines': { icon: '💡', description: 'Timeless words worth remembering' },
  'rap-lyrics': { icon: '🎤', description: 'Original bars with rhythm and flow' },
  'everyday-funny': { icon: '😄', description: 'Small absurdities of daily life' },
}

function calculateWpm(correctCharacters: number, elapsedMs: number) {
  if (elapsedMs <= 0 || correctCharacters === 0) return 0
  return Math.round(correctCharacters / 5 / (elapsedMs / 60_000))
}

function calculateAccuracy(correctKeystrokes: number, totalKeystrokes: number) {
  if (totalKeystrokes === 0) return 100
  return Math.round((correctKeystrokes / totalKeystrokes) * 100)
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [playerName, setPlayerName] = useState(
    () => window.localStorage.getItem('type-racer-name') ?? '',
  )
  const [roomCode, setRoomCode] = useState('')
  const [multiplayerEntry, setMultiplayerEntry] = useState<MultiplayerEntry>({ kind: 'quick' })
  const [packs, setPacks] = useState<Pack[]>([])
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>({
    type: 'words',
    value: DEFAULT_PRACTICE_VALUES.words,
  })
  const [round, setRound] = useState<PracticeRound | null>(null)
  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0)
  const [sessionBest, setSessionBest] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeLineTop, setActiveLineTop] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(
    () => window.localStorage.getItem('type-racer-sound') === 'on',
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const sentenceViewportRef = useRef<HTMLDivElement>(null)
  const activeCharacterRef = useRef<HTMLSpanElement>(null)
  const previousErrorRef = useRef(false)

  useEffect(() => {
    fetch('/api/packs')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load sentence packs.')
        return response.json() as Promise<{ packs: Pack[] }>
      })
      .then(({ packs: loadedPacks }) => setPacks(loadedPacks))
      .catch(() => setError('The server is taking a breather. Please refresh and try again.'))
  }, [])

  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [finishedAt, startedAt])

  const loadRound = useCallback(async (packId: string, mode: PracticeMode) => {
    setLoading(true)
    setError('')

    try {
      const wordCount = mode.type === 'words' ? mode.value : TIMED_TEST_WORDS
      const response = await fetch(
        '/api/practice/' + encodeURIComponent(packId) + '?words=' + wordCount,
      )
      if (!response.ok) throw new Error('Could not load practice text.')
      const nextRound = (await response.json()) as PracticeRound

      setRound(nextRound)
      setSelectedPack(packId)
      setPracticeMode(mode)
      setTyped('')
      setStartedAt(null)
      setFinishedAt(null)
      setTotalKeystrokes(0)
      setCorrectKeystrokes(0)
      setActiveLineTop(0)
      setNow(Date.now())
      setScreen('practice')
      window.setTimeout(() => inputRef.current?.focus(), 50)
    } catch {
      setError('Could not start that test. Check the server and try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const openPracticeSetup = (packId: string) => {
    setSelectedPack(packId)
    setRound(null)
    setError('')
    setScreen('practice-setup')
  }

  const correctCount = useMemo(() => {
    if (!round) return 0
    let count = 0
    while (count < typed.length && typed[count] === round.sentence[count]) count += 1
    return count
  }, [round, typed])

  const hasError = Boolean(round && typed.length > correctCount)
  const elapsedMs = startedAt === null ? 0 : (finishedAt ?? now) - startedAt
  const timeLimitMs = practiceMode.type === 'time' ? practiceMode.value * 1_000 : 0
  const remainingMs = practiceMode.type === 'time'
    ? Math.max(0, timeLimitMs - elapsedMs)
    : 0
  const wpm = calculateWpm(correctCount, elapsedMs)
  const accuracy = calculateAccuracy(correctKeystrokes, totalKeystrokes)
  const progress = round
    ? practiceMode.type === 'time'
      ? Math.min(100, (elapsedMs / timeLimitMs) * 100)
      : (correctCount / round.sentence.length) * 100
    : 0

  const updateActiveLine = useCallback(() => {
    const activeCharacter = activeCharacterRef.current
    const viewport = sentenceViewportRef.current
    if (!activeCharacter || !viewport) {
      setActiveLineTop(0)
      return
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(viewport).lineHeight)
    const lineIndex = Math.max(0, Math.round(activeCharacter.offsetTop / lineHeight))
    setActiveLineTop(lineIndex * lineHeight)
  }, [])

  useLayoutEffect(() => {
    updateActiveLine()
  }, [correctCount, round, updateActiveLine])

  useEffect(() => {
    const viewport = sentenceViewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateActiveLine)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [round, updateActiveLine])

  useEffect(() => {
    if (
      practiceMode.type !== 'time'
      || startedAt === null
      || finishedAt !== null
      || elapsedMs < timeLimitMs
    ) return

    const finish = startedAt + timeLimitMs
    setFinishedAt(finish)
    setSessionBest((best) => Math.max(best, calculateWpm(correctCount, timeLimitMs)))
    playGameSound(soundEnabled, 'finish')
    window.setTimeout(() => inputRef.current?.blur(), 0)
  }, [
    correctCount,
    elapsedMs,
    finishedAt,
    practiceMode.type,
    soundEnabled,
    startedAt,
    timeLimitMs,
  ])

  useEffect(() => {
    if (hasError && !previousErrorRef.current) playGameSound(soundEnabled, 'error')
    previousErrorRef.current = hasError
  }, [hasError, soundEnabled])

  const toggleSound = () => {
    const nextValue = !soundEnabled
    setSoundEnabled(nextValue)
    window.localStorage.setItem('type-racer-sound', nextValue ? 'on' : 'off')
    if (nextValue) primeGameAudio()
  }

  const handleInput = (rawValue: string) => {
    if (!round || finishedAt !== null) return

    if (rawValue.length < typed.length) {
      setTyped(rawValue)
      return
    }

    if (hasError || rawValue.length === typed.length) return

    const added = rawValue.slice(typed.length)
    let accepted = typed
    let newTotal = 0
    let newCorrect = 0

    for (const character of added) {
      if (accepted.length >= round.sentence.length) break
      newTotal += 1
      accepted += character

      if (character === round.sentence[accepted.length - 1]) {
        newCorrect += 1
      } else {
        break
      }
    }

    const start = startedAt ?? Date.now()
    if (startedAt === null) {
      setStartedAt(start)
      setNow(start)
    }

    setTotalKeystrokes((value) => value + newTotal)
    setCorrectKeystrokes((value) => value + newCorrect)
    setTyped(accepted)

    if (accepted === round.sentence) {
      const finish = Date.now()
      const finalWpm = calculateWpm(round.sentence.length, finish - start)
      setFinishedAt(finish)
      setSessionBest((best) => Math.max(best, finalWpm))
      playGameSound(soundEnabled, 'finish')
      window.setTimeout(() => inputRef.current?.blur(), 0)
    }
  }

  const returnHome = () => {
    setScreen('home')
    setRound(null)
    setTyped('')
    setError('')
  }

  const startMultiplayer = (entry: MultiplayerEntry) => {
    const name = playerName.trim()
    if (!name) {
      setError('Enter a racer name before joining a race.')
      return
    }
    if (entry.kind === 'join' && entry.roomCode?.length !== 4) {
      setError('Enter the four-letter private room code.')
      return
    }

    window.localStorage.setItem('type-racer-name', name)
    setPlayerName(name)
    setMultiplayerEntry(entry)
    setError('')
    setScreen('multiplayer')
  }

  if (screen === 'multiplayer') {
    return (
      <MultiplayerRace
        playerName={playerName}
        entry={multiplayerEntry}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onExit={returnHome}
      />
    )
  }

  if (screen === 'practice-setup' && selectedPack) {
    const selectedPackLabel = packs.find((pack) => pack.id === selectedPack)?.label ?? 'Practice'
    const options = PRACTICE_OPTIONS[practiceMode.type]

    return (
      <main className="app-shell practice-shell">
        <nav className="topbar">
          <button className="brand brand-button" onClick={returnHome} aria-label="Back to home">
            <span className="brand-mark">T</span>
            <span>TypeRacer</span>
          </button>
          <div className="nav-actions">
            <SoundButton enabled={soundEnabled} onToggle={toggleSound} />
            <button className="text-button" onClick={returnHome}>Back home</button>
          </div>
        </nav>

        <section className="practice-setup">
          <div className="setup-heading">
            <span className="eyebrow">Configure practice</span>
            <h1>{selectedPackLabel}</h1>
            <p>Choose how you want to train. Your test begins with the first keystroke.</p>
          </div>

          {error && <div className="error-banner" role="alert">{error}</div>}

          <div className="setup-card">
            <div className="setup-group">
              <span className="setup-label">Test type</span>
              <div className="option-row">
                {(['words', 'time'] as PracticeModeType[]).map((type) => (
                  <button
                    className={practiceMode.type === type ? 'option-button selected' : 'option-button'}
                    key={type}
                    onClick={() => setPracticeMode({
                      type,
                      value: DEFAULT_PRACTICE_VALUES[type],
                    })}
                    aria-pressed={practiceMode.type === type}
                  >
                    <strong>{type === 'words' ? 'Words' : 'Time'}</strong>
                    <small>{type === 'words' ? 'Finish a set amount' : 'Race the clock'}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-group">
              <span className="setup-label">
                {practiceMode.type === 'words' ? 'Word count' : 'Duration'}
              </span>
              <div className="length-options">
                {options.map((value) => (
                  <button
                    className={practiceMode.value === value ? 'length-button selected' : 'length-button'}
                    key={value}
                    onClick={() => setPracticeMode((mode) => ({ ...mode, value }))}
                    aria-pressed={practiceMode.value === value}
                  >
                    {value}<small>{practiceMode.type === 'time' ? 's' : ''}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-start">
              <div>
                <span>Your test</span>
                <strong>
                  {practiceMode.value} {practiceMode.type === 'words' ? 'words' : 'seconds'}
                </strong>
              </div>
              <button
                className="primary-button"
                onClick={() => loadRound(selectedPack, practiceMode)}
                disabled={loading}
              >
                {loading ? 'Preparing…' : 'Start test'}
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'practice' && round) {
    const selectedPackLabel = packs.find((pack) => pack.id === selectedPack)?.label ?? 'Practice'

    return (
      <main className="app-shell practice-shell">
        <nav className="topbar">
          <button className="brand brand-button" onClick={returnHome} aria-label="Back to home">
            <span className="brand-mark">T</span>
            <span>TypeRacer</span>
          </button>
          <div className="nav-actions">
            <SoundButton enabled={soundEnabled} onToggle={toggleSound} />
            <button className="text-button" onClick={returnHome}>Exit practice</button>
          </div>
        </nav>

        <section className="practice-header">
          <div>
            <span className="eyebrow">Solo practice</span>
            <h1>{selectedPackLabel}</h1>
            <span className="practice-mode-pill">
              {practiceMode.value} {practiceMode.type === 'words' ? 'words' : 'seconds'}
            </span>
          </div>
          <div className="best-score">
            <span>Session best</span>
            <strong>{sessionBest}<small> WPM</small></strong>
          </div>
        </section>

        <section className="race-card" onClick={() => inputRef.current?.focus()}>
          <div className="stats-row" aria-live="polite">
            <div><span>Speed</span><strong>{wpm}</strong><small> WPM</small></div>
            <div><span>Accuracy</span><strong>{accuracy}</strong><small>%</small></div>
            <div>
              <span>{practiceMode.type === 'time' ? 'Time left' : 'Progress'}</span>
              <strong>
                {practiceMode.type === 'time'
                  ? Math.ceil(remainingMs / 1_000)
                  : Math.round(progress)}
              </strong>
              <small>{practiceMode.type === 'time' ? ' s' : '%'}</small>
            </div>
          </div>

          <div className="track" aria-label={`${Math.round(progress)} percent complete`}>
            <div className="track-fill" style={{ width: `${progress}%` }} />
            <RaceCar progress={progress} active={startedAt !== null && finishedAt === null} finished={finishedAt !== null} />
            <div className="finish-line" aria-hidden="true" />
          </div>

          <div
            className="sentence-viewport"
            ref={sentenceViewportRef}
            aria-label={round.sentence}
          >
            <div
              className="sentence practice-sentence"
              style={{ transform: `translateY(-${activeLineTop}px)` }}
            >
              {round.sentence.split('').map((character, index) => {
                let state = 'pending'
                if (index < correctCount) state = 'correct'
                else if (index === correctCount && hasError) state = 'wrong'
                else if (index === correctCount && !finishedAt) state = 'current'

                return (
                  <span
                    className={`character ${state}`}
                    key={index}
                    ref={index === correctCount ? activeCharacterRef : undefined}
                  >
                    {character}
                  </span>
                )
              })}
            </div>
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
            aria-label="Type the sentence here"
            inputMode="text"
          />

          {!finishedAt && (
            <button className="focus-prompt" onClick={() => inputRef.current?.focus()}>
              {startedAt === null ? 'Tap here and start typing' : hasError ? 'Fix the red character to continue' : 'Keep going'}
            </button>
          )}
        </section>

        {finishedAt !== null && (
          <section className="finish-card" aria-live="polite">
            <div className="finish-icon">✓</div>
            <div>
              <span className="eyebrow">Round complete</span>
              <h2>Test complete</h2>
              <p>{wpm} WPM with {accuracy}% accuracy</p>
            </div>
            <div className="finish-actions">
              <button className="secondary-button" onClick={() => setScreen('practice-setup')}>
                Change mode
              </button>
              <button
                className="primary-button"
                onClick={() => loadRound(round.packId, practiceMode)}
                disabled={loading}
              >
                {loading ? 'Preparing…' : 'Repeat test'}
              </button>
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>TypeRacer</span>
        </div>
        <div className="nav-actions">
          <SoundButton enabled={soundEnabled} onToggle={toggleSound} />
          <span className="status-pill"><i /> Server online</span>
        </div>
      </nav>

      <section className="hero">
        <span className="eyebrow">Ready, set, type</span>
        <h1>How fast can your<br /><em>fingers fly?</em></h1>
        <p>Warm up solo, jump into a four-racer quick match, or challenge friends in a private room.</p>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="mode-grid">
        <article className="mode-card featured">
          <div className="mode-icon">⌨</div>
          <span className="eyebrow">Available now</span>
          <h2>Practice</h2>
          <p>Pick a pack, find your rhythm, and chase a new session best.</p>
          <button
            className="card-action"
            onClick={() => document.querySelector('#practice-packs')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Choose a pack <b>→</b>
          </button>
        </article>
        <article className="mode-card race-mode">
          <div className="race-mode-copy">
            <div className="mode-icon">🏁</div>
            <span className="eyebrow">Live now</span>
            <h2>Race</h2>
            <p>Race a full grid instantly, or open a private room for friends.</p>
          </div>
          <div className="race-join">
            <label className="racer-name-field">
              <span>Racer name</span>
              <input
                className="racer-name-input"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value.slice(0, 18))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') startMultiplayer({ kind: 'quick' })
                }}
                placeholder="Enter your name"
                maxLength={18}
              />
            </label>
            <div className="race-buttons">
              <button className="primary-button" onClick={() => startMultiplayer({ kind: 'quick' })}>
                Quick match
              </button>
              <button className="secondary-button" onClick={() => startMultiplayer({ kind: 'create' })}>
                Create room
              </button>
            </div>
            <div className="private-join">
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(
                  event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
                )}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    startMultiplayer({ kind: 'join', roomCode })
                  }
                }}
                placeholder="CODE"
                aria-label="Private room code"
                maxLength={4}
              />
              <button
                className="text-button"
                onClick={() => startMultiplayer({ kind: 'join', roomCode })}
              >
                Join room
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="packs-section" id="practice-packs">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Practice library</span>
            <h2>Choose your words</h2>
          </div>
          <span>{packs.reduce((sum, pack) => sum + pack.count, 0)} sentences</span>
        </div>

        <div className="pack-grid">
          {packs.map((pack) => {
            const details = PACK_DETAILS[pack.id]
            return (
              <button className="pack-card" key={pack.id} onClick={() => openPracticeSetup(pack.id)}>
                <span className="pack-icon">{details?.icon ?? '⌨️'}</span>
                <span className="pack-copy">
                  <strong>{pack.label}</strong>
                  <small>{details?.description}</small>
                </span>
                <span className="pack-count">{pack.count}</span>
              </button>
            )
          })}
        </div>
      </section>

      <footer>Built for quick fingers and friendly competition.</footer>
    </main>
  )
}

export default App
