import assert from 'node:assert/strict'
import test from 'node:test'
import { generateCompetitiveText, generatePracticeText } from '../src/practiceText.js'

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

test('random word practice has an exact count and no punctuation', () => {
  for (const wordCount of [10, 25, 50, 100, 500]) {
    const text = generatePracticeText('random-words', wordCount)
    const words = text.split(' ')

    assert.equal(words.length, wordCount)
    assert.match(text, /^[a-z]+(?: [a-z]+)*$/)
    assert.equal(words.some((word, index) => word === words[index - 1]), false)
  }
})

test('content practice keeps the requested word count', () => {
  for (const packId of packIds) {
    for (const wordCount of [10, 25, 50, 100, 500]) {
      for (let sample = 0; sample < 20; sample += 1) {
        assert.equal(
          generatePracticeText(packId, wordCount).split(/\s+/).length,
          wordCount,
        )
      }
    }
  }
})

test('competitive prompts avoid recently served repeats', () => {
  for (const packId of packIds) {
    const prompts = Array.from(
      { length: 30 },
      () => generateCompetitiveText(packId),
    )

    assert.equal(new Set(prompts).size, prompts.length)
  }
})
