import { createElement, type CSSProperties } from 'react'
import { CATEGORY_META, findModuleType } from '../model/catalog'
import { iconFor } from './icons'

/** Coloured tile with the icon of a module type. */
export function TypeIcon({
  typeId,
  size = 'normal',
  outline = false,
}: {
  typeId: string
  size?: 'normal' | 'small'
  outline?: boolean
}) {
  const type = findModuleType(typeId)
  const colorVar = type ? CATEGORY_META[type.category].colorVar : '--cat-struktur'
  const style = { '--cat': `var(${colorVar})` } as CSSProperties
  const cls = ['type-icon', size === 'small' && 'type-icon--small', outline && 'type-icon--outline']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} style={style} aria-hidden="true">
      {createElement(iconFor(type?.icon ?? 'Boxes'), { size: size === 'small' ? 12 : 15, strokeWidth: 2.1 })}
    </span>
  )
}
