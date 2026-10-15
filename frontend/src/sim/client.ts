import type { ApiErrorBody, EngineInfo, SimProcess, SimRequest, SimRun } from './contract'

/**
 * HTTP client for the simulation endpoints of the backend.
 *
 * Same origin by default (nginx or the Vite dev server proxy `/api`), or
 * `VITE_API_BASE` at build time. The client already polls runs that are
 * queued or running, so the Django/Celery version can answer with 202.
 */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

const POLL_MS = 800
const RUN_TIMEOUT_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 120 * 1000

export class SimulationApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiErrorBody['details']

  constructor(status: number, body: Partial<ApiErrorBody> | undefined, fallback: string) {
    super(body?.message ?? fallback)
    this.status = status
    this.code = body?.code ?? 'http_error'
    this.details = body?.details ?? []
  }
}

/** The service could not be reached at all (not started, wrong proxy, offline preview). */
export class SimulationOfflineError extends Error {}

async function call(path: string, init: RequestInit = {}, timeout = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      signal: ctrl.signal,
    })
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    throw new SimulationOfflineError(aborted ? 'Zeitüberschreitung beim Simulationsdienst.' : 'Simulationsdienst nicht erreichbar.')
  } finally {
    clearTimeout(timer)
  }
  // A proxy without upstream answers 502/503/504; a static host without API answers HTML.
  if ([502, 503, 504].includes(res.status)) throw new SimulationOfflineError('Simulationsdienst nicht erreichbar.')
  if (!res.ok) {
    let body: { error?: ApiErrorBody } | undefined
    try {
      body = await res.json()
    } catch {
      body = undefined
    }
    if (!body?.error && res.status === 404) throw new SimulationOfflineError('Simulationsdienst nicht gefunden.')
    throw new SimulationApiError(res.status, body?.error, `Fehler ${res.status}`)
  }
  return res
}

async function json<T>(res: Response): Promise<T> {
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('json')) throw new SimulationOfflineError('Unerwartete Antwort, kein Simulationsdienst unter /api.')
  return (await res.json()) as T
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const simulationClient = {
  async info(): Promise<EngineInfo> {
    return json<EngineInfo>(await call('/api/simulations/engine/', {}, 5000))
  },

  async run(org: string, request: SimRequest, onStatus?: (run: SimRun) => void): Promise<SimRun> {
    const res = await call(`/api/organizations/${encodeURIComponent(org)}/simulations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    let run = await json<SimRun>(res)
    const started = Date.now()
    while (run.status === 'queued' || run.status === 'running') {
      onStatus?.(run)
      if (Date.now() - started > RUN_TIMEOUT_MS) throw new Error('Der Lauf dauert länger als 10 Minuten.')
      await wait(POLL_MS)
      run = await json<SimRun>(await call(`/api/organizations/${encodeURIComponent(org)}/simulations/${run.id}/`))
    }
    if (run.status === 'failed') {
      throw new SimulationApiError(500, run.error, 'Der Lauf ist fehlgeschlagen.')
    }
    return run
  },

  async exportBpmn(org: string, process: SimProcess, name: string): Promise<Blob> {
    const res = await call(`/api/organizations/${encodeURIComponent(org)}/simulations/bpmn/export/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/xml' },
      body: JSON.stringify({ process, name }),
    })
    return res.blob()
  },
}
