import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { getDependencyType } from '../../model/catalog'
import type { DependencyData } from '../../model/types'
import { floatingGeometry } from './geometry'

/** Render-time edge data: the stored dependency plus layout and analysis hints. */
export type FlowEdgeData = DependencyData & {
  offset?: number
  hitColor?: string
  dimmed?: boolean
  showLabel?: boolean
  hovered?: boolean
}

export type DependencyFlowEdge = Edge<FlowEdgeData, 'dependency'>

function DependencyEdgeView({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps<DependencyFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode || !data) return null

  // Keep the bend on the same side regardless of edge direction.
  const offset = (data.offset ?? 0) * (source > target ? -1 : 1)
  const { path, labelX, labelY } = floatingGeometry(sourceNode, targetNode, offset)
  const type = getDependencyType(data.typeId)
  const stroke = data.hitColor ?? `var(${type.colorVar})`
  const width = type.width + (data.criticality >= 4 ? 0.8 : 0) + (data.hitColor ? 1 : 0)
  const text = data.label || data.messages?.[0]
  const active = selected || data.hovered
  const showLabel = !!text && (data.showLabel || active)

  const cls = ['dep-edge', data.dimmed && 'is-dimmed', data.hitColor && 'is-hit'].filter(Boolean).join(' ')

  return (
    <g className={cls}>
      {active && <path d={path} className="dep-edge__halo" strokeWidth={width + 8} />}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={16}
        className="dep-edge__path"
        style={{
          stroke,
          strokeWidth: width,
          strokeDasharray: type.dash || undefined,
          opacity: data.dimmed ? 0.12 : 1,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan${active ? ' is-active' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={[text, ...(data.messages ?? []).filter((m) => m !== text)].join(' · ')}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

export const DependencyEdge = memo(DependencyEdgeView)

export type DrzFlowEdge = Edge<{ dimmed?: boolean }, 'drz'>

function DrzEdgeView({ source, target, data, selected }: EdgeProps<DrzFlowEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null
  const { path } = floatingGeometry(sourceNode, targetNode, 0)
  return (
    <path
      d={path}
      fill="none"
      style={{
        stroke: 'var(--edge-drz)',
        strokeWidth: selected ? 2.2 : 1.3,
        strokeDasharray: '1 4',
        strokeLinecap: 'round',
        opacity: data?.dimmed ? 0.1 : 0.85,
      }}
    />
  )
}

export const DrzEdge = memo(DrzEdgeView)
