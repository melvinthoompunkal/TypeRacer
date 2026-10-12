export const MAX_WRONG_CHARACTERS = 5

export function countCorrectPrefix(typed: string, target: string): number {
  let count = 0
  while (count < typed.length && typed[count] === target[count]) count += 1
  return count
}

export function acceptTypingInput(
  current: string,
  rawValue: string,
  target: string,
): { text: string; addedKeystrokes: number; addedCorrect: number } {
  if (rawValue.length <= current.length) {
    return { text: rawValue, addedKeystrokes: 0, addedCorrect: 0 }
  }

  let text = current
  let wrongCharacters = text.length - countCorrectPrefix(text, target)
  let addedKeystrokes = 0
  let addedCorrect = 0

  for (const character of rawValue.slice(current.length)) {
    if (wrongCharacters >= MAX_WRONG_CHARACTERS) break
    if (wrongCharacters === 0 && text.length >= target.length) break

    const expectedCharacter = target[text.length]
    text += character
    addedKeystrokes += 1

    if (wrongCharacters === 0 && character === expectedCharacter) {
      addedCorrect += 1
    } else {
      wrongCharacters += 1
    }
  }

  return { text, addedKeystrokes, addedCorrect }
}

export function getNextWordStart(target: string, currentIndex: number): number {
  let nextIndex = currentIndex
  while (nextIndex < target.length && target[nextIndex] !== ' ') nextIndex += 1
  while (nextIndex < target.length && target[nextIndex] === ' ') nextIndex += 1
  return nextIndex
}
