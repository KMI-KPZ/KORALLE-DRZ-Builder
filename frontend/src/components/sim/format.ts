const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export function fmtNumber(v: number, digits: 0 | 1 | 2 = 1): string {
  if (!Number.isFinite(v)) return '–'
  return (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(v)
}

export function fmtPercent(share: number): string {
  if (!Number.isFinite(share)) return '–'
  const p = share * 100
  return `${p > 0 && p < 1 ? '<1' : nf0.format(p)} %`
}

/** Seconds as "38 s", "4,5 min" or "2 h 05 min". */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '–'
  const s = Math.abs(seconds)
  const sign = seconds < 0 ? '−' : ''
  if (s < 120) return `${sign}${nf0.format(s)} s`
  if (s < 3600) return `${sign}${nf1.format(s / 60)} min`
  const h = Math.floor(s / 3600)
  const m = Math.round((s - h * 3600) / 60)
  return `${sign}${h} h ${String(m).padStart(2, '0')} min`
}

export function fmtTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export function utilLevel(u: number): 'low' | 'mid' | 'high' {
  if (u >= 0.9) return 'high'
  if (u >= 0.7) return 'mid'
  return 'low'
}
