import { fromJsonLd, toJsonLd } from '../model/jsonld'
import type { KoralleModel } from '../model/types'

/**
 * Persistence boundary.
 *
 * The PoC keeps the working copy in the browser (localStorage) and exchanges
 * models as JSON-LD files. Once the backend exposes the graph endpoints, an `ApiRepository` implements the same
 * interface and the rest of the app stays unchanged.
 */
export interface ModelRepository {
  load(): Promise<KoralleModel | null>
  save(model: KoralleModel): Promise<void>
}

const STORAGE_KEY = 'koralle.drz-baukasten.model.v1'

export class LocalRepository implements ModelRepository {
  /** Schema version of the last model read from storage, before migration. */
  storedVersion: string | null = null

  loadSync(): KoralleModel | null {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
      if (!raw) return null
      const doc = JSON.parse(raw)
      const org = Array.isArray(doc?.['@graph'])
        ? doc['@graph'].find((i: { '@type'?: unknown }) => i?.['@type'] === 'Organization')
        : undefined
      this.storedVersion = typeof org?.schemaVersion === 'string' ? org.schemaVersion : null
      return fromJsonLd(doc)
    } catch {
      return null
    }
  }

  async load(): Promise<KoralleModel | null> {
    return this.loadSync()
  }

  async save(model: KoralleModel): Promise<void> {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(toJsonLd(model)))
    } catch {
      // Storage can be unavailable (private mode, blocked site data). The app keeps working in memory.
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

/**
 * Sketch of the backend repository. Endpoint paths are a proposal and not implemented in the backend yet.
 */
export class ApiRepository implements ModelRepository {
  private readonly baseUrl: string
  private readonly organizationId: string

  constructor(baseUrl: string, organizationId: string) {
    this.baseUrl = baseUrl
    this.organizationId = organizationId
  }

  async load(): Promise<KoralleModel | null> {
    const res = await fetch(`${this.baseUrl}/api/organizations/${this.organizationId}/graph/`, {
      credentials: 'include',
      headers: { Accept: 'application/ld+json' },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Laden fehlgeschlagen (HTTP ${res.status}).`)
    return fromJsonLd(await res.json())
  }

  async save(model: KoralleModel): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/organizations/${this.organizationId}/graph/`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/ld+json' },
      body: JSON.stringify(toJsonLd(model)),
    })
    if (!res.ok) throw new Error(`Speichern fehlgeschlagen (HTTP ${res.status}).`)
  }
}

export const localRepository = new LocalRepository()
