import type { CSSProperties } from 'react'

type SoundKind = 'countdown' | 'go' | 'error' | 'finish' | 'win'

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

export function playGameSound(enabled: boolean, kind: SoundKind) {
  if (!enabled) return

  try {
    const context = getAudioContext()
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

const CAR_COLORS = ['#b5f53d', '#9d7bff', '#4dd7ff', '#ff8a5b']

export function racerColor(index: number) {
  return CAR_COLORS[index % CAR_COLORS.length]
}

export function RaceCar({
  progress,
  color = CAR_COLORS[0],
  active = false,
  finished = false,
}: {
  progress: number
  color?: string
  active?: boolean
  finished?: boolean
}) {
  return (
    <span
      className={`race-car${active ? ' active' : ''}${finished ? ' finished' : ''}`}
      style={{
        left: `${Math.min(Math.max(progress, 0), 96)}%`,
        '--car-color': color,
      } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 32" focusable="false">
        <path className="car-shadow" d="M9 25h46v3H9z" />
        <path className="car-body" d="M5 17h10l8-9h19l9 9h7c2 0 4 2 4 4v3H3v-3c0-2 1-4 2-4Z" />
        <path className="car-window" d="m25 10-6 7h14v-7Zm11 0v7h11l-7-7Z" />
        <circle className="car-wheel" cx="16" cy="24" r="5" />
        <circle className="car-wheel" cx="49" cy="24" r="5" />
        <circle className="car-hub" cx="16" cy="24" r="2" />
        <circle className="car-hub" cx="49" cy="24" r="2" />
      </svg>
    </span>
  )
}
