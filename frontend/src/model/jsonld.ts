import { findDependencyTypeByClass, findModuleType, findModuleTypeByClass, getDependencyType } from './catalog'
import type { Criticality, DependencyData, Groesse, KoralleModel, ModelEdge, ModelNode } from './types'

/**
 * JSON-LD serialization of the model.
 *
 * The vocabulary IRI is a placeholder until it is aligned with the ontology
 * in `apps/semantics` (and the Magna/CPT .ttl files in KORALLE-Sandbox).
 * Type-specific attributes and layout are JSON literals (`@json`) so that the
 * backend can store them 1:1 in JSONB columns.
 */
export const KORALLE_VOCAB = 'urn:koralle:vocab:'
export const SCHEMA_VERSION = '0.3.0'

export const JSONLD_CONTEXT = {
  '@vocab': KORALLE_VOCAB,
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  label: 'rdfs:label',
  description: 'rdfs:comment',
  partOf: { '@type': '@id' },
  source: { '@type': '@id' },
  target: { '@type': '@id' },
  usesDrzModule: { '@type': '@id', '@container': '@set' },
  messages: { '@container': '@list' },
  properties: { '@type': '@json' },
  variables: { '@type': '@json' },
  layout: { '@type': '@json' },
} as const

const orgIri = (orgId: string) => `urn:koralle:${orgId}`
const itemIri = (orgId: string, id: string) => `urn:koralle:${orgId}:${id}`

function localId(orgId: string, iri: unknown): string {
  if (typeof iri !== 'string' || iri === '') throw new Error('Ein Element hat keine gültige @id.')
  const prefix = `${itemIri(orgId, '')}`
  return iri.startsWith(prefix) ? iri.slice(prefix.length) : iri
}

type JsonObject = Record<string, unknown>

export function toJsonLd(model: KoralleModel): JsonObject {
  const org = model.organization
  const graph: JsonObject[] = [
    {
      '@id': orgIri(org.id),
      '@type': 'Organization',
      label: org.name,
      ...(org.description ? { description: org.description } : {}),
      schemaVersion: model.schemaVersion,
    },
  ]
  for (const n of model.nodes) {
    const type = findModuleType(n.data.typeId)
    graph.push(
      stripUndefined({
        '@id': itemIri(org.id, n.id),
        '@type': type?.rdfClass ?? n.data.typeId,
        moduleType: n.data.typeId,
        label: n.data.label,
        description: n.data.description || undefined,
        partOf: n.parentId ? itemIri(org.id, n.parentId) : orgIri(org.id),
        properties: n.data.properties,
        variables: n.data.groessen.length > 0 ? n.data.groessen : undefined,
        usesDrzModule: n.data.drz.length > 0 ? n.data.drz.map((id) => itemIri(org.id, id)) : undefined,
        provenance: n.data.source || undefined,
        layout: n.layout,
      }),
    )
  }
  for (const e of model.edges) {
    const d = e.data
    graph.push(
      stripUndefined({
        '@id': itemIri(org.id, e.id),
        '@type': getDependencyType(d.typeId).rdfClass,
        source: itemIri(org.id, e.source),
        target: itemIri(org.id, e.target),
        label: d.label || undefined,
        messages: d.messages && d.messages.length > 0 ? d.messages : undefined,
        criticality: d.criticality,
        bufferMinutes: d.bufferMinutes ?? undefined,
        formula: d.formula || undefined,
        bidirectional: d.bidirectional || undefined,
        share: typeof d.share === 'number' ? d.share : undefined,
        note: d.note || undefined,
        provenance: d.source || undefined,
      }),
    )
  }
  return { '@context': JSONLD_CONTEXT, '@id': `${orgIri(org.id)}:model`, '@graph': graph }
}

function stripUndefined(obj: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

function toCriticality(v: unknown): Criticality {
  return v === 1 || v === 2 || v === 3 || v === 4 ? v : 2
}

function toGroessen(v: unknown): Groesse[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObject).map((g, i) => ({
    id: typeof g.id === 'string' ? g.id : `g-${i}`,
    kind: g.kind === 'regel' || g.kind === 'stoer' ? g.kind : 'struktur',
    name: typeof g.name === 'string' ? g.name : '',
    value: typeof g.value === 'string' ? g.value : undefined,
    unit: typeof g.unit === 'string' ? g.unit : undefined,
    likelihood: typeof g.likelihood === 'number' ? (g.likelihood as Groesse['likelihood']) : null,
    impact: typeof g.impact === 'number' ? (g.impact as Groesse['impact']) : null,
    note: typeof g.note === 'string' ? g.note : undefined,
  }))
}

