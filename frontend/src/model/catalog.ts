import type { Category, DependencyTypeId } from './types'

/**
 * Module type catalog.
 *
 * The catalog is plain data on purpose: a new pilot (CPT, DBI, …) should be
 * modelled by adding catalog entries, not by writing frontend code. The
 * `properties` block is a small JSON-Schema subset; the inspector renders a
 * form from it. `unit` and `group` serialize as `x-unit` / `x-group`.
 */

export interface FieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  title: string
  description?: string
  enum?: string[]
  /** Display labels for enum values (the stored value stays short and stable). */
  enumLabels?: Record<string, string>
  unit?: string
  minimum?: number
  maximum?: number
  /** UI section heading inside the inspector. */
  group?: string
  multiline?: boolean
  /** For `array`: only string lists are supported. */
  items?: { type: 'string' }
}

export interface PropertySchema {
  type: 'object'
  properties: Record<string, FieldSchema>
}

export interface ModuleType {
  id: string
  label: string
  /** Class name in the JSON-LD export (vocabulary is English like the backend). */
  rdfClass: string
  category: Category
  /** Lucide icon name, resolved in components/Icon.tsx. */
  icon: string
  description: string
  isGroup?: boolean
  /** Supports Struktur-/Regel-/Störgrößen. */
  hasGroessen: boolean
  /** Can be linked to DRZ modules. */
  drzAssignable: boolean
  properties: PropertySchema
}

export const CATEGORY_META: Record<Category, { label: string; colorVar: string }> = {
  struktur: { label: 'Struktur', colorVar: '--cat-struktur' },
  prozess: { label: 'Prozessmodule', colorVar: '--cat-prozess' },
  station: { label: 'Stationen / Arbeitsplätze', colorVar: '--cat-prozess' },
  lager: { label: 'Puffer & Lager', colorVar: '--cat-lager' },
  ressource: { label: 'Ressourcen', colorVar: '--cat-ressource' },
  it: { label: 'IT-Systeme', colorVar: '--cat-it' },
  daten: { label: 'Datenquellen', colorVar: '--cat-daten' },
  team: { label: 'Teams (aggregiert)', colorVar: '--cat-team' },
  extern: { label: 'Externe Akteure', colorVar: '--cat-extern' },
  drz: { label: 'DRZ-Module', colorVar: '--cat-drz' },
}

/** Order in which categories appear in the palette and legend. */
export const CATEGORY_ORDER: Category[] = [
  'struktur',
  'prozess',
  'station',
  'lager',
  'ressource',
  'it',
  'daten',
  'team',
  'extern',
  'drz',
]

const GEWICHTUNG: FieldSchema = {
  type: 'string',
  title: 'Gewichtung',
  description: 'Wie stark wirkt das Modul auf die Resilienz des Gesamtsystems?',
  enum: ['niedrig', 'mittel', 'hoch'],
  group: 'Allgemein',
}

const SIM_GROUP = 'Simulation'

/**
 * Parameters for the discrete-event simulation (apps/simulations, contract koralle.sim/v1).
 * They follow the task format of KORALLE-bpmn-graph-sim
 * (`name; time; variance; capacity; fail_chance; gateway_type`). Times are in seconds.
 */
