import { CircleAlert, Copy, Download, FileUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { fromJsonLd, toJsonLd } from '../model/jsonld'
import { useModelStore } from '../store/useModelStore'
import { useUiStore } from '../store/useUiStore'

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Schließen">
            <X size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        <div className="modal__foot">{footer}</div>
      </div>
    </div>
  )
}

/** Downloads are blocked when the app runs embedded (e.g. as a shared preview), so offer copying there. */
const canDownload = (() => {
  try {
    return window.self === window.top
  } catch {
    return false
  }
})()

export function ExportModal() {
  const setModal = useUiStore((s) => s.setModal)
  const close = useCallback(() => setModal(null), [setModal])
  const getModel = useModelStore((s) => s.getModel)
  const notify = useModelStore((s) => s.notify)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const model = useMemo(() => getModel(), [getModel])
  const json = useMemo(() => JSON.stringify(toJsonLd(model), null, 2), [model])
  const fileName = `${model.organization.id}-drz-modell.jsonld`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      notify('JSON-LD in die Zwischenablage kopiert.', 'success')
    } catch {
      areaRef.current?.select()
      notify('Kopieren ist hier nicht erlaubt. Der Text ist markiert, bitte mit Strg+C kopieren.', 'info')
    }
  }

  const download = () => {
    const blob = new Blob([json], { type: 'application/ld+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Modal
      title="Modell exportieren"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={() => void copy()}>
            <Copy size={14} aria-hidden="true" />
            Kopieren
          </button>
          {canDownload && (
            <button type="button" className="btn btn--primary" onClick={download}>
              <Download size={14} aria-hidden="true" />
              {fileName} herunterladen
            </button>
          )}
        </>
      }
    >
      <p>
        {model.nodes.length} Bausteine, {model.edges.length} Abhängigkeiten.
      </p>
      <label className="sr-only" htmlFor="export-json">
        JSON-LD
      </label>
      <textarea id="export-json" ref={areaRef} className="code-area" readOnly value={json} spellCheck={false} />
    </Modal>
  )
}

export function ImportModal() {
  const setModal = useUiStore((s) => s.setModal)
  const close = useCallback(() => setModal(null), [setModal])
  const loadModel = useModelStore((s) => s.loadModel)
  const notify = useModelStore((s) => s.notify)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setText(await file.text())
    setError(null)
  }

  const doImport = () => {
    try {
      const model = fromJsonLd(JSON.parse(text))
      loadModel(model)
      notify(`${model.organization.name} geladen: ${model.nodes.length} Bausteine, ${model.edges.length} Abhängigkeiten.`, 'success')
      close()
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Das ist kein gültiges JSON.' : err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Modal
      title="Modell importieren"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            Abbrechen
          </button>
          <button type="button" className="btn btn--primary" onClick={doImport} disabled={!text.trim()}>
            Modell laden
          </button>
        </>
      }
    >
      <p>Ersetzt das aktuelle Modell.</p>
      <label className="btn" htmlFor="import-file" style={{ justifySelf: 'start' }}>
        <FileUp size={14} aria-hidden="true" />
        Datei wählen
      </label>
      <input id="import-file" type="file" accept=".jsonld,.json,application/ld+json,application/json" className="sr-only" onChange={(e) => void onFile(e)} />
      <label className="field__label" htmlFor="import-json">
        Oder JSON-LD einfügen
      </label>
      <textarea
        id="import-json"
        className="code-area"
        style={{ minHeight: 220 }}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        spellCheck={false}
        placeholder='{ "@context": …, "@graph": [ … ] }'
      />
      {error && (
        <div className="confirm" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  )
}

export function Toast() {
  const toast = useModelStore((s) => s.toast)
  if (!toast) return null
  return (
    <div key={toast.id} className={`toast${toast.tone === 'error' ? ' toast--error' : ''}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  )
}
