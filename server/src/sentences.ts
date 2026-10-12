import sentenceData from './sentences.json' with { type: 'json' }

export const PACK_LABELS = {
  'movie-quotes': 'Movie Quotes',
  'famous-lines': 'Famous Lines',
  'rap-lyrics': 'Rap Lines',
  'everyday-funny': 'Everyday Funny',
} as const

export type PackId = keyof typeof PACK_LABELS

const MAX_SENTENCE_LENGTH = 200

const sentencePacks = Object.fromEntries(
  Object.entries(sentenceData).map(([packId, sentences]) => [
    packId,
    sentences.filter((sentence) => sentence.length <= MAX_SENTENCE_LENGTH),
  ]),
) as Record<PackId, string[]>

export function isPackId(value: string): value is PackId {
  return value in PACK_LABELS
}

export function getRandomSentence(packId: PackId, excludedSentence?: string): string {
  const sentences = sentencePacks[packId]
  const candidates = sentences.filter((sentence) => sentence !== excludedSentence)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export function getPracticeText(packId: PackId, wordCount: number): string {
  const sentences = sentencePacks[packId]
  const words: string[] = []
  let previousIndex = -1

  while (words.length < wordCount) {
    let sentenceIndex = Math.floor(Math.random() * sentences.length)
    if (sentences.length > 1 && sentenceIndex === previousIndex) {
      sentenceIndex = (sentenceIndex + 1) % sentences.length
    }

    words.push(...sentences[sentenceIndex].split(/\s+/))
    previousIndex = sentenceIndex
  }

  return words.slice(0, wordCount).join(' ')
}

export function getPackSummaries() {
  return Object.entries(PACK_LABELS).map(([id, label]) => ({
    id,
    label,
    count: sentencePacks[id as PackId].length,
  }))
}

export function getRandomRaceSentence() {
  const packIds = Object.keys(PACK_LABELS) as PackId[]
  const packId = packIds[Math.floor(Math.random() * packIds.length)]

  return {
    packId,
    packLabel: PACK_LABELS[packId],
    sentence: getRandomSentence(packId),
  }
}
