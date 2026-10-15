import { ArrowLeftRight, ArrowRight, FileText, Trash2 } from 'lucide-react'
import { CRITICALITY_META, DEPENDENCY_TYPES, getDependencyType } from '../../model/catalog'
import type { Criticality, DependencyTypeId } from '../../model/types'
import type { AppEdge } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { TypeIcon } from '../Icon'
import { EdgeSwatch } from '../Legend'
import { TagInput } from './fields'

const CRITICALITIES: Criticality[] = [1, 2, 3, 4]

export function EdgeInspector({ edge }: { edge: AppEdge }) {
  const data = edge.data!
  const type = getDependencyType(data.typeId)
  const update = useModelStore((s) => s.updateEdgeData)
  const reverse = useModelStore((s) => s.reverseEdge)
  const deleteEdges = useModelStore((s) => s.deleteEdges)
  const select = useModelStore((s) => s.select)
  const source = useModelStore((s) => s.nodes.find((n) => n.id === edge.source))
  const target = useModelStore((s) => s.nodes.find((n) => n.id === edge.target))
  const key = (field: string) => `edge:${edge.id}:${field}`

  return (
    <div className="inspector" key={edge.id}>
      <div className="inspector__head">
        <div className="inspector__type-row">
          <span className="inspector__type">
            <EdgeSwatch colorVar={type.colorVar} dash={type.dash} width={type.width} />
            Abhängigkeit
          </span>
          <button
            type="button"
            className="btn btn--icon btn--small btn--danger"
            onClick={() => deleteEdges([edge.id])}
            aria-label="Verbindung löschen"
            title="Löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="edge-ends">
          <button type="button" className="edge-end" onClick={() => select({ nodeId: edge.source })} title="Quelle auswählen">
            {source && <TypeIcon typeId={source.data.typeId} size="small" />}
            <span>{source?.data.label ?? edge.source}</span>
          </button>
          <button
            type="button"
            className="btn btn--icon btn--small btn--ghost"
            onClick={() => reverse(edge.id)}
            title="Richtung umdrehen"
            aria-label="Richtung umdrehen"
          >
            {data.bidirectional ? <ArrowLeftRight size={15} /> : <ArrowRight size={15} />}
          </button>
          <button type="button" className="edge-end" onClick={() => select({ nodeId: edge.target })} title="Ziel auswählen">
            {target && <TypeIcon typeId={target.data.typeId} size="small" />}
            <span>{target?.data.label ?? edge.target}</span>
          </button>
        </div>
        {data.source && (
          <span className="provenance">
            <FileText size={12} aria-hidden="true" />
            Quelle: {data.source}
          </span>
        )}
      </div>

      <section className="inspector__section">
        <div className="field">
          <label className="field__label" htmlFor={`edge-type-${edge.id}`}>
            Art der Abhängigkeit
          </label>
          <select
            id={`edge-type-${edge.id}`}
            className="select"
            value={data.typeId}
            onChange={(e) => update(edge.id, { typeId: e.target.value as DependencyTypeId }, key('type'))}
          >
            {DEPENDENCY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`edge-label-${edge.id}`}>
            Bezeichnung
          </label>
          <input
            id={`edge-label-${edge.id}`}
            className="input"
            value={data.label ?? ''}
            placeholder={data.typeId === 'material' ? 'z. B. lackierte Teile' : 'z. B. Lackplan'}
            onChange={(e) => update(edge.id, { label: e.target.value || undefined }, key('label'))}
          />
        </div>

        {type.hasMessages && (
          <div className="field">
            <span className="field__label">Meldungen und Dokumente</span>
            <TagInput
              id={`edge-messages-${edge.id}`}
              values={data.messages ?? []}
              placeholder="z. B. ASN, Fahrauftrag"
              onChange={(messages) => update(edge.id, { messages }, key('messages'))}
            />
          </div>
        )}

        {data.typeId === 'material' && (
          <div className="field">
            <label className="field__label" htmlFor={`edge-share-${edge.id}`}>
              <span>Anteil bei XODER-Verzweigung</span>
              <span>%</span>
            </label>
            <input
              id={`edge-share-${edge.id}`}
              className="input"
              type="number"
              min={0}
              max={100}
              value={data.share ?? ''}
              placeholder="gleich verteilt"
              onChange={(e) =>
                update(
                  edge.id,
                  { share: e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))) },
                  key('share'),
                )
              }
            />
          </div>
        )}

        {data.typeId === 'information' && (
          <label className="check-row" htmlFor={`edge-bidi-${edge.id}`}>
            <input
              id={`edge-bidi-${edge.id}`}
              type="checkbox"
              checked={data.bidirectional === true}
              onChange={(e) => update(edge.id, { bidirectional: e.target.checked || undefined }, key('bidi'))}
            />
            Austausch in beide Richtungen
          </label>
        )}
      </section>

      <section className="inspector__section">
        <div className="field">
          <span className="field__label">Kritikalität</span>
          <div className="crit-picker" role="group" aria-label="Kritikalität">
            {CRITICALITIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={data.criticality === c}
                onClick={() => update(edge.id, { criticality: c }, key('crit'))}
              >
                <span className="dot" style={{ ['--c' as string]: `var(${CRITICALITY_META[c].colorVar})` }} />
                {CRITICALITY_META[c].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`edge-buffer-${edge.id}`}>
            <span>Puffer bis zur Wirkung</span>
            <span>min</span>
          </label>
          <input
            id={`edge-buffer-${edge.id}`}
            className="input"
            type="number"
            min={0}
            value={data.bufferMinutes ?? ''}
            onChange={(e) =>
              update(edge.id, { bufferMinutes: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }, key('buffer'))
            }
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`edge-formula-${edge.id}`}>
            Formel (optional)
          </label>
          <textarea
            id={`edge-formula-${edge.id}`}
            className="textarea"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 52 }}
            value={data.formula ?? ''}
            placeholder="Ausdruck für den SemDT-Evaluator"
            onChange={(e) => update(edge.id, { formula: e.target.value || undefined }, key('formula'))}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`edge-note-${edge.id}`}>
            Notiz
          </label>
          <textarea
            id={`edge-note-${edge.id}`}
            className="textarea"
            value={data.note ?? ''}
            onChange={(e) => update(edge.id, { note: e.target.value || undefined }, key('note'))}
          />
        </div>
      </section>
    </div>
  )
}