export const SIMULATION_FIELDS: Record<string, FieldSchema> = {
  simZeit: {
    type: 'number',
    title: 'Bearbeitungszeit (Mittel)',
    description: 'Parameter „time“ in bpmn-graph-sim. Bei Puffern die Verweilzeit, sonst 0.',
    unit: 's',
    minimum: 0,
    group: SIM_GROUP,
  },
  simVarianz: {
    type: 'number',
    title: 'Varianz der Bearbeitungszeit',
    description: 'Parameter „variance“. Die Zeit wird pro Teil normalverteilt gezogen.',
    unit: 's²',
    minimum: 0,
    group: SIM_GROUP,
  },
  simKapazitaet: {
    type: 'integer',
    title: 'Kapazität (parallel)',
    description: 'Parameter „capacity“: wie viele Teile gleichzeitig im Modul sein können.',
    minimum: 1,
    group: SIM_GROUP,
  },
  simAusfall: {
    type: 'number',
    title: 'Ausfall- / Nacharbeitswahrscheinlichkeit',
    description: 'Parameter „fail_chance“ (0–1). Bei Ausfall wird die Bearbeitung wiederholt.',
    minimum: 0,
    maximum: 1,
    group: SIM_GROUP,
  },
  simVerzweigung: {
    type: 'string',
    title: 'Verzweigung (mehrere Folgeschritte)',
    description: 'Parameter „gateway_type“. Ohne Angabe: UND.',
    enum: ['AND', 'XOR'],
    enumLabels: { AND: 'UND – jedes Teil geht in alle Folgeschritte', XOR: 'XODER – jedes Teil geht in einen Folgeschritt' },
    group: SIM_GROUP,
  },
  simZusammenfuehrung: {
    type: 'string',
    title: 'Zusammenführung (mehrere Vorgänger)',
    description: 'Ohne Angabe: UND (wartet auf alle Zuflüsse eines Teils, z. B. Montage).',
    enum: ['AND', 'XOR'],
    enumLabels: { AND: 'UND – auf alle Zuflüsse warten', XOR: 'XODER – jede Ankunft einzeln' },
    group: SIM_GROUP,
  },
  bpmnRef: {
    type: 'string',
    title: 'BPMN-Detailmodell (optional)',
    description: 'Referenz auf ein BPMN-Modell (Datei oder Prozess-ID), vgl. Issue #12.',
    group: SIM_GROUP,
  },
}