/** Parses a document written by `toJsonLd`. Throws an Error with a user-facing message. */
export function fromJsonLd(doc: unknown): KoralleModel {
  if (!isObject(doc) || !Array.isArray(doc['@graph'])) {
    throw new Error('Die Datei enthält kein JSON-LD mit „@graph“.')
  }
  const items = doc['@graph'].filter(isObject)
  const org = items.find((i) => i['@type'] === 'Organization')
  if (!org || typeof org['@id'] !== 'string') {
    throw new Error('Im Modell fehlt die Organisation (@type „Organization“).')
  }
  const orgId = org['@id'].replace(/^urn:koralle:/, '')
  const nodes: ModelNode[] = []
  const edges: ModelEdge[] = []

  for (const item of items) {
    const rdfType = item['@type']
    if (rdfType === 'Organization') continue
    const moduleType =
      (typeof item.moduleType === 'string' ? findModuleType(item.moduleType) : undefined) ??
      (typeof rdfType === 'string' ? findModuleTypeByClass(rdfType) : undefined)
    if (moduleType) {
      const parent = typeof item.partOf === 'string' && item.partOf !== orgIri(orgId) ? localId(orgId, item.partOf) : undefined
      const layout = isObject(item.layout) ? item.layout : {}
      nodes.push({
        id: localId(orgId, item['@id']),
        parentId: parent,
        layout: {
          x: typeof layout.x === 'number' ? layout.x : 0,
          y: typeof layout.y === 'number' ? layout.y : 0,
          width: typeof layout.width === 'number' ? layout.width : undefined,
          height: typeof layout.height === 'number' ? layout.height : undefined,
          collapsed: layout.collapsed === true ? true : undefined,
        },
        data: {
          typeId: moduleType.id,
          label: typeof item.label === 'string' ? item.label : moduleType.label,
          description: typeof item.description === 'string' ? item.description : undefined,
          properties: isObject(item.properties) ? item.properties : {},
          groessen: toGroessen(item.variables),
          drz: Array.isArray(item.usesDrzModule) ? item.usesDrzModule.map((id) => localId(orgId, id)) : [],
          source: typeof item.provenance === 'string' ? item.provenance : undefined,
        },
      })
      continue
    }
    const depType = typeof rdfType === 'string' ? findDependencyTypeByClass(rdfType) : undefined
    if (depType) {
      const data: DependencyData = {
        typeId: depType.id,
        label: typeof item.label === 'string' ? item.label : undefined,
        messages: Array.isArray(item.messages) ? item.messages.filter((m): m is string => typeof m === 'string') : undefined,
        criticality: toCriticality(item.criticality),
        bufferMinutes: typeof item.bufferMinutes === 'number' ? item.bufferMinutes : null,
        formula: typeof item.formula === 'string' ? item.formula : undefined,
        bidirectional: item.bidirectional === true,
        share: typeof item.share === 'number' ? item.share : null,
        note: typeof item.note === 'string' ? item.note : undefined,
        source: typeof item.provenance === 'string' ? item.provenance : undefined,
      }
      edges.push({
        id: localId(orgId, item['@id']),
        source: localId(orgId, item.source),
        target: localId(orgId, item.target),
        data,
      })
    }
  }

  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    if (n.parentId && !ids.has(n.parentId)) n.parentId = undefined
    n.data.drz = n.data.drz.filter((id) => ids.has(id))
  }
  return migrate({
    schemaVersion: typeof org.schemaVersion === 'string' ? org.schemaVersion : SCHEMA_VERSION,
    organization: {
      id: orgId,
      name: typeof org.label === 'string' ? org.label : orgId,
      description: typeof org.description === 'string' ? org.description : undefined,
    },
    nodes,
    edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
  })
}

/** Orders semantic versions like "0.2.0" numerically. */
function versionKey(v: string): number {
  const [a = 0, b = 0, c = 0] = v.split('.').map((x) => Number.parseInt(x, 10) || 0)
  return a * 1_000_000 + b * 1_000 + c
}

type Migration = { to: string; run: (model: KoralleModel) => KoralleModel }

/**
 * Schema migrations, applied in order to models saved with an older version.
 *
 * 0.1.0 → 0.2.0: "TBS" (issue #10) is the diary study (Tagebuchstudie), not a
 * separate takt module. The former `takt` DRZ module and its assignments are removed.
 *
 * 0.2.0 → 0.3.0: simulation times are stored in seconds (was minutes), matching
 * the simulation contract koralle.sim/v1.
 */
const MIGRATIONS: Migration[] = [
  {
    to: '0.2.0',
    run: (model) => {
      const removed = new Set(model.nodes.filter((n) => n.data.properties.drzKind === 'takt').map((n) => n.id))
      const nodes = model.nodes
        .filter((n) => !removed.has(n.id))
        .map((n) => {
          let data = n.data
          if (data.drz.some((id) => removed.has(id))) data = { ...data, drz: data.drz.filter((id) => !removed.has(id)) }
          if (data.properties.drzKind === 'tagebuch' && !data.properties.issue) {
            data = { ...data, properties: { ...data.properties, issue: '#10' } }
          }
          return data === n.data ? n : { ...n, data }
        })
      const edges = model.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target))
      return { ...model, nodes, edges }
    },
  },
  {
    to: '0.3.0',
    run: (model) => ({
      ...model,
      nodes: model.nodes.map((n) => {
        const t = n.data.properties.simZeit
        if (typeof t !== 'number') return n
        return { ...n, data: { ...n.data, properties: { ...n.data.properties, simZeit: t * 60 } } }
      }),
    }),
  },
]

/** Upgrades models saved with an older schema. Returns the same object when nothing changes. */
export function migrate(model: KoralleModel): KoralleModel {
  if (model.schemaVersion === SCHEMA_VERSION) return model
  let current = model
  for (const m of MIGRATIONS) {
    if (versionKey(current.schemaVersion) < versionKey(m.to)) current = { ...m.run(current), schemaVersion: m.to }
  }
  return { ...current, schemaVersion: SCHEMA_VERSION }
}
