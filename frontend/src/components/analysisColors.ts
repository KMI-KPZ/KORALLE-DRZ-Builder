/** Colour of a node reached by a disturbance, by number of steps from the origin. */
export function hitColor(distance: number): string {
  if (distance <= 1) return 'var(--status-critical)'
  if (distance === 2) return 'var(--status-serious)'
  return 'var(--status-warning)'
}

/** Status colours are identical in both themes, so fixed inks keep badges readable. */
export function hitInk(distance: number): string {
  return distance >= 3 ? '#161513' : '#ffffff'
}

export const HIT_SCALE = [
  { label: '1 Schritt', distance: 1 },
  { label: '2 Schritte', distance: 2 },
  { label: '3+ Schritte', distance: 3 },
]
