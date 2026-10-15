import {
  ChevronDown,
  Download,
  Layers,
  LibraryBig,
  Network,
  PanelRight,
  Redo2,
  RotateCcw,
  Undo2,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CATEGORY_META, CATEGORY_ORDER, DEPENDENCY_TYPES } from '../model/catalog'
import { useModelStore } from '../store/useModelStore'
import { useUiStore } from '../store/useUiStore'
import { EdgeSwatch } from './Legend'

function BrandMark() {
  // A small branching coral: the project's name, drawn as a dependency tree.
  return (
    <svg className="brand__mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M14 26V15M14 15L8 9M14 15l6-5M8 9V4M8 9L4 6M20 10V5M20 10l4-3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="4" r="2" fill="currentColor" />
      <circle cx="4" cy="6" r="1.6" fill="currentColor" />
      <circle cx="20" cy="5" r="2" fill="currentColor" />
      <circle cx="24" cy="7" r="1.6" fill="currentColor" />
    </svg>
  )
}

export function Header() {
  const organization = useModelStore((s) => s.organization)
  const view = useModelStore((s) => s.view)
  const setView = useModelStore((s) => s.setView)
  const canUndo = useModelStore((s) => s.past.length > 0)
  const canRedo = useModelStore((s) => s.future.length > 0)
  const undo = useModelStore((s) => s.undo)
  const redo = useModelStore((s) => s.redo)
  const autoLayout = useModelStore((s) => s.autoLayout)
  const layoutRunning = useModelStore((s) => s.layoutRunning)
  const setModal = useUiStore((s) => s.setModal)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const setInspectorOpen = useUiStore((s) => s.setInspectorOpen)

  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <div className="brand__text">
          <span className="brand__title">DRZ-Baukasten</span>
          <span className="brand__org" title={organization.name}>
            KORALLE · {organization.name}
          </span>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Ansicht">
        <button type="button" role="tab" aria-selected={view === 'canvas'} onClick={() => setView('canvas')}>
          Baukasten
        </button>
        <button type="button" role="tab" aria-selected={view === 'matrix'} onClick={() => setView('matrix')}>
          DRZ-Matrix
        </button>
        <button type="button" role="tab" aria-selected={view === 'simulation'} onClick={() => setView('simulation')}>
          Simulation
        </button>
      </div>

      <div className="header__group only-narrow">
        {view === 'canvas' && (
          <button type="button" className="btn btn--small" onClick={() => setPaletteOpen(true)}>
            <LibraryBig size={14} aria-hidden="true" />
            Katalog
          </button>
        )}
        <button type="button" className="btn btn--small" onClick={() => setInspectorOpen(true)}>
          <PanelRight size={14} aria-hidden="true" />
          {view === 'simulation' ? 'Simulation' : 'Details'}
        </button>
      </div>

      <div className="header__spacer" />

      <div className="header__group">
        {view === 'canvas' && <LayerMenu />}
        {view === 'canvas' && (
          <button type="button" className="btn" onClick={() => void autoLayout()} disabled={layoutRunning} title="Nach Materialfluss automatisch anordnen" aria-label="Anordnen">
            <Network size={15} aria-hidden="true" />
            <span className="btn__text">Anordnen</span>
          </button>
        )}
        <button type="button" className="btn btn--icon" onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
          <Undo2 size={15} />
        </button>
        <button type="button" className="btn btn--icon" onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Umschalt+Z)" aria-label="Wiederholen">
          <Redo2 size={15} />
        </button>
        <button type="button" className="btn" onClick={() => setModal('import')} title="Modell aus JSON-LD laden" aria-label="Import">
          <Upload size={15} aria-hidden="true" />
          <span className="btn__text">Import</span>
        </button>
        <button type="button" className="btn" onClick={() => setModal('export')} title="Modell als JSON-LD exportieren" aria-label="Export">
          <Download size={15} aria-hidden="true" />
          <span className="btn__text">Export</span>
        </button>
        <ResetButton />
      </div>
    </header>
  )
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function LayerMenu() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const edgeLayers = useModelStore((s) => s.edgeLayers)
  const categoryLayers = useModelStore((s) => s.categoryLayers)
  const toggleEdge = useModelStore((s) => s.toggleEdgeLayer)
  const toggleCategory = useModelStore((s) => s.toggleCategoryLayer)
  const showDrzLinks = useModelStore((s) => s.showDrzLinks)
  const setShowDrzLinks = useModelStore((s) => s.setShowDrzLinks)
  const showLabels = useModelStore((s) => s.showLabels)
  const setShowLabels = useModelStore((s) => s.setShowLabels)
  const semanticZoom = useModelStore((s) => s.semanticZoom)
  const setSemanticZoom = useModelStore((s) => s.setSemanticZoom)
  const infoInOverview = useModelStore((s) => s.infoInOverview)
  const setInfoInOverview = useModelStore((s) => s.setInfoInOverview)
  const hiddenCount =
    Object.values(edgeLayers).filter((v) => !v).length + Object.values(categoryLayers).filter((v) => !v).length

  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)} aria-label="Ebenen">
        <Layers size={15} aria-hidden="true" />
        <span className="btn__text">Ebenen{hiddenCount > 0 ? ` (${hiddenCount} aus)` : ''}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Ebenen ein- und ausblenden">
          <h3>Verbindungen</h3>
          {DEPENDENCY_TYPES.map((t) => (
            <label key={t.id} className="check-row" htmlFor={`layer-edge-${t.id}`}>
              <input id={`layer-edge-${t.id}`} type="checkbox" checked={edgeLayers[t.id]} onChange={() => toggleEdge(t.id)} />
              <EdgeSwatch colorVar={t.colorVar} dash={t.dash} width={t.width} />
              {t.label}
            </label>
          ))}
          <label className="check-row" htmlFor="layer-drz-links">
            <input id="layer-drz-links" type="checkbox" checked={showDrzLinks} onChange={(e) => setShowDrzLinks(e.target.checked)} />
            <EdgeSwatch colorVar="--edge-drz" dash="1 4" width={1.6} />
            DRZ-Zuordnungen
          </label>
          <label className="check-row" htmlFor="layer-labels">
            <input id="layer-labels" type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            Beschriftungen aller Verbindungen
          </label>
          <h3>Zusammenfassen</h3>
          <label className="check-row" htmlFor="layer-semantic">
            <input id="layer-semantic" type="checkbox" checked={semanticZoom} onChange={(e) => setSemanticZoom(e.target.checked)} />
            Bereiche zusammenfassen
          </label>
          <label className="check-row" htmlFor="layer-info-overview">
            <input
              id="layer-info-overview"
              type="checkbox"
              checked={infoInOverview}
              disabled={!semanticZoom}
              onChange={(e) => setInfoInOverview(e.target.checked)}
            />
            Informationsflüsse bündeln
          </label>
          <h3>Bausteine</h3>
          {CATEGORY_ORDER.filter((c) => c !== 'struktur').map((c) => (
            <label key={c} className="check-row" htmlFor={`layer-cat-${c}`}>
              <input id={`layer-cat-${c}`} type="checkbox" checked={categoryLayers[c]} onChange={() => toggleCategory(c)} />
              <span className="dot" style={{ ['--c' as string]: `var(${CATEGORY_META[c].colorVar})` }} />
              {CATEGORY_META[c].label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ResetButton() {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  const reset = useModelStore((s) => s.resetToDemo)
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="btn btn--icon" aria-expanded={open} onClick={() => setOpen(!open)} title="Magna-Startmodell laden" aria-label="Magna-Startmodell laden">
        <RotateCcw size={15} />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Startmodell laden">
          <h3>Startmodell laden</h3>
          <p className="note" style={{ color: 'var(--ink-2)' }}>
            Aktuelles Modell durch das Startmodell ersetzen?
          </p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--small" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={() => {
                reset()
                setOpen(false)
              }}
            >
              Startmodell laden
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
