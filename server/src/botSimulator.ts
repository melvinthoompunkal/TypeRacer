const BOT_NAMES = [
  'TurboTurtle',
  'KeyWhiz',
  'SpaceBaron',
  'ClicketyClack',
  'CapsLocke',
  'TypeRex',
  'SpeedySpud',
  'PixelPigeon',
  'WaffleWizard',
  'NitroNoodle',
  'CommaChameleon',
  'ShiftSheriff',
  'RocketRaccoon',
  'BongoBytes',
  'DashHound',
  'SyntaxSasquatch',
  'MochiMotion',
  'RapidRadish',
  'ZoomyZebra',
  'QuertyMercury',
]

const DEFAULT_SKILL_RATING = 1_000
const BEGINNER_CENTER_WPM = 42
const MIN_CENTER_WPM = 35
const MAX_CENTER_WPM = 113
const MIN_BOT_WPM = 28
const MAX_BOT_WPM = 120
const RATING_TO_WPM_SLOPE = 0.065
const BOT_SPREAD_WPM = 7

type BotTypingOptions = {
  sentence: string
  targetWpm: number
  isActive: () => boolean
  onText: (text: string) => void
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function wrongCharacter(expected: string) {
  const choices = 'abcdefghijklmnopqrstuvwxyz'
  let character = choices[Math.floor(Math.random() * choices.length)]
  while (character === expected.toLowerCase()) {
    character = choices[Math.floor(Math.random() * choices.length)]
  }
  return character
}

export function getBotCenterWpm(skillRating: number) {
  const rating = Number.isFinite(skillRating) ? skillRating : DEFAULT_SKILL_RATING
  return clamp(
    Math.round(BEGINNER_CENTER_WPM + ((rating - DEFAULT_SKILL_RATING) * RATING_TO_WPM_SLOPE)),
    MIN_CENTER_WPM,
    MAX_CENTER_WPM,
  )
}

export function getBotTargetWpms(humanRatings: number[], botCount: number) {
  const count = Math.max(0, Math.floor(botCount))
  if (count === 0) return []

  const validRatings = humanRatings.filter(Number.isFinite)
  const lobbyRating = validRatings.length > 0
    ? median(validRatings)
    : DEFAULT_SKILL_RATING
  const centerWpm = getBotCenterWpm(lobbyRating)
  const offsets = count === 1
    ? [0]
    : Array.from(
        { length: count },
        (_, index) => -BOT_SPREAD_WPM + ((BOT_SPREAD_WPM * 2 * index) / (count - 1)),
      )

  return offsets.map((offset) => clamp(
    Math.round(centerWpm + offset),
    MIN_BOT_WPM,
    MAX_BOT_WPM,
  ))
}

export function createBotProfile(usedNames: Set<string>, targetWpm: number) {
  const availableNames = BOT_NAMES.filter((name) => !usedNames.has(name.toLowerCase()))
  const namePool = availableNames.length > 0 ? availableNames : BOT_NAMES

  return {
    name: namePool[Math.floor(Math.random() * namePool.length)],
    targetWpm: clamp(Math.round(targetWpm), MIN_BOT_WPM, MAX_BOT_WPM),
  }
}

export function startBotTyping({
  sentence,
  targetWpm,
  isActive,
  onText,
}: BotTypingOptions) {
  const timers = new Set<NodeJS.Timeout>()
  const baseDelay = 12_000 / targetWpm
  let typedText = ''
  let stopped = false

  const schedule = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      callback()
    }, delay)
    timers.add(timer)
  }

  const typeNextCharacter = () => {
    if (stopped || !isActive() || typedText === sentence) return

    const expected = sentence[typedText.length]
    if (Math.random() < 0.02) {
      onText(typedText + wrongCharacter(expected))
      schedule(() => {
        if (stopped || !isActive()) return
        onText(typedText)
        schedule(typeNextCharacter, randomBetween(90, 220))
      }, randomBetween(180, 430))
      return
    }

    typedText += expected
    onText(typedText)
    if (typedText === sentence) return

    let delay = baseDelay * randomBetween(0.62, 1.38)
    if (/[,.!?;:]/.test(expected)) delay += randomBetween(120, 330)
    if (Math.random() < 0.055) delay += randomBetween(250, 780)
    schedule(typeNextCharacter, delay)
  }

  schedule(typeNextCharacter, randomBetween(80, 280))

  return () => {
    stopped = true
    timers.forEach((timer) => clearTimeout(timer))
    timers.clear()
  }
}