export const MODULE_TYPES: ModuleType[] = [
  // ── Struktur (groups) ──────────────────────────────────────────────
  {
    id: 'standort',
    label: 'Standort',
    rdfClass: 'Site',
    category: 'struktur',
    icon: 'MapPin',
    description: 'Werk oder Niederlassung. Kann Hallen und Bereiche enthalten.',
    isGroup: true,
    hasGroessen: false,
    drzAssignable: false,
    properties: {
      type: 'object',
      properties: {
        ort: { type: 'string', title: 'Ort', group: 'Allgemein' },
        mitarbeitende: { type: 'integer', title: 'Mitarbeitende', minimum: 0, group: 'Allgemein' },
      },
    },
  },
  {
    id: 'halle',
    label: 'Halle / Bereich',
    rdfClass: 'Area',
    category: 'struktur',
    icon: 'Factory',
    description: 'Physischer Bereich, der Prozessmodule, Datenquellen und Teams bündelt.',
    isGroup: true,
    hasGroessen: false,
    drzAssignable: false,
    properties: {
      type: 'object',
      properties: {
        kuerzel: { type: 'string', title: 'Kürzel', group: 'Allgemein' },
      },
    },
  },
  {
    id: 'ebene',
    label: 'Ebene / Schicht',
    rdfClass: 'Layer',
    category: 'struktur',
    icon: 'Layers',
    description: 'Logische Gruppierung, z. B. IT-Systemlandschaft oder DRZ-Module.',
    isGroup: true,
    hasGroessen: false,
    drzAssignable: false,
    properties: { type: 'object', properties: {} },
  },
  {
    id: 'linie',
    label: 'Linie',
    rdfClass: 'ProductionLine',
    category: 'struktur',
    icon: 'Workflow',
    description: 'Fertigungs- oder Montagelinie mit Stationen (Plant → Line → Station).',
    isGroup: true,
    hasGroessen: false,
    drzAssignable: false,
    properties: {
      type: 'object',
      properties: {
        kuerzel: { type: 'string', title: 'Kürzel', group: 'Allgemein' },
        takt: { type: 'number', title: 'Takt', unit: 's', minimum: 0, group: 'Allgemein' },
      },
    },
  },

  // ── Organisation modules ───────────────────────────────────────────
  {
    id: 'prozess',
    label: 'Prozessmodul',
    rdfClass: 'ProcessModule',
    category: 'prozess',
    icon: 'Cog',
    description: 'Wertschöpfender Prozessschritt mit Struktur-, Regel- und Störgrößen.',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        kuerzel: { type: 'string', title: 'Kürzel', group: 'Allgemein' },
        verantwortlich: {
          type: 'string',
          title: 'Verantwortliche Rolle',
          description: 'Rolle statt Personenname (Datenschutz).',
          group: 'Allgemein',
        },
        gewichtung: GEWICHTUNG,
        teilbereiche: {
          type: 'array',
          items: { type: 'string' },
          title: 'Teilbereiche / Stationen',
          group: 'Allgemein',
        },
        ...SIMULATION_FIELDS,
      },
    },
  },
  {
    id: 'station',
    label: 'Station / Arbeitsplatz',
    rdfClass: 'Station',
    category: 'station',
    icon: 'Wrench',
    description: 'Arbeitsplatz in einer Linie, z. B. aus Layout oder ERA. Kompakt dargestellt.',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        lnr: { type: 'string', title: 'Laufende Nummer (Layout)', group: 'Allgemein' },
        stationstyp: {
          type: 'string',
          title: 'Stationstyp',
          enum: ['SSA', 'MOVO', 'BOL', 'EOL', 'KA', 'Vormontage', 'Stanze', 'Sonstiges'],
          group: 'Allgemein',
        },
        derivate: { type: 'array', items: { type: 'string' }, title: 'Fahrzeuge / Derivate', group: 'Allgemein' },
        opcArbeitsplatz: {
          type: 'string',
          title: 'Arbeitsplatz-ID in den OPC-Events',
          description: 'Zuordnung zu den Statusdaten der Montage (von Magna zu bestätigen).',
          group: 'Daten',
        },
        eraPunkte: {
          type: 'number',
          title: 'ERA-Punktwert',
          description: 'Ergonomische Risikoanalyse: 0–20 gering, 21–35 mäßig, 36–55 hoch, 56–80 sehr hoch.',
          minimum: 0,
          maximum: 100,
          group: 'Ergonomie (ERA)',
        },
        eraMittelwert: {
          type: 'boolean',
          title: 'Punktwert ist ein Mittelwert (Ø) über Varianten',
          group: 'Ergonomie (ERA)',
        },
        eraHinweis: { type: 'string', title: 'Hinweis ERA', description: 'z. B. getrennte Werte M/W', group: 'Ergonomie (ERA)' },
        ...SIMULATION_FIELDS,
      },
    },
  },
  {
    id: 'lager',
    label: 'Puffer / Lager',
    rdfClass: 'BufferStorage',
    category: 'lager',
    icon: 'Warehouse',
    description: 'Puffer oder Lager zwischen Prozessschritten, z. B. Hochregallager.',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        kuerzel: { type: 'string', title: 'Kürzel', group: 'Allgemein' },
        gewichtung: GEWICHTUNG,
        stellplaetze: { type: 'integer', title: 'Stellplätze', minimum: 0, group: 'Allgemein' },
        strategie: {
          type: 'string',
          title: 'Ein-/Auslagerstrategie',
          description: 'z. B. FIFO, nach Farbe/Typ/Charge',
          group: 'Allgemein',
        },
        ...SIMULATION_FIELDS,
      },
    },
  },
  {
    id: 'ressource',
    label: 'Ressource / Flotte',
    rdfClass: 'Resource',
    category: 'ressource',
    icon: 'Forklift',
    description: 'Geteilte Ressource wie Staplerflotte, AMR oder Ladungsträger.',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        anzahl: { type: 'integer', title: 'Anzahl', minimum: 0, group: 'Allgemein' },
        verfuegbarkeit: {
          type: 'number',
          title: 'Verfügbarkeit',
          unit: '%',
          minimum: 0,
          maximum: 100,
          group: 'Allgemein',
        },
      },
    },
  },
  {
    id: 'it',
    label: 'IT-System',
    rdfClass: 'ITSystem',
    category: 'it',
    icon: 'Server',
    description: 'Anwendung oder Schnittstelle (ERP, MES, WMS, EDI …).',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        systemtyp: {
          type: 'string',
          title: 'Systemtyp',
          enum: [
            'ERP',
            'Produktionsmanagement / MES',
            'Lagerverwaltung / WMS',
            'Planung / Steuerung',
            'Schnittstelle / EDI',
            'Qualität',
            'Monitoring / Andon',
            'Rückfallebene',
            'Sonstiges',
          ],
          group: 'Allgemein',
        },
        hersteller: { type: 'string', title: 'Hersteller / Produkt', group: 'Allgemein' },
        gewichtung: GEWICHTUNG,
      },
    },
  },
  {
    id: 'daten',
    label: 'Datenquelle',
    rdfClass: 'DataSource',
    category: 'daten',
    icon: 'Radio',
    description: 'Sensor, Leser oder Datenbank, die Daten in den DRZ liefert.',
    hasGroessen: false,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        protokoll: {
          type: 'string',
          title: 'Protokoll / Format',
          enum: [
            'OPC UA',
            'OPC (klassisch)',
            'MQTT',
            'Euromap 63',
            'Euromap 77',
            'RFID / EPC',
            'Barcode',
            'Datenbank',
            'CSV / Datei',
            'REST-API',
            'Sonstiges',
          ],
          group: 'Anbindung',
        },
        frequenz: { type: 'string', title: 'Frequenz', description: 'z. B. ereignisbasiert, 1 Hz', group: 'Anbindung' },
        echtzeit: { type: 'boolean', title: 'Echtzeitfähig', group: 'Anbindung' },
        zugang: {
          type: 'string',
          title: 'Datenzugang',
          enum: ['offen', 'beantragt', 'vorhanden'],
          group: 'Anbindung',
        },
        zugangsweg: {
          type: 'string',
          title: 'Zugangsweg',
          description: 'z. B. CSV-Export, Datenbank-Snapshot, VPN-Tunnel',
          group: 'Anbindung',
        },
      },
    },
  },
  {
    id: 'team',
    label: 'Team (aggregiert)',
    rdfClass: 'Team',
    category: 'team',
    icon: 'Users',
    description:
      'Team oder Rolle. Individuelle Daten erscheinen hier nie, nur aggregierte Werte ab einer Mindestgröße.',
    hasGroessen: true,
    drzAssignable: true,
    properties: {
      type: 'object',
      properties: {
        teamgroesse: {
          type: 'integer',
          title: 'Teamgröße',
          description: 'Aggregierte Auswertungen erst ab der Mindestgröße (siehe DRZ-Modul Tagebuchstudie).',
          minimum: 0,
          group: 'Allgemein',
        },
        schichtbetrieb: { type: 'boolean', title: 'Schichtbetrieb', group: 'Allgemein' },
      },
    },
  },
  {
    id: 'extern',
    label: 'Externer Akteur',
    rdfClass: 'ExternalActor',
    category: 'extern',
    icon: 'Building2',
    description: 'Kunde, Lieferant oder Dienstleister außerhalb der Organisation.',
    hasGroessen: true,
    drzAssignable: false,
    properties: {
      type: 'object',
      properties: {
        rolle: {
          type: 'string',
          title: 'Rolle',
          enum: ['Kunde / OEM', 'Lieferant', 'Dienstleister', 'Sonstiges'],
          group: 'Allgemein',
        },
      },
    },
  },
  {
    id: 'drz',
    label: 'DRZ-Modul',
    rdfClass: 'DRZModule',
    category: 'drz',
    icon: 'Boxes',
    description: 'Fähigkeit des Digitalen Resilienz-Zwillings, die Organisationsmodulen zugeordnet wird.',
    hasGroessen: false,
    drzAssignable: false,
    properties: {
      type: 'object',
      properties: {
        drzKind: { type: 'string', title: 'Modulart', group: 'DRZ' },
        status: {
          type: 'string',
          title: 'Entwicklungsstand',
          enum: ['geplant', 'in Entwicklung', 'prototypisch', 'im Pilotbetrieb', 'verfügbar'],
          group: 'DRZ',
        },
        arbeitspaket: { type: 'string', title: 'Arbeitspaket', group: 'DRZ' },
        issue: { type: 'string', title: 'GitHub-Issue', group: 'DRZ' },
      },
    },
  },
]

