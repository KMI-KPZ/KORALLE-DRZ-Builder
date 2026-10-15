import { useReactFlow } from '@xyflow/react'
import { Search, X } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { CATEGORY_META, CATEGORY_ORDER, MODULE_TYPES } from '../model/catalog'
import { DRZ_KINDS, type DrzKind } from '../model/drzCatalog'
import { useModelStore } from '../store/useModelStore'
import { useUiStore } from '../store/useUiStore'
import { DND_DRZ_KIND, DND_TYPE } from './dnd'
import { TypeIcon } from './Icon'

interface Entry {
  key: string
  typeId: string
  label: string
  description: string
  drzKind?: DrzKind
}

export function Palette() {
  const [query, setQuery] = useState('')
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const { screenToFlowPosition } = useReactFlow()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (e: Entry) => !q || `${e.label} ${e.description}`.toLowerCase().includes(q)
    return CATEGORY_ORDER.map((cat) => {
      let entries: Entry[]
      if (cat === 'drz') {
        entries = DRZ_KINDS.map((k) => ({ key: `drz-${k.id}`, typeId: 'drz', label: k.label, description: k.description, drzKind: k }))
      } else {
        entries = MODULE_TYPES.filter((t) => t.category === cat).map((t) => ({
          key: t.id,
          typeId: t.id,
          label: t.label,
          description: t.description,
        }))
      }
      return { cat, entries: entries.filter(match) }
    }).filter((g) => g.entries.length > 0)
  }, [query])

  const onDragStart = (event: DragEvent, entry: Entry) => {
    event.dataTransfer.setData(DND_TYPE, entry.typeId)
    if (entry.drzKind) event.dataTransfer.setData(DND_DRZ_KIND, entry.drzKind.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  // Click (or keyboard) adds the module in the middle of the visible canvas.
  const addAtCenter = (entry: Entry) => {
    const store = useModelStore.getState()
    if (store.view !== 'canvas') store.setView('canvas')
    const el = document.querySelector('.canvas-wrap')
    const rect = el?.getBoundingClientRect()
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 }
    store.addNode(
      entry.typeId,
      { x: center.x - 105, y: center.y - 30 },
      entry.drzKind
        ? { label: entry.drzKind.label, properties: { drzKind: entry.drzKind.id, status: 'geplant' } }
        : undefined,
    )
    setOpen(false)
    useUiStore.getState().setInspectorTab('eigenschaften')
  }

  return (
    <aside className={`panel panel--left${open ? ' is-open' : ''}`} aria-label="Baukasten-Katalog">
      <div className="palette">
        <div className="palette__head">
          <div className="palette__title-row">
            <h2 className="section-title">Katalog</h2>
            <button type="button" className="btn btn--icon btn--ghost panel__close" onClick={() => setOpen(false)} aria-label="Katalog schließen">
              <X size={16} />
            </button>
          </div>
          <label className="field">
            <span className="sr-only">Katalog durchsuchen</span>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: 8, color: 'var(--ink-3)' }} aria-hidden="true" />
              <input
                id="palette-search"
                className="input"
                style={{ paddingLeft: 28 }}
                placeholder="Baustein suchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </label>
        </div>
        {groups.map((g) => (
          <section key={g.cat} className="palette__group" aria-label={CATEGORY_META[g.cat].label}>
            <h3 className="section-title">{CATEGORY_META[g.cat].label}</h3>
            {g.entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="palette__item"
                draggable
                onDragStart={(e) => onDragStart(e, entry)}
                onClick={() => addAtCenter(entry)}
                title={entry.description}
              >
                <TypeIcon typeId={entry.typeId} />
                <span className="palette__item-text">
                  <span className="palette__item-label">{entry.label}</span>
                </span>
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <p className="palette__hint">Kein Treffer.</p>}
      </div>
    </aside>
  )
}
