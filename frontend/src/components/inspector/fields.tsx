import { Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import type { FieldSchema, PropertySchema } from '../../model/catalog'

/** Editable list of short strings (messages, sub-areas). */
export function TagInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }
  return (
    <div className="field" style={{ gap: 6 }}>
      {values.length > 0 && (
        <div className="tag-list">
          {values.map((v) => (
            <span key={v} className="tag">
              <span title={v}>{v}</span>
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`${v} entfernen`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          id={id}
          className="input"
          value={draft}
          placeholder={placeholder ?? 'Eintrag hinzufügen'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className="btn btn--icon" onClick={add} aria-label="Hinzufügen" disabled={!draft.trim()}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

function FieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string
  field: FieldSchema
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.type === 'boolean') {
    return (
      <label className="check-row" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked || undefined)} />
        <span>{field.title}</span>
      </label>
    )
  }
  if (field.type === 'array') {
    const list = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    return <TagInput id={id} values={list} onChange={(v) => onChange(v.length > 0 ? v : undefined)} />
  }
  if (field.enum) {
    return (
      <select id={id} className="select" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">–</option>
        {field.enum.map((opt) => (
          <option key={opt} value={opt}>
            {field.enumLabels?.[opt] ?? opt}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === 'number' || field.type === 'integer') {
    return (
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        min={field.minimum}
        max={field.maximum}
        step={field.type === 'integer' ? 1 : 'any'}
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(undefined)
          const n = field.type === 'integer' ? Math.round(Number(raw)) : Number(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    )
  }
  return field.multiline ? (
    <textarea id={id} className="textarea" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} />
  ) : (
    <input id={id} className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)} />
  )
}

/** Form generated from the catalog schema of a module type. */
export function PropertyForm({
  schema,
  values,
  onChange,
  idPrefix,
}: {
  schema: PropertySchema
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  idPrefix: string
}) {
  const groups = new Map<string, [string, FieldSchema][]>()
  for (const [key, field] of Object.entries(schema.properties)) {
    const g = field.group ?? 'Allgemein'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push([key, field])
  }
  return (
    <>
      {[...groups.entries()].map(([group, fields]) => (
        <div key={group} className="field" style={{ gap: 10 }}>
          {groups.size > 1 && <h3 className="section-title">{group}</h3>}
          {fields.map(([key, field]) => {
            const id = `${idPrefix}-${key}`
            if (field.type === 'boolean') {
              return <FieldInput key={key} id={id} field={field} value={values[key]} onChange={(v) => onChange(key, v)} />
            }
            return (
              <div key={key} className="field">
                <label className="field__label" htmlFor={id} title={field.description}>
                  <span>{field.title}</span>
                  {field.unit && <span>{field.unit}</span>}
                </label>
                <FieldInput id={id} field={field} value={values[key]} onChange={(v) => onChange(key, v)} />
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
