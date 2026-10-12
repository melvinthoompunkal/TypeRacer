import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBotCenterWpm,
  getBotCharacterDelay,
  getBotTargetWpms,
} from '../src/botSimulator.js'

test('new racers receive an easier, peer, and stretch bot', () => {
  assert.deepEqual(getBotTargetWpms([1_000], 3), [36, 42, 48])
})

test('bot speeds rise with skill rating', () => {
  assert.deepEqual(getBotTargetWpms([1_600], 3), [70, 76, 82])
  assert.deepEqual(getBotTargetWpms([2_000], 3), [93, 99, 105])
})

test('mixed-human rooms use the median rating and available bot slots', () => {
  assert.deepEqual(getBotTargetWpms([800, 1_200], 2), [36, 48])
  assert.deepEqual(getBotTargetWpms([800, 1_200, 2_000], 1), [53])
})

test('bot targets respect the 28 to 120 WPM limits', () => {
  assert.deepEqual(getBotTargetWpms([0], 3), [29, 35, 41])
  assert.deepEqual(getBotTargetWpms([10_000], 3), [108, 114, 120])
  assert.equal(getBotCenterWpm(Number.NaN), 42)
})

test('an empty or invalid lobby falls back safely', () => {
  assert.deepEqual(getBotTargetWpms([], 3), [36, 42, 48])
  assert.deepEqual(getBotTargetWpms([Number.NaN], 1), [42])
  assert.deepEqual(getBotTargetWpms([1_000], 0), [])
})

test('bot character delay offsets human-like pauses to preserve displayed WPM', () => {
  assert.ok(Math.abs(getBotCharacterDelay(76) - 134.9) < 0.1)
  assert.ok(Math.abs(getBotCharacterDelay(120) - 77) < 0.1)
})
