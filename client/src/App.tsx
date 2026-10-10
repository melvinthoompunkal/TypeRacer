import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MultiplayerRace from './MultiplayerRace'

type Screen = 'home' | 'practice' | 'multiplayer'

type Pack = {
  id: string
  label: string
  count: number
}

type PracticeRound = {
  packId: string
  sentence: string
}

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
  const [packs, setPacks] = useState<Pack[]>([])
  const [selectedPack, setSelectedPack] = useState<string | null>(null)
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
  const inputRef = useRef<HTMLInputElement>(null)

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
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [finishedAt, startedAt])

  const loadRound = useCallback(async (packId: string) => {
    setLoading(true)
    setError('')

    try {
      const excludedSentence = round?.packId === packId ? round.sentence : undefined
      const query = excludedSentence
        ? `?exclude=${encodeURIComponent(excludedSentence)}`
        : ''
      const response = await fetch(`/api/practice/${packId}${query}`)
      if (!response.ok) throw new Error('Could not load a sentence.')
      const nextRound = (await response.json()) as PracticeRound

      setRound(nextRound)
      setSelectedPack(packId)
      setTyped('')
      setStartedAt(null)
      setFinishedAt(null)
      setTotalKeystrokes(0)
      setCorrectKeystrokes(0)
      setNow(Date.now())
      setScreen('practice')
      window.setTimeout(() => inputRef.current?.focus(), 50)
    } catch {
      setError('Could not start that round. Check the server and try again.')
    } finally {
      setLoading(false)
    }
  }, [round])

  const correctCount = useMemo(() => {
    if (!round) return 0
    let count = 0
    while (count < typed.length && typed[count] === round.sentence[count]) count += 1
    return count
  }, [round, typed])

  const hasError = Boolean(round && typed.length > correctCount)
  const elapsedMs = startedAt === null ? 0 : (finishedAt ?? now) - startedAt
  const wpm = calculateWpm(correctCount, elapsedMs)
  const accuracy = calculateAccuracy(correctKeystrokes, totalKeystrokes)
  const progress = round ? (correctCount / round.sentence.length) * 100 : 0

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
      window.setTimeout(() => inputRef.current?.blur(), 0)
    }
  }

  const returnHome = () => {
    setScreen('home')
    setRound(null)
    setTyped('')
    setError('')
  }

  const startMultiplayer = () => {
    const name = playerName.trim()
    if (!name) {
      setError('Enter a racer name before joining a quick match.')
      return
    }

    window.localStorage.setItem('type-racer-name', name)
    setPlayerName(name)
    setError('')
    setScreen('multiplayer')
  }

  if (screen === 'multiplayer') {
    return <MultiplayerRace playerName={playerName} onExit={returnHome} />
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
          <button className="text-button" onClick={returnHome}>Exit practice</button>
        </nav>

        <section className="practice-header">
          <div>
            <span className="eyebrow">Solo practice</span>
            <h1>{selectedPackLabel}</h1>
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
            <div><span>Progress</span><strong>{Math.round(progress)}</strong><small>%</small></div>
          </div>

          <div className="track" aria-label={`${Math.round(progress)} percent complete`}>
            <div className="track-fill" style={{ width: `${progress}%` }} />
            <div className="car" style={{ left: `${Math.min(progress, 96)}%` }} aria-hidden="true">🏎️</div>
            <div className="finish-line" aria-hidden="true" />
          </div>

          <div className="sentence" aria-label={round.sentence}>
            {round.sentence.split('').map((character, index) => {
              let state = 'pending'
              if (index < correctCount) state = 'correct'
              else if (index === correctCount && hasError) state = 'wrong'
              else if (index === correctCount && !finishedAt) state = 'current'

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
            aria-label="Type the sentence here"
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
              <h2>Clean run!</h2>
              <p>{wpm} WPM with {accuracy}% accuracy</p>
            </div>
            <button className="primary-button" onClick={() => loadRound(round.packId)} disabled={loading}>
              {loading ? 'Loading…' : 'Next sentence'}
            </button>
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
        <span className="status-pill"><i /> Server online</span>
      </nav>

      <section className="hero">
        <span className="eyebrow">Ready, set, type</span>
        <h1>How fast can your<br /><em>fingers fly?</em></h1>
        <p>Sharpen your speed in solo practice today. Live multiplayer racing is pulling up next.</p>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="mode-grid">
        <article className="mode-card featured">
          <div className="mode-icon">⌨</div>
          <span className="eyebrow">Available now</span>
          <h2>Practice</h2>
          <p>Pick a pack, find your rhythm, and chase a new session best.</p>
          <span className="card-action">Choose a pack <b>→</b></span>
        </article>
        <article className="mode-card race-mode">
          <div className="mode-icon">🏁</div>
          <span className="eyebrow">Live now</span>
          <h2>Race</h2>
          <p>Jump into a quick match and race up to three other typists live.</p>
          <div className="race-join">
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value.slice(0, 18))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') startMultiplayer()
              }}
              placeholder="Your racer name"
              aria-label="Your racer name"
              maxLength={18}
            />
            <button className="primary-button" onClick={startMultiplayer}>Quick match</button>
          </div>
        </article>
      </section>

      <section className="packs-section">
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
              <button className="pack-card" key={pack.id} onClick={() => loadRound(pack.id)} disabled={loading}>
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
