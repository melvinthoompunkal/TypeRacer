type PracticePackId =
  | 'movie-quotes'
  | 'famous-lines'
  | 'rap-lyrics'
  | 'everyday-funny'

type Topic = {
  subject: string
  obstacle: string
  action: string
  result: string
}

const pick = <T>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)]

const movieNames = ['Mara', 'Rowan', 'Eli', 'Nora', 'Sasha', 'Theo', 'June', 'Miles']
const moviePlaces = [
  'silent station',
  'deserted theater',
  'harbor at midnight',
  'hotel beneath the cliffs',
  'last diner in town',
  'museum after closing',
]
const movieWeather = [
  'the evening rain began',
  'fog covered the street',
  'the city lights went dark',
  'a distant storm rolled in',
  'the first snow started falling',
]
const movieObjects = [
  'a folded map',
  'an unmarked key',
  'a weathered photograph',
  'a sealed blue envelope',
  'an old train ticket',
]
const movieDestinations = [
  'a road beyond the city',
  'a room hidden below the lobby',
  'an island missing from every chart',
  'a platform with no number',
  'a house at the edge of the woods',
]

function moviePassage(): string[] {
  const name = pick(movieNames)
  const place = pick(moviePlaces)
  const object = pick(movieObjects)
  const destination = pick(movieDestinations)

  return [
    name + ' reached the ' + place + ' just as ' + pick(movieWeather) + '.',
    'Inside, ' + object + ' waited in plain sight, exactly where the message had promised.',
    name + ' examined it carefully and discovered directions toward ' + destination + '.',
    'Before there was time to leave, footsteps echoed from somewhere nearby.',
    'Instead of hiding, ' + name + ' stepped into the open and asked who was there.',
    'A stranger appeared, smiled knowingly, and said the real journey had already begun.',
  ]
}

const famousTopics: Topic[] = [
  {
    subject: 'courage',
    obstacle: 'waiting for every doubt to disappear',
    action: 'taking one honest step while uncertainty is still present',
    result: 'each small decision makes the next brave choice easier',
  },
  {
    subject: 'patience',
    obstacle: 'mistaking slow progress for no progress at all',
    action: 'giving worthwhile work enough time to develop',
    result: 'steady effort eventually becomes visible change',
  },
  {
    subject: 'curiosity',
    obstacle: 'assuming the first answer must be the complete one',
    action: 'asking a better question and listening closely to the reply',
    result: 'an ordinary moment can open into a larger discovery',
  },
  {
    subject: 'kindness',
    obstacle: 'believing a small gesture cannot matter very much',
    action: 'noticing what another person needs and responding with care',
    result: 'one thoughtful act can travel farther than anyone expects',
  },
  {
    subject: 'discipline',
    obstacle: 'depending on inspiration to arrive at the perfect time',
    action: 'returning to the work through simple and repeatable habits',
    result: 'quiet consistency builds what occasional intensity cannot',
  },
]

function famousPassage(): string[] {
  const topic = pick(famousTopics)
  const capitalizedSubject = topic.subject[0].toUpperCase() + topic.subject.slice(1)
  const opening = pick([
    'People often speak about ' + topic.subject + ' as if it arrives all at once.',
    capitalizedSubject + ' rarely announces itself with a dramatic moment.',
  ])

  return [
    opening,
    'In practice, the greater challenge is ' + topic.obstacle + '.',
    'A more useful approach begins with ' + topic.action + '.',
    'That choice may seem modest, but it changes the direction of the day.',
    'With time, ' + topic.result + '.',
    'The lesson lasts because it can be practiced instead of merely remembered.',
  ]
}

const rapPlaces = [
  'under the station lights',
  'at the back of the room',
  'where the late bus turns',
  'on a rain-soaked block',
  'beside an open window',
]
const rapSounds = [
  'a kick drum in my headphones',
  'the rain tapping time',
  'a bass line through the floor',
  'the night train keeping rhythm',
  'my heartbeat setting the tempo',
]
const rapGoals = [
  'turn a rough draft into something clear',
  'build a new path from the words I choose',
  'leave every tired excuse behind',
  'make tomorrow hear me coming',
  'give an unfinished dream a voice',
]

