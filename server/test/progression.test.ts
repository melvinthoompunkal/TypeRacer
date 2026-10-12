import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePlacementElo } from '../src/progression.js'

test('average beginner speed maps to the default 1000 ELO', () => {
  assert.equal(calculatePlacementElo(42, 100), 1_000)
})

test('placement rating rises and falls with effective typing speed', () => {
  assert.equal(calculatePlacementElo(20, 100), 670)
  assert.equal(calculatePlacementElo(60, 100), 1_270)
  assert.equal(calculatePlacementElo(60, 80), 946)
})

test('placement rating stays within the initial rating range', () => {
  assert.equal(calculatePlacementElo(0, 100), 600)
  assert.equal(calculatePlacementElo(200, 100), 1_800)
  assert.equal(calculatePlacementElo(Number.NaN, 100), 600)
})
