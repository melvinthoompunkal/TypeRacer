import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import AuthScreen, { type AuthUser } from './AuthScreen'
import MultiplayerRace, { type MultiplayerEntry } from './MultiplayerRace'
import ProfileStore from './ProfileStore'
import {
  playGameSound,
  primeGameAudio,
  RaceCar,
  SoundButton,
  ThemeButton,
  type ColorTheme,
} from './gamePolish'
import {
  acceptTypingInput,
  countCorrectPrefix,
  getNextWordStart,
} from './typingMechanics'

type Screen = 'home' | 'practice-setup' | 'practice' | 'multiplayer' | 'profile'
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
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authError, setAuthError] = useState('')
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
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(() => new Set())
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
  const [theme, setTheme] = useState<ColorTheme>(() => {
    const savedTheme = window.localStorage.getItem('type-racer-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const sentenceViewportRef = useRef<HTMLDivElement>(null)
  const activeCharacterRef = useRef<HTMLSpanElement>(null)
  const previousErrorRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('type-racer-theme', theme)
  }, [theme])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json() as { user?: AuthUser; error?: string }
        if (response.status === 401) return null
        if (!response.ok || !payload.user) {
          throw new Error(payload.error ?? 'Could not check your login.')
        }
        return payload.user
      })
      .then((authenticatedUser) => setUser(authenticatedUser))
      .catch((requestError) => {
        setAuthError(requestError instanceof Error ? requestError.message : 'Could not check your login.')
      })
      .finally(() => setAuthChecked(true))
  }, [])

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
      setSkippedIndices(new Set())
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
    return countCorrectPrefix(typed, round.sentence)
  }, [round, typed])

  const hasError = Boolean(round && typed.length > correctCount)
  const wrongCharacters = typed.slice(correctCount)
  const skippedCount = useMemo(
    () => [...skippedIndices].filter((index) => index < correctCount).length,
    [correctCount, skippedIndices],
  )
  const elapsedMs = startedAt === null ? 0 : (finishedAt ?? now) - startedAt
  const timeLimitMs = practiceMode.type === 'time' ? practiceMode.value * 1_000 : 0
  const remainingMs = practiceMode.type === 'time'
    ? Math.max(0, timeLimitMs - elapsedMs)
    : 0
  const wpm = calculateWpm(Math.max(0, correctCount - skippedCount), elapsedMs)
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
  }, [correctCount, round, typed, updateActiveLine])

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
    setSessionBest((best) => Math.max(
      best,
      calculateWpm(Math.max(0, correctCount - skippedCount), timeLimitMs),
    ))
    playGameSound(soundEnabled, 'finish')
    window.setTimeout(() => inputRef.current?.blur(), 0)
  }, [
    correctCount,
    elapsedMs,
    finishedAt,
    practiceMode.type,
    skippedCount,
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

  const toggleTheme = () => {
    setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')
  }

  const handleInput = (rawValue: string) => {
    if (!round || finishedAt !== null) return

    if (rawValue.length < typed.length) {
      const nextCorrectCount = countCorrectPrefix(rawValue, round.sentence)
      setSkippedIndices((current) => new Set(
        [...current].filter((index) => index < nextCorrectCount),
      ))
      setTyped(rawValue)
      return
    }

    if (rawValue.length === typed.length) return

    const {
      text: accepted,
      addedKeystrokes,
      addedCorrect,
    } = acceptTypingInput(typed, rawValue, round.sentence)
    if (accepted === typed) return

    const start = startedAt ?? Date.now()
    if (startedAt === null) {
      setStartedAt(start)
      setNow(start)
    }

    setTotalKeystrokes((value) => value + addedKeystrokes)
    setCorrectKeystrokes((value) => value + addedCorrect)
    setTyped(accepted)

    if (accepted === round.sentence) {
      const finish = Date.now()
      const finalWpm = calculateWpm(
        Math.max(0, round.sentence.length - skippedIndices.size),
        finish - start,
      )
      setFinishedAt(finish)
      setSessionBest((best) => Math.max(best, finalWpm))
      playGameSound(soundEnabled, 'finish')
      window.setTimeout(() => inputRef.current?.blur(), 0)
    }
  }

  const skipCurrentWord = () => {
    if (!round || finishedAt !== null) return

    const nextWordStart = getNextWordStart(round.sentence, correctCount)
    if (nextWordStart <= correctCount) return

    const nextSkippedIndices = new Set(skippedIndices)
    for (let index = correctCount; index < nextWordStart; index += 1) {
      nextSkippedIndices.add(index)
    }

    const start = startedAt ?? Date.now()
    if (startedAt === null) {
      setStartedAt(start)
      setNow(start)
    }

    setSkippedIndices(nextSkippedIndices)
    setTotalKeystrokes((value) => value + nextWordStart - correctCount)
    setTyped(round.sentence.slice(0, nextWordStart))

    if (nextWordStart === round.sentence.length) {
      const finish = Date.now()
      const finalWpm = calculateWpm(
        Math.max(0, round.sentence.length - nextSkippedIndices.size),
        finish - start,
      )
      setFinishedAt(finish)
      setSessionBest((best) => Math.max(best, finalWpm))
      playGameSound(soundEnabled, 'finish')
      window.setTimeout(() => inputRef.current?.blur(), 0)
    }
  }

  const handleTypingKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!round || event.key !== ' ' || finishedAt !== null) return
    if (!hasError && round.sentence[correctCount] === ' ') return

    event.preventDefault()
    skipCurrentWord()
  }

  const returnHome = () => {
    setScreen('home')
    setRound(null)
    setTyped('')
    setError('')
  }

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Could not log out.')
      returnHome()
      setUser(null)
    } catch {
      setError('Could not log out. Please try again.')
    }
  }

  const startMultiplayer = (entry: MultiplayerEntry) => {
    const name = user?.username ?? ''
    if (!name) {
      setError('Log in before joining a race.')
      return
    }
    if (entry.kind === 'join' && entry.roomCode?.length !== 4) {
      setError('Enter the four-letter private room code.')
      return
    }

    setMultiplayerEntry(entry)
    setError('')
    setScreen('multiplayer')
  }

  if (!authChecked) {
    return (
      <main className="app-shell auth-shell auth-loading">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>TypeRacer</span>
        </div>
        <p>Checking your session…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        initialError={authError}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser)
          setAuthError('')
        }}
      />
    )
  }

  if (screen === 'multiplayer') {
    return (
      <MultiplayerRace
        entry={multiplayerEntry}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        theme={theme}
        onToggleTheme={toggleTheme}
        onExit={returnHome}
      />
    )
  }

  if (screen === 'profile' && !user.isGuest) {
    return (
      <ProfileStore
        username={user.username}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={returnHome}
        onLogout={logout}
        onCarEquipped={(carId) => setUser((current) => (
          current ? { ...current, equippedCar: carId } : current
        ))}
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
            <ThemeButton theme={theme} onToggle={toggleTheme} />
            <span className="account-name">@{user.username}</span>
            <button className="text-button" onClick={logout}>Log out</button>
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
            <ThemeButton theme={theme} onToggle={toggleTheme} />
            <span className="account-name">@{user.username}</span>
            <button className="text-button" onClick={logout}>Log out</button>
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
            <RaceCar
              progress={progress}
              carId={user.equippedCar}
              active={startedAt !== null && finishedAt === null}
              finished={finishedAt !== null}
            />
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
              {round.sentence.split('').flatMap((character, index) => {
                let state = 'pending'
                if (skippedIndices.has(index)) state = 'skipped'
                else if (index < correctCount) state = 'correct'
                else if (index === correctCount && !finishedAt) state = 'current'

                const targetCharacter = (
                  <span
                    className={'character ' + state}
                    key={'target-' + index}
                    ref={index === correctCount && !hasError ? activeCharacterRef : undefined}
                  >
                    {character}
                  </span>
                )

                if (index !== correctCount || !hasError) return [targetCharacter]

                const errors = wrongCharacters.split('').map((wrongCharacter, wrongIndex) => (
                  <span
                    className='character wrong typed-wrong'
                    key={'wrong-' + index + '-' + wrongIndex}
                    ref={wrongIndex === wrongCharacters.length - 1 ? activeCharacterRef : undefined}
                  >
                    {wrongCharacter}
                  </span>
                ))

                return [...errors, targetCharacter]
              })}
            </div>
          </div>

          <input
            ref={inputRef}
            className="typing-input"
            value={typed}
            onChange={(event) => handleInput(event.target.value)}
            onKeyDown={handleTypingKeyDown}
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
              {startedAt === null
                ? 'Tap here and start typing'
                : hasError
                  ? 'Backspace ' + wrongCharacters.length
                    + ' wrong letter' + (wrongCharacters.length === 1 ? '' : 's')
                    + ', or press Space to skip'
                  : 'Keep going'}
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
          <ThemeButton theme={theme} onToggle={toggleTheme} />
          <span className="account-name">@{user.username}</span>
          {!user.isGuest && (
            <button className="text-button" onClick={() => setScreen('profile')}>Profile & store</button>
          )}
          <button className="text-button" onClick={logout}>Log out</button>
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
            <div className="racer-identity">
              <span>Racing as</span>
              <strong>@{user.username}</strong>
            </div>
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
