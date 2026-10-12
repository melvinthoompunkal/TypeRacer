import sentenceData from './sentences.json' with { type: 'json' }
import { generateCompetitiveText, generatePracticeText } from './practiceText.js'

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
  return generatePracticeText(packId, wordCount)
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
    sentence: generateCompetitiveText(packId),
  }
}