function rapPassage(): string[] {
  const place = pick(rapPlaces)
  const sound = pick(rapSounds)
  const goal = pick(rapGoals)

  return [
    'I start ' + place + ', with ' + sound + ' and a page in my hand.',
    'The first line lands softly, then the next one learns to stand.',
    'I follow that rhythm because I know where I want it to go.',
    'Tonight I plan to ' + goal + '.',
    'Every mistake becomes material, so no hard lesson goes to waste.',
    'By the final bar, I move with more direction and a little more grace.',
  ]
}

const funnyProblems = [
  {
    object: 'coffee maker',
    failure: 'blinked twice and refused to brew anything',
    fix: 'pressed every button in an order that felt scientific',
    escalation: 'it produced half a cup and a noise like a tiny tractor',
  },
  {
    object: 'printer',
    failure: 'declared a paper jam without containing any paper',
    fix: 'opened every little door and offered calm encouragement',
    escalation: 'it printed an old grocery list from three months ago',
  },
  {
    object: 'robot vacuum',
    failure: 'trapped itself under a chair and began calling for help',
    fix: 'moved the chair and pointed it toward the open floor',
    escalation: 'it escaped, turned around, and returned to the same chair',
  },
  {
    object: 'smart speaker',
    failure: 'misheard one request and started playing whale sounds',
    fix: 'repeated the command slowly with perfect pronunciation',
    escalation: 'it raised the volume and added thunder to the whales',
  },
  {
    object: 'refrigerator',
    failure: 'started beeping as though it had urgent news',
    fix: 'checked every shelf and closed the door with great ceremony',
    escalation: 'it waited five seconds before resuming the announcement',
  },
]

function funnyPassage(): string[] {
  const problem = pick(funnyProblems)

  return [
    'This morning, my ' + problem.object + ' ' + problem.failure + '.',
    'I ' + problem.fix + ', which briefly appeared to solve the problem.',
    'Then ' + problem.escalation + '.',
    'I searched online and found twelve confident answers that contradicted one another.',
    'After a serious negotiation, I unplugged everything and counted to ten.',
    'The machine now works perfectly, although it has clearly won the argument.',
  ]
}

const passageGenerators: Record<PracticePackId, () => string[]> = {
  'movie-quotes': moviePassage,
  'famous-lines': famousPassage,
  'rap-lyrics': rapPassage,
  'everyday-funny': funnyPassage,
}

const bridges: Record<PracticePackId, readonly string[]> = {
  'movie-quotes': [
    'Elsewhere, another scene was already beginning.',
    'Meanwhile, a different story was unfolding across town.',
  ],
  'famous-lines': [
    'That reflection leads naturally to another idea.',
    'The same principle becomes clearer from another point of view.',
  ],
  'rap-lyrics': [
    'The beat changes, and the next verse carries the thought forward.',
    'A new rhythm enters, but the same purpose stays in motion.',
  ],
  'everyday-funny': [
    'That should have ended the problem, but the day had other plans.',
    'Things became peaceful for almost a minute before the next incident.',
  ],
}

type ClosingLength = 3 | 4 | 5 | 6 | 7

const closings: Record<
  PracticePackId,
  Record<ClosingLength, readonly string[]>
