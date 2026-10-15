import { Plus, Trash2, Zap } from 'lucide-react'
import { GROESSE_META } from '../../model/catalog'
import { newId } from '../../model/ids'
import type { Groesse, GroesseKind, Rating } from '../../model/types'
import { useModelStore } from '../../store/useModelStore'

const KINDS: GroesseKind[] = ['struktur', 'regel', 'stoer']
const RATINGS: Rating[] = [1, 2, 3, 4, 5]

export function GroessenEditor({ nodeId, groessen }: { nodeId: string; groessen: Groesse[] }) {
  const update = useModelStore((s) => s.updateNodeData)
  const startAnalysis = useModelStore((s) => s.startAnalysis)

  const set = (next: Groesse[], key: string) => update(nodeId, { groessen: next }, key)
  const patch = (id: string, p: Partial<Groesse>) =>
    set(
      groessen.map((g) => (g.id === id ? { ...g, ...p } : g)),
      `groesse:${nodeId}:${id}:${Object.keys(p).join(',')}`,
    )
  const remove = (id: string) => set(groessen.filter((g) => g.id !== id), `groesse-remove:${id}`)
  const add = (kind: GroesseKind) => {
    const g: Groesse = { id: newId('g'), kind, name: '', likelihood: null, impact: null }
    set([...groessen, g], `groesse-add:${g.id}`)
    setTimeout(() => document.getElementById(`groesse-${g.id}`)?.focus(), 30)
  }

  return (
    <>
      {KINDS.map((kind) => {
        const list = groessen.filter((g) => g.kind === kind)
        const meta = GROESSE_META[kind]
        return (
          <section key={kind} className="inspector__section" aria-label={meta.label}>
            <div className="inspector__section-head">
              <h3 className="section-title">
                {meta.label} <span className="count">{list.length}</span>
              </h3>
              <button type="button" className="btn btn--small" onClick={() => add(kind)}>
                <Plus size={13} aria-hidden="true" />
                {meta.singular}
              </button>
            </div>
            <div className="groesse-list">
              {list.map((g) => (
                <div key={g.id} className={`groesse-row${kind === 'stoer' ? ' groesse-row--stoer' : ''}`}>
                  <input
                    id={`groesse-${g.id}`}
                    className="input groesse-row__name"
                    value={g.name}
                    placeholder={meta.singular}
                    aria-label={meta.singular}
                    title={g.name}
                    onChange={(e) => patch(g.id, { name: e.target.value })}
                  />
                  {kind === 'stoer' ? (
                    <div className="groesse-row__risk">
                      <label htmlFor={`groesse-${g.id}-p`}>Wahrscheinlichkeit</label>
                      <RatingSelect
                        id={`groesse-${g.id}-p`}
                        label="Eintrittswahrscheinlichkeit"
                        value={g.likelihood ?? null}
                        onChange={(v) => patch(g.id, { likelihood: v })}
                      />
                      <label htmlFor={`groesse-${g.id}-i`}>Wirkung</label>
                      <RatingSelect
                        id={`groesse-${g.id}-i`}
                        label="Auswirkung"
                        value={g.impact ?? null}
                        onChange={(v) => patch(g.id, { impact: v })}
                      />
                    </div>
                  ) : (
                    <input
                      id={`groesse-${g.id}-v`}
                      className="input"
                      value={g.value ?? ''}
                      placeholder="Wert"
                      aria-label={`Wert für ${g.name || meta.singular}`}
                      onChange={(e) => patch(g.id, { value: e.target.value || undefined })}
                    />
                  )}
                  <div className="groesse-row__actions">
                    {kind === 'stoer' && (
                      <button
                        type="button"
                        className="btn btn--icon btn--ghost btn--small"
                        title="Ausbreitung dieser Störung zeigen"
                        aria-label={`Ausbreitung von ${g.name || 'Störgröße'} zeigen`}
                        onClick={() => startAnalysis(nodeId, g.id)}
                      >
                        <Zap size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--icon btn--ghost btn--small"
                      title="Entfernen"
                      aria-label={`${g.name || meta.singular} entfernen`}
                      onClick={() => remove(g.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              
            </div>
          </section>
        )
      })}
    </>
  )
}

function RatingSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: Rating | null
  onChange: (v: Rating | null) => void
}) {
  return (
    <select
      id={id}
      className="select"
      aria-label={label}
      title={`${label} (1 = sehr gering, 5 = sehr hoch)`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? (Number(e.target.value) as Rating) : null)}
    >
      <option value="">–</option>
      {RATINGS.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  )
}
