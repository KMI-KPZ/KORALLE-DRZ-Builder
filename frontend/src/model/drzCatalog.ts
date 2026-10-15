import type { ModelEdge, ModelNode } from './types'

/**
 * DRZ module kinds (software capabilities of the Digital Resilience Twin).
 *
 * Organisation modules are linked to DRZ modules. Each kind declares which
 * module types it applies to and what it needs as input. The inspector and
 * the DRZ matrix show the resulting readiness, so the Baukasten doubles as a
 * checklist for configuring the DRZ modules.
 */

export interface ReadinessContext {
  node: ModelNode
  incoming: ModelEdge[]
  outgoing: ModelEdge[]
  nodesById: Map<string, ModelNode>
  /** DRZ kinds already assigned to the node. */
  assignedKinds: Set<string>
}

export interface DrzKind {
  id: string
  label: string
  description: string
  /** Project reference (work package / issue / repo). */
  reference: string
  appliesTo: string[]
  /** Returns the list of missing inputs; empty means ready. */
  check: (ctx: ReadinessContext) => string[]
}

/** Minimum team size for aggregated evaluation. Assumption, to be confirmed with WHZ and works council. */
export const MIN_TEAM_SIZE = 5

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

/** Module types that become tasks in the simulated process chain. */
export const SIMULATABLE_TYPES = ['prozess', 'station', 'lager']

const countKind = (ctx: ReadinessContext, kind: 'struktur' | 'regel' | 'stoer') =>
  ctx.node.data.groessen.filter((g) => g.kind === kind && g.name.trim() !== '').length

export const DRZ_KINDS: DrzKind[] = [
  {
    id: 'simulation',
    label: 'Diskrete Simulation',
    description:
      'Ereignisdiskrete Simulation der Prozesskette aus den Materialflüssen: Durchsatz, Durchlaufzeit, Blockierungen, Engpässe, Was-wäre-wenn (Modell nach KORALLE-bpmn-graph-sim).',
    reference: 'AP 4 · #8',
    appliesTo: SIMULATABLE_TYPES,
    check: (ctx) => {
      const p = ctx.node.data.properties
      const missing: string[] = []
      const isBuffer = ctx.node.data.typeId === 'lager'
      if (!isBuffer && num(p.simZeit) === undefined) missing.push('Bearbeitungszeit')
      if (num(p.simKapazitaet) === undefined && !(isBuffer && num(p.stellplaetze) !== undefined)) missing.push('Kapazität')
      const inFlow = (e: ModelEdge, other: string) =>
        e.data.typeId === 'material' && SIMULATABLE_TYPES.includes(ctx.nodesById.get(other)?.data.typeId ?? '')
      if (!ctx.incoming.some((e) => inFlow(e, e.source)) && !ctx.outgoing.some((e) => inFlow(e, e.target))) {
        missing.push('Materialfluss zu einem anderen Prozessschritt')
      }
      return missing
    },
  },
  {
    id: 'fruehwarnung',
    label: 'Frühwarnung',
    description: 'Erkennt Störungen 10–30 Minuten im Voraus aus Live-Daten (1D-CNN aus KORALLE-Sandbox).',
    reference: 'AP 4',
    appliesTo: ['prozess', 'station', 'lager', 'it', 'ressource'],
    check: (ctx) => {
      const missing: string[] = []
      const hasSource = ctx.incoming.some((e) => ctx.nodesById.get(e.source)?.data.typeId === 'daten')
      if (!hasSource) missing.push('verbundene Datenquelle')
      if (countKind(ctx, 'stoer') === 0) missing.push('mindestens eine Störgröße')
      return missing
    },
  },
  {
    id: 'ki_vorschlag',
    label: 'KI-Vorschlagssystem',
    description: 'Leitet Handlungsempfehlungen ab: Welche Regelgröße hilft gegen welche Störgröße?',
    reference: 'AP 4 · TZ 3',
    appliesTo: ['prozess', 'station', 'lager', 'it', 'ressource', 'team'],
    check: (ctx) => {
      const missing: string[] = []
      if (countKind(ctx, 'stoer') === 0) missing.push('mindestens eine Störgröße')
      if (countKind(ctx, 'regel') === 0) missing.push('mindestens eine Regelgröße')
      return missing
    },
  },
  {
    id: 'intervention',
    label: 'Intervention-Engine',
    description:
      'Setzt Empfehlungen und Impulse in Maßnahmen um und verfolgt deren Wirkung, vor allem auf Teamebene.',
    reference: '#11',
    appliesTo: ['prozess', 'station', 'lager', 'it', 'ressource', 'team'],
    check: (ctx) =>
      ctx.assignedKinds.has('fruehwarnung') || ctx.assignedKinds.has('ki_vorschlag') || ctx.assignedKinds.has('tagebuch')
        ? []
        : ['Auslöser: Frühwarnung, KI-Vorschlagssystem oder Tagebuchstudie'],
  },
  {
    id: 'tagebuch',
    label: 'Tagebuchstudie (TBS)',
    description:
      'Erfasst Belastung und Ressourcen per App (freiwillig, 2 Wellen à 10 Arbeitstage, 3 Fragebögen pro Tag, Vitalwerte) und wertet nur auf Kollektivebene aus.',
    reference: 'AP 3.4 · #10',
    appliesTo: ['team'],
    check: (ctx) => {
      const size = num(ctx.node.data.properties.teamgroesse)
      if (size === undefined) return ['Teamgröße']
      if (size < MIN_TEAM_SIZE) return [`Teamgröße mindestens ${MIN_TEAM_SIZE} (Anonymität)`]
      return []
    },
  },
  {
    id: 'ideen',
    label: 'Ideenmanagement',
    description: 'Sammelt Vorschläge der Mitarbeitenden und lässt sie im DRZ simulieren.',
    reference: 'AP 2 · #3',
    appliesTo: ['prozess', 'station', 'lager', 'ressource', 'it', 'team'],
    check: () => [],
  },
  {
    id: 'streaming',
    label: 'Daten-Streaming',
    description: 'Bindet Live-Daten an (TimescaleDB, WebSockets) und stellt sie den Modulen bereit.',
    reference: '#1 · #9',
    appliesTo: ['daten', 'it'],
    check: (ctx) => {
      const p = ctx.node.data.properties
      if (ctx.node.data.typeId === 'daten' && !str(p.protokoll)) return ['Protokoll / Format']
      if (ctx.node.data.typeId === 'daten' && p.zugang !== 'vorhanden') return ['Datenzugang „vorhanden“']
      if (ctx.node.data.typeId === 'daten' && p.echtzeit !== true) return ['Live-Zugriff (echtzeitfähig)']
      return []
    },
  },
  {
    id: 'assistenz',
    label: 'MCP / LLM-Assistenz',
    description: 'Sprachassistenz, die Modell, Simulation und Empfehlungen erklärt.',
    reference: 'Ref.-Architektur',
    appliesTo: ['prozess', 'station', 'lager', 'ressource', 'it', 'daten', 'team'],
    check: () => [],
  },
]

const KIND_BY_ID = new Map(DRZ_KINDS.map((k) => [k.id, k]))

export function findDrzKind(id: unknown): DrzKind | undefined {
  return typeof id === 'string' ? KIND_BY_ID.get(id) : undefined
}
