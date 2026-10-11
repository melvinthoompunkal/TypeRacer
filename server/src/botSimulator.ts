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

type BotTypingOptions = {
  sentence: string
  targetWpm: number
  isActive: () => boolean
  onText: (text: string) => void
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum)
}

function wrongCharacter(expected: string) {
  const choices = 'abcdefghijklmnopqrstuvwxyz'
  let character = choices[Math.floor(Math.random() * choices.length)]
  while (character === expected.toLowerCase()) {
    character = choices[Math.floor(Math.random() * choices.length)]
  }
  return character
}

export function createBotProfile(usedNames: Set<string>) {
  const availableNames = BOT_NAMES.filter((name) => !usedNames.has(name.toLowerCase()))
  const namePool = availableNames.length > 0 ? availableNames : BOT_NAMES

  return {
    name: namePool[Math.floor(Math.random() * namePool.length)],
    targetWpm: Math.floor(randomBetween(60, 91)),
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
