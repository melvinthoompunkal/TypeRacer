import type { CSSProperties } from 'react'

type SoundKind = 'type' | 'backspace' | 'countdown' | 'go' | 'error' | 'finish' | 'win'
export type ColorTheme = 'light' | 'dark'

let audioContext: AudioContext | null = null

function getAudioContext() {
  audioContext ??= new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

function tone(
  context: AudioContext,
  frequency: number,
  startsIn: number,
  duration: number,
  volume = 0.045,
) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const start = context.currentTime + startsIn

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function keyClick(context: AudioContext, backspace = false) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const start = context.currentTime
  const frequency = backspace
    ? 520 + Math.random() * 90
    : 1_050 + Math.random() * 260

  oscillator.type = backspace ? 'triangle' : 'square'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(backspace ? 0.022 : 0.018, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + (backspace ? 0.035 : 0.022))
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + (backspace ? 0.04 : 0.027))
}

export function playGameSound(enabled: boolean, kind: SoundKind) {
  if (!enabled) return

  try {
    const context = getAudioContext()
    if (kind === 'type') keyClick(context)
    if (kind === 'backspace') keyClick(context, true)
    if (kind === 'countdown') tone(context, 440, 0, 0.09)
    if (kind === 'go') {
      tone(context, 660, 0, 0.1)
      tone(context, 880, 0.1, 0.16)
    }
    if (kind === 'error') tone(context, 170, 0, 0.07, 0.025)
    if (kind === 'finish') {
      tone(context, 523, 0, 0.11)
      tone(context, 659, 0.1, 0.11)
      tone(context, 784, 0.2, 0.2)
    }
    if (kind === 'win') {
      tone(context, 523, 0, 0.1)
      tone(context, 659, 0.09, 0.1)
      tone(context, 784, 0.18, 0.1)
      tone(context, 1047, 0.27, 0.28)
    }
  } catch {
    // Sound is a progressive enhancement; unsupported browsers stay silent.
  }
}

export function primeGameAudio() {
  try {
    getAudioContext()
  } catch {
    // Sound is optional.
  }
}

export function SoundButton({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="sound-button"
      type="button"
      onClick={onToggle}
      aria-label={enabled ? 'Mute game sounds' : 'Turn on game sounds'}
      aria-pressed={enabled}
      title={enabled ? 'Mute game sounds' : 'Turn on game sounds'}
    >
      <span aria-hidden="true">{enabled ? '♫' : '♩'}</span>
      <span>{enabled ? 'Sound on' : 'Sound off'}</span>
    </button>
  )
}

export function ThemeButton({
  theme,
  onToggle,
}: {
  theme: ColorTheme
  onToggle: () => void
}) {
  const isDark = theme === 'dark'

  return (
    <button
      className='theme-button'
      type='button'
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span aria-hidden='true'>{isDark ? '☀' : '☾'}</span>
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  )
}

const CAR_COLORS = ['#a15f15', '#222428', '#6e7075', '#a63d40']
const CAR_SKINS: Record<string, { color: string; accent: string }> = {
  classic: { color: CAR_COLORS[0], accent: '#f0c77a' },
  blaze: { color: '#c74732', accent: '#ffd166' },
  volt: { color: '#78a83b', accent: '#dfff72' },
  phantom: { color: '#45356f', accent: '#bd9cff' },
}
const TRAIL_STYLES: Record<string, { color: string; accent: string }> = {
  none: { color: 'transparent', accent: 'transparent' },
  ember: { color: '#e4572e', accent: '#ffc857' },
  ion: { color: '#36d7d9', accent: '#b8ffff' },
  stardust: { color: '#9b72ff', accent: '#f3dcff' },
}

export function racerColor(index: number) {
  return CAR_COLORS[index % CAR_COLORS.length]
}

export function RaceCar({
  progress,
  color = CAR_COLORS[0],
  carId = 'classic',
  trailId = 'none',
  active = false,
  finished = false,
}: {
  progress: number
  color?: string
  carId?: string
  trailId?: string
  active?: boolean
  finished?: boolean
}) {
  const skin = CAR_SKINS[carId] ?? CAR_SKINS.classic
  const trail = TRAIL_STYLES[trailId] ?? TRAIL_STYLES.none
  const carColor = carId === 'classic' ? color : skin.color

  return (
    <span
      className={`race-car car-${carId} trail-${trailId}${active ? ' active' : ''}${finished ? ' finished' : ''}`}
      style={{
        left: `${Math.min(Math.max(progress, 0), 96)}%`,
        '--car-color': carColor,
        '--car-accent': skin.accent,
        '--trail-color': trail.color,
        '--trail-accent': trail.accent,
      } as CSSProperties}
      aria-hidden="true"
    >
      <span className="car-trail"><i /><i /><i /><i /></span>
      <svg viewBox="0 0 64 32" focusable="false">
        <path className="car-shadow" d="M9 25h46v3H9z" />
        <path className="car-body" d="M5 17h10l8-9h19l9 9h7c2 0 4 2 4 4v3H3v-3c0-2 1-4 2-4Z" />
        <path className="car-accent" d="M7 18h48l3 3H5Z" />
        <path className="car-spoiler" d="M47 9h12v3H48Z" />
        <path className="car-window" d="m25 10-6 7h14v-7Zm11 0v7h11l-7-7Z" />
        <circle className="car-wheel" cx="16" cy="24" r="5" />
        <circle className="car-wheel" cx="49" cy="24" r="5" />
        <circle className="car-hub" cx="16" cy="24" r="2" />
        <circle className="car-hub" cx="49" cy="24" r="2" />
      </svg>
    </span>
  )
}