> = {
  'movie-quotes': {
    3: ['The journey continued.', 'Another scene began.'],
    4: ['The journey continued onward.', 'Another scene quietly began.'],
    5: ['The next choice changed everything.', 'The open road promised answers.'],
    6: ['The hidden message finally became clear.', 'They carried the secret into morning.'],
    7: [
      'At sunrise, they understood the hidden message.',
      'The road ahead promised one more surprise.',
    ],
  },
  'famous-lines': {
    3: ['The lesson remained.', 'That idea endured.'],
    4: ['The lesson still remained.', 'That simple idea endured.'],
    5: ['Practice gave the lesson meaning.', 'That idea deserved more attention.'],
    6: [
      'The lesson grew clearer through practice.',
      'Thoughtful action gave the idea meaning.',
    ],
    7: [
      'The lesson grew clearer through steady practice.',
      'Action gave the simple idea lasting meaning.',
    ],
  },
  'rap-lyrics': {
    3: ['The rhythm continued.', 'My purpose remained.'],
    4: ['The rhythm rolled onward.', 'My purpose stayed clear.'],
    5: ['Each beat carried me forward.', 'My voice found its direction.'],
    6: [
      'Each new beat carried me forward.',
      'The final rhyme gave me direction.',
    ],
    7: [
      'Each new beat carried the verse forward.',
      'The final rhyme gave my thoughts direction.',
    ],
  },
  'everyday-funny': {
    3: ['The chaos continued.', 'Nothing stayed fixed.'],
    4: ['The chaos somehow continued.', 'Nothing stayed fixed long.'],
    5: ['At least the toaster behaved.', 'Then another appliance demanded attention.'],
    6: [
      'At least the toaster behaved today.',
      'Then yet another appliance demanded attention.',
    ],
    7: [
      'At least the toaster behaved until lunchtime.',
      'Then yet another appliance politely demanded attention.',
    ],
  },
}

const recentPracticeText = new Map<PracticePackId, string>()
const recentCompetitiveText = new Map<PracticePackId, string>()

function countWords(text: string): number {
  return text.split(/\s+/).length
}

function makeClosing(packId: PracticePackId, wordCount: number): string[] {
  const sentences: string[] = []
  let remaining = wordCount
  let previousSentence = ''

  while (remaining > 0) {
    let length = Math.min(7, remaining)
    if (remaining - length === 1 || remaining - length === 2) {
      length = remaining - 3
    }

    const options = closings[packId][length as ClosingLength]
    const freshOptions = options.filter((sentence) => sentence !== previousSentence)
    const sentence = pick(freshOptions.length > 0 ? freshOptions : options)
    sentences.push(sentence)
    previousSentence = sentence
    remaining -= length
  }

  return sentences
}

function buildText(packId: PracticePackId, wordCount: number): string {
  const candidates: string[] = []
  let generatedWords = 0

  while (generatedWords < wordCount) {
    if (candidates.length > 0) candidates.push(pick(bridges[packId]))
    candidates.push(...passageGenerators[packId]())
    generatedWords = candidates.reduce((total, sentence) => total + countWords(sentence), 0)
  }

  const sentences: string[] = []
  let remaining = wordCount

  for (const sentence of candidates) {
    const sentenceWords = countWords(sentence)
    const wordsAfterSentence = remaining - sentenceWords

    if (wordsAfterSentence < 0 || wordsAfterSentence === 1 || wordsAfterSentence === 2) {
      break
    }

    sentences.push(sentence)
    remaining = wordsAfterSentence
    if (remaining === 0) break
  }

  if (remaining > 0) sentences.push(...makeClosing(packId, remaining))
  return sentences.join(' ')
}

export function generatePracticeText(packId: PracticePackId, wordCount: number): string {
  let text = buildText(packId, wordCount)

  // The combinations are numerous, and rerolling makes an immediate duplicate
  // vanishingly unlikely even for the shortest exercise.
  for (let attempt = 0; attempt < 8 && text === recentPracticeText.get(packId); attempt += 1) {
    text = buildText(packId, wordCount)
  }

  recentPracticeText.set(packId, text)
  return text
}

function buildCompetitiveText(packId: PracticePackId) {
  const passage = passageGenerators[packId]()
  const sentenceCount = Math.random() < 0.5 ? 2 : 3
  const maximumStart = passage.length - sentenceCount
  const start = Math.floor(Math.random() * (maximumStart + 1))
  return passage.slice(start, start + sentenceCount).join(' ')
}

export function generateCompetitiveText(packId: PracticePackId): string {
  let text = buildCompetitiveText(packId)

  for (
    let attempt = 0;
    attempt < 8 && text === recentCompetitiveText.get(packId);
    attempt += 1
  ) {
    text = buildCompetitiveText(packId)
  }

  recentCompetitiveText.set(packId, text)
  return text
}
