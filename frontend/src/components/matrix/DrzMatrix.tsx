import { Check, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { findModuleType } from '../../model/catalog'
import { findDrzKind } from '../../model/drzCatalog'
import type { AppNode } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { useDerived } from '../derivedContext'
import { TypeIcon } from '../Icon'

/** Assignment matrix: organisation modules × DRZ modules with readiness per cell. */
export function DrzMatrix() {
  const nodes = useModelStore((s) => s.nodes)
  const toggle = useModelStore((s) => s.toggleDrz)
  const focusNode = useModelStore((s) => s.focusNode)
  const { readiness } = useDerived()
  // Groups without any assignment start collapsed (e.g. 47 workplaces of a line).
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const { columns, groups } = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const columns = nodes
      .filter((n) => n.data.typeId === 'drz')
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    const topGroup = (n: AppNode): AppNode | undefined => {
      let cur = n.parentId ? byId.get(n.parentId) : undefined
      let last: AppNode | undefined
      while (cur) {
        last = cur
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
      return last
    }
    const rows = nodes.filter((n) => findModuleType(n.data.typeId)?.drzAssignable)
    const map = new Map<string, { key: string; label: string; rows: AppNode[]; order: number }>()
    for (const r of rows) {
      const g = topGroup(r)
      const key = g?.id ?? '__none__'
      if (!map.has(key))
        map.set(key, {
          key,
          label: g?.data.label ?? 'Ohne Halle / Ebene',
          rows: [],
          order: g ? g.position.y * 10000 + g.position.x : Infinity,
        })
      map.get(key)!.rows.push(r)
    }
    const groups = [...map.values()].sort((a, b) => a.order - b.order)
    for (const g of groups) g.rows.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    return { columns, groups }
  }, [nodes])

  const columnStats = columns.map((c) => {
    let total = 0
    let ready = 0
    for (const n of nodes) {
      if (!n.data.drz.includes(c.id)) continue
      total++
      const r = readiness.get(`${n.id}|${c.id}`)
      if (r?.applicable && r.missing.length === 0) ready++
    }
    return { total, ready }
  })

  return (
    <div className="matrix-view">
      <div className="matrix-view__inner">
        <div className="matrix-view__intro">
          <div>
            <h2>DRZ-Matrix</h2>
          </div>
          <div className="matrix-legend" aria-label="Legende">
            <span>
              <span className="cell-mark cell-mark--ready" style={{ width: 20, height: 20 }}>
                <Check size={13} />
              </span>
              bereit
            </span>
            <span>
              <span className="cell-mark cell-mark--missing" style={{ width: 20, height: 20 }}>
                <TriangleAlert size={12} />
              </span>
              Eingaben fehlen
            </span>
            <span>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  display: 'inline-block',
                  background: 'repeating-linear-gradient(135deg, transparent 0 5px, var(--surface-3) 5px 6px)',
                  border: '1px solid var(--border)',
                }}
              />
              passt nicht zum Modultyp
            </span>
          </div>
        </div>

        <div className="matrix-scroll">
          <table className="matrix">
            <thead>
              <tr>
                <th scope="col">Organisationsmodul</th>
                {columns.map((c) => {
                  const kind = findDrzKind(c.data.properties.drzKind)
                  return (
                    <th key={c.id} scope="col" title={kind?.description}>
                      {c.data.label}
                      <span className="matrix__col-sub">{kind?.reference ?? ''}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const open = toggled[g.key] ?? g.rows.some((r) => r.data.drz.length > 0)
                return (
                <GroupRows
                  key={g.key}
                  label={g.label}
                  rows={g.rows}
                  colSpan={columns.length + 1}
                  onFocus={focusNode}
                  open={open}
                  onToggle={() => setToggled({ ...toggled, [g.key]: !open })}
                >
                  {(row) =>
                    columns.map((c) => {
                      const kind = findDrzKind(c.data.properties.drzKind)
                      const applicable = kind ? kind.appliesTo.includes(row.data.typeId) : false
                      const on = row.data.drz.includes(c.id)
                      const r = readiness.get(`${row.id}|${c.id}`)
                      const ready = on && r?.applicable && r.missing.length === 0
                      const label = `${row.data.label} × ${c.data.label}`
                      let title = applicable ? 'Zuordnen' : 'Passt nicht zu diesem Modultyp'
                      if (on) title = ready ? 'Zugeordnet, alle Eingaben vorhanden' : `Zugeordnet. Fehlt: ${r?.missing.join(', ') || 'passt nicht zum Modultyp'}`
                      return (
                        <td key={c.id}>
                          <button
                            type="button"
                            className="matrix__cell"
                            disabled={!applicable && !on}
                            aria-pressed={on}
                            aria-label={`${label}: ${title}`}
                            title={title}
                            onClick={() => toggle(row.id, c.id)}
                          >
                            {on ? (
                              ready ? (
                                <span className="cell-mark cell-mark--ready">
                                  <Check size={15} strokeWidth={2.6} />
                                </span>
                              ) : (
                                <span className="cell-mark cell-mark--missing">
                                  <TriangleAlert size={14} />
                                </span>
                              )
                            ) : applicable ? (
                              <span className="cell-mark cell-mark--empty" />
                            ) : null}
                          </button>
                        </td>
                      )
                    })
                  }
                </GroupRows>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Bereit / zugeordnet</th>
                {columnStats.map((s, i) => (
                  <td key={columns[i].id}>
                    {s.ready}/{s.total}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )

}

function GroupRows({
  label,
  rows,
  colSpan,
  onFocus,
  open,
  onToggle,
  children,
}: {
  label: string
  rows: AppNode[]
  onFocus: (id: string) => void
  colSpan: number
  open: boolean
  onToggle: () => void
  children: (row: AppNode) => ReactNode
}) {
  return (
    <>
      <tr className="matrix__group-row">
        <th colSpan={colSpan} scope="colgroup">
          <button type="button" className="matrix__group-toggle" aria-expanded={open} onClick={onToggle}>
            {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            {label}
            <span className="matrix__group-count">{rows.length}</span>
          </button>
        </th>
      </tr>
      {open && rows.map((row) => (
        <tr key={row.id}>
          <th scope="row">
            <button type="button" className="matrix__row-head" onClick={() => onFocus(row.id)}>
              <TypeIcon typeId={row.data.typeId} size="small" />
              <span>{row.data.label}</span>
            </button>
          </th>
          {children(row)}
        </tr>
      ))}
    </>
  )
}
