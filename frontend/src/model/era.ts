/**
 * Ergonomic risk analysis (ERA) bands as used in the Magna layouts:
 * 0–20 gering, 21–35 mäßig, 36–55 hoch, 56–80 sehr hoch.
 */
export function eraBand(points: number): { label: string; level: 1 | 2 | 3 | 4 } {
  if (points <= 20) return { label: 'gering', level: 1 }
  if (points <= 35) return { label: 'mäßig', level: 2 }
  if (points <= 55) return { label: 'hoch', level: 3 }
  return { label: 'sehr hoch', level: 4 }
}