const TYPE_BY_ID = new Map(MODULE_TYPES.map((t) => [t.id, t]))
const TYPE_BY_CLASS = new Map(MODULE_TYPES.map((t) => [t.rdfClass, t]))

export function getModuleType(id: string): ModuleType {
  const t = TYPE_BY_ID.get(id)
  if (!t) throw new Error(`Unknown module type: ${id}`)
  return t
}

export function findModuleType(id: string): ModuleType | undefined {
  return TYPE_BY_ID.get(id)
}

export function findModuleTypeByClass(rdfClass: string): ModuleType | undefined {
  return TYPE_BY_CLASS.get(rdfClass)
}

// ── Dependency types ────────────────────────────────────────────────

export interface DependencyType {
  id: DependencyTypeId
  label: string
  shortLabel: string
  rdfClass: string
  description: string
  colorVar: string
  /** SVG stroke-dasharray, empty for solid. */
  dash: string
  width: number
  hasMessages: boolean
  /** Does a disturbance travel along this edge by default? */
  propagates: boolean
}

export const DEPENDENCY_TYPES: DependencyType[] = [
  {
    id: 'material',
    label: 'Materialfluss',
    shortLabel: 'Material',
    rdfClass: 'MaterialFlow',
    description: 'Physischer Fluss von Material, Teilen oder Ladungsträgern.',
    colorVar: '--edge-material',
    dash: '',
    width: 2.5,
    hasMessages: false,
    propagates: true,
  },
  {
    id: 'information',
    label: 'Informationsfluss',
    shortLabel: 'Information',
    rdfClass: 'InformationFlow',
    description: 'Daten oder Meldungen, auf die das Ziel angewiesen ist (z. B. ASN, Rückmeldungen).',
    colorVar: '--edge-information',
    dash: '7 5',
    width: 1.6,
    hasMessages: true,
    propagates: true,
  },
  {
    id: 'control',
    label: 'Steuerung / Vorgabe',
    shortLabel: 'Steuerung',
    rdfClass: 'Control',
    description: 'Pläne und Aufträge, die das Ziel steuern (z. B. Lackplan, Fahraufträge).',
    colorVar: '--edge-control',
    dash: '2 5',
    width: 2,
    hasMessages: true,
    propagates: true,
  },
  {
    id: 'resource',
    label: 'Ressourcennutzung',
    shortLabel: 'Ressource',
    rdfClass: 'ResourceUse',
    description: 'Das Ziel nutzt die Ressource (Stapler, AMR, Ladungsträger).',
    colorVar: '--edge-resource',
    dash: '',
    width: 1.3,
    hasMessages: false,
    propagates: true,
  },
]

