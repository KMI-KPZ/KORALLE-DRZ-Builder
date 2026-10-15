import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { DerivedProvider } from './components/derived'
import { Header } from './components/Header'
import { Inspector } from './components/inspector/Inspector'
import { DrzMatrix } from './components/matrix/DrzMatrix'
import { ExportModal, ImportModal, Toast } from './components/Modals'
import { Palette } from './components/Palette'
import { SimulationPanel } from './components/sim/SimulationPanel'
import { SimProvider } from './sim/SimProvider'
import { useModelStore } from './store/useModelStore'
import { useUiStore } from './store/useUiStore'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || useUiStore.getState().modal) return
      const store = useModelStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        store.redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && store.view === 'canvas') {
        e.preventDefault()
        store.deleteSelection()
      } else if (e.key === 'Escape') {
        if (store.analysis) store.stopAnalysis()
        else store.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const view = useModelStore((s) => s.view)
  const modal = useUiStore((s) => s.modal)
  useShortcuts()

  return (
    <ReactFlowProvider>
      <DerivedProvider>
        <SimProvider>
          <div className="app">
            <Header />
            <main className={`workspace${view === 'matrix' ? ' workspace--matrix' : ''}${view === 'simulation' ? ' workspace--sim' : ''}`}>
              {view === 'canvas' && <Palette />}
              {view === 'matrix' ? <DrzMatrix /> : <Canvas />}
              {view === 'simulation' ? <SimulationPanel /> : <Inspector />}
            </main>
          </div>
          {modal === 'export' && <ExportModal />}
          {modal === 'import' && <ImportModal />}
          <Toast />
        </SimProvider>
      </DerivedProvider>
    </ReactFlowProvider>
  )
}
