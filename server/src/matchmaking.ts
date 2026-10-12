export const QUICK_MATCH_RATING_WINDOW = 150

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function getQuickMatchRatingDistance(
  joiningRating: number,
  roomRatings: number[],
) {
  const validRoomRatings = roomRatings.filter(Number.isFinite)
  if (!Number.isFinite(joiningRating) || validRoomRatings.length === 0) {
    return Number.POSITIVE_INFINITY
  }
  return Math.abs(joiningRating - median(validRoomRatings))
}

export function isQuickMatchCompatible(
  joiningRating: number,
  roomRatings: number[],
) {
  const validRoomRatings = roomRatings.filter(Number.isFinite)
  if (!Number.isFinite(joiningRating) || validRoomRatings.length === 0) return false
  const combinedRatings = [...validRoomRatings, joiningRating]
  return Math.max(...combinedRatings) - Math.min(...combinedRatings)
    <= QUICK_MATCH_RATING_WINDOW
}
