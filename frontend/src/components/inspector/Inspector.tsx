import { Trash2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore } from '../../store/useModelStore'
import { useUiStore } from '../../store/useUiStore'
import { EdgeInspector } from './EdgeInspector'
import { NodeInspector } from './NodeInspector'
import { Overview } from './Overview'

export function Inspector() {
  const selectedNodes = useModelStore(useShallow((s) => s.nodes.filter((n) => n.selected)))
  const selectedEdges = useModelStore(useShallow((s) => s.edges.filter((e) => e.selected)))
  const deleteSelection = useModelStore((s) => s.deleteSelection)
  const select = useModelStore((s) => s.select)
  const open = useUiStore((s) => s.inspectorOpen)
  const setOpen = useUiStore((s) => s.setInspectorOpen)

  const total = selectedNodes.length + selectedEdges.length
  let content
  if (total === 0) content = <Overview />
  else if (selectedNodes.length === 1 && selectedEdges.length === 0) content = <NodeInspector node={selectedNodes[0]} />
  else if (selectedEdges.length === 1 && selectedNodes.length === 0) content = <EdgeInspector edge={selectedEdges[0]} />
  else
    content = (
      <div className="inspector">
        <div className="inspector__head">
          <span className="inspector__type">Mehrfachauswahl</span>
          <div style={{ fontSize: 16, fontWeight: 650 }}>{total} Elemente ausgewählt</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn--small" onClick={() => select(null)}>
              Auswahl aufheben
            </button>
            <button type="button" className="btn btn--small btn--danger" onClick={deleteSelection}>
              <Trash2 size={13} aria-hidden="true" />
              Alle löschen
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <aside className={`panel panel--right${open ? ' is-open' : ''}`} aria-label="Details">
      <div className="only-narrow" style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
        <button type="button" className="btn btn--icon btn--ghost panel__close" onClick={() => setOpen(false)} aria-label="Details schließen">
          <X size={16} />
        </button>
      </div>
      {content}
    </aside>
  )
}
