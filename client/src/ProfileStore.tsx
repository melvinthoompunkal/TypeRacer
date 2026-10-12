import { useEffect, useState } from 'react'
import {
  RaceCar,
  SoundButton,
  ThemeButton,
  type ColorTheme,
} from './gamePolish'

type Profile = {
  elo: number
  credits: number
  racesPlayed: number
  wins: number
  podiums: number
  equippedCar: string
  ownedCars: string[]
}

type StoreCar = {
  id: string
  name: string
  price: number
  description: string
  color: string
  accent: string
}

type ProfileResponse = {
  profile?: Profile
  cars?: StoreCar[]
  error?: string
}

type ProfileStoreProps = {
  username: string
  soundEnabled: boolean
  onToggleSound: () => void
  theme: ColorTheme
  onToggleTheme: () => void
  onBack: () => void
  onLogout: () => void
  onCarEquipped: (carId: string) => void
}

function rankForElo(elo: number) {
  if (elo >= 1500) return 'Diamond'
  if (elo >= 1300) return 'Platinum'
  if (elo >= 1150) return 'Gold'
  if (elo >= 950) return 'Silver'
  return 'Bronze'
}

export default function ProfileStore({
  username,
  soundEnabled,
  onToggleSound,
  theme,
  onToggleTheme,
  onBack,
  onLogout,
  onCarEquipped,
}: ProfileStoreProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cars, setCars] = useState<StoreCar[]>([])
  const [loading, setLoading] = useState(true)
  const [workingCar, setWorkingCar] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json() as ProfileResponse
        if (!response.ok || !payload.profile || !payload.cars) {
          throw new Error(payload.error ?? 'Could not load your profile.')
        }
        setProfile(payload.profile)
        setCars(payload.cars)
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Could not load your profile.')
      })
      .finally(() => setLoading(false))
  }, [])

  const updateCar = async (carId: string, action: 'purchase' | 'equip') => {
    setWorkingCar(carId)
    setError('')
    try {
      const response = await fetch(`/api/profile/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ carId }),
      })
      const payload = await response.json() as ProfileResponse
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error ?? `Could not ${action} that car.`)
      }
      setProfile(payload.profile)
      if (action === 'equip') onCarEquipped(carId)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The store request failed.')
    } finally {
      setWorkingCar('')
    }
  }

  const winRate = profile?.racesPlayed
    ? Math.round((profile.wins / profile.racesPlayed) * 100)
    : 0

  return (
    <main className="app-shell profile-shell">
      <nav className="topbar">
        <button className="brand brand-button" onClick={onBack} aria-label="Back to home">
          <span className="brand-mark">T</span>
          <span>TypeRacer</span>
        </button>
        <div className="nav-actions">
          <SoundButton enabled={soundEnabled} onToggle={onToggleSound} />
          <ThemeButton theme={theme} onToggle={onToggleTheme} />
          <span className="account-name">@{username}</span>
          <button className="text-button" onClick={onLogout}>Log out</button>
          <button className="text-button" onClick={onBack}>Back home</button>
        </div>
      </nav>

      <section className="profile-heading">
        <div>
          <span className="eyebrow">Racer profile</span>
          <h1>@{username}</h1>
          <p>Race clean, climb the ranks, and turn your winnings into a faster-looking garage.</p>
        </div>
        {profile && (
          <div className="credit-balance">
            <span>Race credits</span>
            <strong>{profile.credits}</strong>
          </div>
        )}
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && <div className="profile-loading">Loading your garage…</div>}

      {profile && (
        <>
          <section className="profile-stats" aria-label="Racing statistics">
            <article className="rank-card">
              <span>Competitive rank</span>
              <strong>{rankForElo(profile.elo)}</strong>
              <small>{profile.elo} ELO</small>
            </article>
            <article><span>Races</span><strong>{profile.racesPlayed}</strong></article>
            <article><span>Wins</span><strong>{profile.wins}</strong></article>
            <article><span>Podiums</span><strong>{profile.podiums}</strong></article>
            <article><span>Win rate</span><strong>{winRate}%</strong></article>
          </section>

          <section className="garage-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">The garage</span>
                <h2>Choose your ride</h2>
              </div>
              <span>{profile.ownedCars.length}/{cars.length} owned</span>
            </div>

            <div className="car-store-grid">
              {cars.map((car) => {
                const owned = profile.ownedCars.includes(car.id)
                const equipped = profile.equippedCar === car.id
                const busy = workingCar === car.id
                return (
                  <article className={equipped ? 'store-car equipped' : 'store-car'} key={car.id}>
                    <div className="store-car-preview">
                      <div className="preview-road" />
                      <RaceCar progress={50} carId={car.id} />
                    </div>
                    <div className="store-car-copy">
                      <div>
                        <h3>{car.name}</h3>
                        <span>{car.price === 0 ? 'Starter car' : `${car.price} credits`}</span>
                      </div>
                      <p>{car.description}</p>
                    </div>
                    {equipped ? (
                      <button className="secondary-button" disabled>Equipped</button>
                    ) : owned ? (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => updateCar(car.id, 'equip')}
                      >
                        {busy ? 'Equipping…' : 'Equip'}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={busy || profile.credits < car.price}
                        onClick={() => updateCar(car.id, 'purchase')}
                      >
                        {busy
                          ? 'Purchasing…'
                          : profile.credits < car.price ? 'Not enough credits' : `Buy for ${car.price}`}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
