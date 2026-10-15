import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useMemo } from 'react'
import { descendantsOf } from '../../model/analysis'
import { CATEGORY_META, CATEGORY_ORDER, findModuleType } from '../../model/catalog'
import type { Category } from '../../model/types'
import { isCollapsed, type AreaFlowNode } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { useUiStore } from '../../store/useUiStore'
import { TypeIcon } from '../Icon'
import { useIsCondensed } from '../overview'

function AreaNodeView({ id, data, selected }: NodeProps<AreaFlowNode>) {
  const type = findModuleType(data.typeId)
  const isDropTarget = useUiStore((s) => s.dropTargetId === id)
  const analysisActive = useModelStore((s) => s.analysis !== null)
  const simActive = useModelStore((s) => s.view === 'simulation')
  const pushHistory = useModelStore((s) => s.pushHistory)
  const toggleCollapsed = useModelStore((s) => s.toggleCollapsed)
  const collapsed = useModelStore((s) => {
    const n = s.nodes.find((x) => x.id === id)
    return n ? isCollapsed(n) : false
  })
  const childCount = useModelStore((s) => {
    if (!collapsed) return 0
    const inside = descendantsOf(s.nodes, id)
    return s.nodes.filter((n) => inside.has(n.id) && n.type === 'module').length
  })
  const condensed = useIsCondensed(id)
  const showSummary = condensed && !collapsed
  const kuerzel = typeof data.properties.kuerzel === 'string' ? data.properties.kuerzel : ''
  const takt = typeof data.properties.takt === 'number' ? data.properties.takt : undefined

  const cls = [
    'area-node',
    data.typeId === 'ebene' && 'area-node--ebene',
    collapsed && 'is-collapsed',
    selected && 'is-selected',
    isDropTarget && 'is-drop-target',
    (analysisActive || simActive) && !showSummary && 'is-dimmed',
    showSummary && 'is-overview',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <NodeResizer
        isVisible={selected && !collapsed}
        minWidth={240}
        minHeight={140}
        lineStyle={{ borderColor: 'transparent' }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2 }}
        onResizeStart={() => pushHistory()}
      />
      <div className={cls}>
        {/* Anchor for bundled dependencies in the overview (edges are drawn as floating edges). */}
        <Handle type="target" position={Position.Top} className="area-handle" isConnectable={false} />
        <Handle type="source" position={Position.Top} className="area-handle" isConnectable={false} />
        <div className="area-node__header">
          <button
            type="button"
            className="area-node__toggle nodrag"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed(id)
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `${data.label} aufklappen` : `${data.label} zuklappen`}
            title={collapsed ? 'Aufklappen' : 'Zuklappen'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <TypeIcon typeId={data.typeId} size="small" outline />
          <span className="area-node__title">{data.label}</span>
          <span className="area-node__type">
            {type?.label}
            {kuerzel ? ` · ${kuerzel}` : ''}
            {takt !== undefined ? ` · Takt ${takt} s` : ''}
          </span>
          {collapsed && (
            <span className="chip area-node__count">
              {childCount} {childCount === 1 ? 'Baustein' : 'Bausteine'}
            </span>
          )}
        </div>
        {showSummary && <AreaSummary id={id} />}
      </div>
    </>
  )
}

/** Overview: what the group contains, instead of its modules. */
function AreaSummary({ id }: { id: string }) {
  const nodes = useModelStore((s) => s.nodes)
  const analysis = useModelStore((s) => s.analysis)
  const summary = useMemo(() => {
    const inside = descendantsOf(nodes, id)
    const counts = new Map<Category, number>()
    let modules = 0
    let stoer = 0
    let hits = 0
    for (const n of nodes) {
      if (!inside.has(n.id) || n.type !== 'module') continue
      const cat = findModuleType(n.data.typeId)?.category
      if (!cat) continue
      modules++
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
      stoer += n.data.groessen.filter((g) => g.kind === 'stoer').length
      if (analysis && (analysis.hits[n.id] || analysis.originId === n.id)) hits++
    }
    return { counts, modules, stoer, hits }
  }, [nodes, id, analysis])

  return (
    <div className="area-summary" title="Doppelklick: hineinzoomen">
      <div className="area-summary__total">
        {summary.modules} {summary.modules === 1 ? 'Baustein' : 'Bausteine'}
        {summary.stoer > 0 && <span className="area-summary__stoer"> · {summary.stoer} Störgrößen</span>}
      </div>
      <div className="area-summary__cats">
        {CATEGORY_ORDER.filter((c) => summary.counts.has(c)).map((c) => (
          <span key={c} className="area-summary__cat">
            <span className="dot" style={{ ['--c' as string]: `var(${CATEGORY_META[c].colorVar})` }} />
            {summary.counts.get(c)} {CATEGORY_META[c].label}
          </span>
        ))}
      </div>
      {summary.hits > 0 && <div className="area-summary__hits">{summary.hits} von der Störung betroffen</div>}
    </div>
  )
}

export const AreaNode = memo(AreaNodeView)
