import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getQuickMatchRatingDistance,
  isQuickMatchCompatible,
  QUICK_MATCH_RATING_WINDOW,
} from '../src/matchmaking.js'

test('quick matches accept nearby ratings and reject mismatched rooms', () => {
  assert.equal(QUICK_MATCH_RATING_WINDOW, 150)
  assert.equal(isQuickMatchCompatible(1_600, [1_500, 1_650]), true)
  assert.equal(isQuickMatchCompatible(1_600, [1_000, 1_100]), false)
  assert.equal(isQuickMatchCompatible(1_600, [1_450, 1_750]), false)
})

test('quick-match distance uses the room median', () => {
  assert.equal(getQuickMatchRatingDistance(1_600, [1_300, 1_550, 1_650]), 50)
  assert.equal(getQuickMatchRatingDistance(1_600, []), Number.POSITIVE_INFINITY)
})
