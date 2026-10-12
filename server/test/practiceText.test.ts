import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCompetitiveText } from '../src/practiceText.js'

const packIds = [
  'movie-quotes',
  'famous-lines',
  'rap-lyrics',
  'everyday-funny',
] as const

test('competitive prompts contain two or three complete sentences', () => {
  for (const packId of packIds) {
    for (let sample = 0; sample < 50; sample += 1) {
      const text = generateCompetitiveText(packId)
      const sentenceCount = text.match(/[.!?](?:\s|$)/g)?.length ?? 0

      assert.ok(
        sentenceCount === 2 || sentenceCount === 3,
        `${packId} generated ${sentenceCount} sentences: ${text}`,
      )
    }
  }
})
