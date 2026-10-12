import assert from 'node:assert/strict'
import test from 'node:test'
import { getBotCenterWpm, getBotTargetWpms } from '../src/botSimulator.js'

test('new racers receive an easier, peer, and stretch bot', () => {
  assert.deepEqual(getBotTargetWpms([1_000], 3), [35, 42, 49])
})

test('bot speeds rise with skill rating', () => {
  assert.deepEqual(getBotTargetWpms([1_600], 3), [74, 81, 88])
  assert.deepEqual(getBotTargetWpms([2_000], 3), [100, 107, 114])
})

test('mixed-human rooms use the median rating and available bot slots', () => {
  assert.deepEqual(getBotTargetWpms([800, 1_200], 2), [35, 49])
  assert.deepEqual(getBotTargetWpms([800, 1_200, 2_000], 1), [55])
})

test('bot targets respect the 28 to 120 WPM limits', () => {
  assert.deepEqual(getBotTargetWpms([0], 3), [28, 35, 42])
  assert.deepEqual(getBotTargetWpms([10_000], 3), [106, 113, 120])
  assert.equal(getBotCenterWpm(Number.NaN), 42)
})

test('an empty or invalid lobby falls back safely', () => {
  assert.deepEqual(getBotTargetWpms([], 3), [35, 42, 49])
  assert.deepEqual(getBotTargetWpms([Number.NaN], 1), [42])
  assert.deepEqual(getBotTargetWpms([1_000], 0), [])
})
