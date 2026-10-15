/**
 * Domain types of the DRZ architecture model ("Baukasten").
 *
 * The model is a typed property graph. It maps 1:1 onto the planned backend
 * tables `OntologyNode` / `OntologyEdge`:
 * every node and edge has a type id from the catalog and a free-form
 * `properties` object that is stored as JSONB.
 */

/** Categories drive colour, icon and which features a module supports. */
export type Category =
  | 'struktur' // groups: site, hall/area, logical layer
  | 'prozess'
  | 'station' // workplace inside a production line (Plant → Line → Station)
  | 'lager'
  | 'ressource'
  | 'it'
  | 'daten'
  | 'team'
  | 'extern'
  | 'drz'

/** Struktur-, Regel- und Störgrößen (structure, control and disturbance variables). */
export type GroesseKind = 'struktur' | 'regel' | 'stoer'

/** 1 = sehr gering … 5 = sehr hoch; null = not yet assessed. */
export type Rating = 1 | 2 | 3 | 4 | 5

export interface Groesse {
  id: string
  kind: GroesseKind
  name: string
  /** Current or nominal value (free text so units like "45 s" or "3 Schichten" fit). */
  value?: string
  unit?: string
  /** Only for disturbances: likelihood and impact (risk matrix). */
  likelihood?: Rating | null
  impact?: Rating | null
  note?: string
}

export type Criticality = 1 | 2 | 3 | 4

/** Payload of an organisation module (a node on the canvas). */
export interface ModuleData extends Record<string, unknown> {
  typeId: string
  label: string
  description?: string
  /** Type specific attributes, validated by the catalog schema. */
  properties: Record<string, unknown>
  groessen: Groesse[]
  /** Ids of DRZ module nodes this module uses (organisation → DRZ capability). */
  drz: string[]
  /** Where the information comes from (document, interview, assumption). */
  source?: string
}

export type DependencyTypeId = 'material' | 'information' | 'control' | 'resource'

/** Payload of a dependency (an edge on the canvas). */
export interface DependencyData extends Record<string, unknown> {
  typeId: DependencyTypeId
  /** Short label, e.g. the transported good. */
  label?: string
  /** Messages / documents exchanged (information and control flows). */
  messages?: string[]
  criticality: Criticality
  /** Buffer or tolerated delay in minutes before the target is affected. */
  bufferMinutes?: number | null
  /** Optional dependency formula for the SemDT evaluator (syntax to be aligned with backend). */
  formula?: string
  /** Information exchanged in both directions. */
  bidirectional?: boolean
  /**
   * Material flows only: share in percent when the source routes each part to exactly one
   * successor (XOR split). Ignored for AND splits.
   */
  share?: number | null
  note?: string
  source?: string
}

/** Serializable model, independent of React Flow. Used for persistence, analysis and export. */
export interface ModelNode {
  id: string
  parentId?: string
  data: ModuleData
  layout: { x: number; y: number; width?: number; height?: number; collapsed?: boolean }
}

export interface ModelEdge {
  id: string
  source: string
  target: string
  data: DependencyData
}

export interface KoralleModel {
  schemaVersion: string
  organization: { id: string; name: string; description?: string }
  nodes: ModelNode[]
  edges: ModelEdge[]
}
