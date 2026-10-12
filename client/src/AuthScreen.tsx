import { useState, type FormEvent } from 'react'
import { ThemeButton, type ColorTheme } from './gamePolish'

export type AuthUser = {
  id: string
  username: string
  isGuest: boolean
  equippedCar: string
}

type AuthScreenProps = {
  initialError?: string
  theme: ColorTheme
  onToggleTheme: () => void
  onAuthenticated: (user: AuthUser) => void
}

export default function AuthScreen({
  initialError = '',
  theme,
  onToggleTheme,
  onAuthenticated,
}: AuthScreenProps) {
  const [mode, setMode] = useState<'guest' | 'login' | 'register'>('guest')
  const [guestName, setGuestName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [submitting, setSubmitting] = useState(false)

  const switchMode = (nextMode: 'guest' | 'login' | 'register') => {
    setMode(nextMode)
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json() as { user?: AuthUser; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? 'Could not sign in. Please try again.')
      }
      onAuthenticated(payload.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  const continueAsGuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: guestName }),
      })
      const payload = await response.json() as { user?: AuthUser; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? 'Could not start a guest session.')
      }
      onAuthenticated(payload.user)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not continue as guest.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell auth-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>TypeRacer</span>
        </div>
        <ThemeButton theme={theme} onToggle={onToggleTheme} />
      </nav>

      <section className="auth-layout">
        <div className="auth-intro">
          <span className="eyebrow">Your place on the grid</span>
          <h1>Race under<br /><em>your own name.</em></h1>
          <p>Choose a name and start racing immediately. Creating an account is completely optional.</p>
        </div>

        <div className="auth-card">
          {mode !== 'guest' && (
            <div className="auth-tabs" role="tablist" aria-label="Account action">
              <button
                type="button"
                className={mode === 'login' ? 'selected' : ''}
                onClick={() => switchMode('login')}
                role="tab"
                aria-selected={mode === 'login'}
              >
                Log in
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'selected' : ''}
                onClick={() => switchMode('register')}
                role="tab"
                aria-selected={mode === 'register'}
              >
                Create account
              </button>
            </div>
          )}

          <div className="auth-heading">
            <span className="eyebrow">
              {mode === 'guest' ? 'Quick play' : mode === 'login' ? 'Welcome back' : 'Join the race'}
            </span>
            <h2>
              {mode === 'guest'
                ? 'Pick a racer name'
                : mode === 'login' ? 'Log in' : 'Create your account'}
            </h2>
            <p>
              {mode === 'guest'
                ? 'No account or password needed.'
                : mode === 'login' ? 'Pick up where you left off.' : 'Save your racer identity.'}
            </p>
          </div>

          {error && <div className="error-banner" role="alert">{error}</div>}

          {mode === 'guest' ? (
            <>
              <form className="auth-form" onSubmit={continueAsGuest}>
                <label>
                  <span>Racer name</span>
                  <input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value.slice(0, 18))}
                    autoComplete="nickname"
                    maxLength={18}
                    placeholder="What should we call you?"
                    required
                    autoFocus
                  />
                </label>
                <button className="primary-button auth-submit" disabled={submitting}>
                  {submitting ? 'Joining…' : 'Play as guest'}
                </button>
              </form>
              <div className="auth-divider"><span>optional</span></div>
              <button
                type="button"
                className="account-link"
                onClick={() => switchMode('login')}
              >
                Log in or create an account
              </button>
            </>
          ) : (
            <>
              <form className="auth-form" onSubmit={submit}>
                <label>
                  <span>Username</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(
                      event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18),
                    )}
                    autoComplete="username"
                    minLength={3}
                    maxLength={18}
                    placeholder="speedster"
                    required
                    autoFocus
                  />
                  {mode === 'register' && <small>3-18 letters, numbers, or underscores</small>}
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={8}
                    maxLength={128}
                    placeholder="At least 8 characters"
                    required
                  />
                </label>

                <button className="primary-button auth-submit" disabled={submitting}>
                  {submitting
                    ? 'Please wait…'
                    : mode === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>
              <div className="auth-divider"><span>or</span></div>
              <button
                type="button"
                className="account-link"
                onClick={() => switchMode('guest')}
              >
                Back to quick guest play
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