const DEP_BY_ID = new Map(DEPENDENCY_TYPES.map((t) => [t.id, t]))
const DEP_BY_CLASS = new Map(DEPENDENCY_TYPES.map((t) => [t.rdfClass, t]))

export function getDependencyType(id: DependencyTypeId): DependencyType {
  return DEP_BY_ID.get(id) ?? DEPENDENCY_TYPES[0]
}

export function findDependencyTypeByClass(rdfClass: string): DependencyType | undefined {
  return DEP_BY_CLASS.get(rdfClass)
}

export const CRITICALITY_META: Record<number, { label: string; colorVar: string }> = {
  1: { label: 'niedrig', colorVar: '--status-low' },
  2: { label: 'mittel', colorVar: '--status-warning' },
  3: { label: 'hoch', colorVar: '--status-serious' },
  4: { label: 'kritisch', colorVar: '--status-critical' },
}

export const GROESSE_META = {
  struktur: { label: 'Strukturgrößen', singular: 'Strukturgröße', hint: 'Was ist vorhanden? Kapazitäten, Layout, Ausstattung.' },
  regel: { label: 'Regelgrößen', singular: 'Regelgröße', hint: 'Womit wird gesteuert? Logiken, Strategien, Vorgaben.' },
  stoer: { label: 'Störgrößen', singular: 'Störgröße', hint: 'Was kann schiefgehen? Ausfälle, Fehler, Verzögerungen.' },
} as const
