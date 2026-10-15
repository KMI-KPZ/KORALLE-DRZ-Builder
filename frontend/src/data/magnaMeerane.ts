import { SCHEMA_VERSION } from '../model/jsonld'
import { ERA_SOURCE, MAGNA_STATIONS, type Line } from './magnaStations'
import type {
  Criticality,
  DependencyData,
  DependencyTypeId,
  Groesse,
  KoralleModel,
  ModelEdge,
  ModelNode,
} from '../model/types'

/**
 * Starting model for Magna Exteriors Meerane.
 *
 * Sources (folder KORALLE-DRZ/docs):
 *  - MAIL: "Beschreibung aus Mail.docx" – process modules with Struktur-,
 *    Regel- and Störgrößen, taken over verbatim.
 *  - SYS: "20260316_MEZ_Systemlandschaft Meerane_IE_LIV.pdf" – halls, areas,
 *    IT systems and named information flows.
 *  - VB: Vorhabenbeschreibung KORALLE V0.3.
 *  - ERA: "20240820_I_MEZ_Layout Montage MEB ERA Visualisierung" – workplaces
 *    of the assembly with ergonomic risk points (see magnaStations.ts).
 *  - MEETING: KORALLE technical meeting (transcript, Oct 2026) – data from the
 *    assembly (takt, OPC status events), status of the DRZ modules.
 * Anything marked "Annahme" or "Beispiel" is not backed by a document and must
 * be confirmed with Magna. No figures (capacities, probabilities) are invented.
 */

const MAIL = 'Beschreibung aus Mail'
const SYS = 'Systemlandschaft Meerane (16.03.2026)'
const MEETING = 'Technik-Meeting KORALLE (Transkript, Okt. 2026)'

let seq = 0
function groessen(struktur: string[], regel: string[], stoer: string[]): Groesse[] {
  const make = (kind: Groesse['kind']) => (name: string): Groesse => ({
    id: `g${++seq}`,
    kind,
    name,
    likelihood: null,
    impact: null,
  })
  return [...struktur.map(make('struktur')), ...regel.map(make('regel')), ...stoer.map(make('stoer'))]
}

interface NodeOpts {
  description?: string
  properties?: Record<string, unknown>
  groessen?: Groesse[]
  drz?: string[]
  source?: string
  width?: number
  height?: number
}

function node(
  id: string,
  typeId: string,
  label: string,
  parentId: string | undefined,
  x: number,
  y: number,
  opts: NodeOpts = {},
): ModelNode {
  return {
    id,
    parentId,
    layout: { x, y, width: opts.width, height: opts.height },
    data: {
      typeId,
      label,
      description: opts.description,
      properties: opts.properties ?? {},
      groessen: opts.groessen ?? [],
      drz: opts.drz ?? [],
      source: opts.source,
    },
  }
}

let edgeSeq = 0
function edge(
  typeId: DependencyTypeId,
  source: string,
  target: string,
  label: string,
  criticality: Criticality,
  extra: Partial<DependencyData> = {},
): ModelEdge {
  return {
    id: `e${++edgeSeq}`,
    source,
    target,
    data: { typeId, label, criticality, source: SYS, ...extra },
  }
}

// Layout grid inside groups.
const ROW1 = 56
const ROW2 = 160
const ROW3 = 264
const COL = (i: number) => 20 + i * 235
const GROUP_H = 256

// Montage hall has a third row for the data sources of the assembly.
const MONTAGE_Y = 610
const MONTAGE_H = GROUP_H + 104
const DRZ_Y = MONTAGE_Y + MONTAGE_H + 64
const LINES_Y = DRZ_Y + GROUP_H + 60

// Compact station grid inside the line groups.
const STATION_COLS = 3
const STATION_X = (i: number) => 16 + (i % STATION_COLS) * 160
const STATION_Y = (i: number) => 52 + Math.floor(i / STATION_COLS) * 60
const LINE_W = 16 + STATION_COLS * 160 + 6
const lineHeight = (count: number) => 52 + Math.ceil(count / STATION_COLS) * 60 + 8

export function createMagnaModel(): KoralleModel {
  seq = 0
  edgeSeq = 0

  const nodes: ModelNode[] = [
    // ── Groups ────────────────────────────────────────────────────
    node('ebene-it', 'ebene', 'IT-Systemlandschaft', undefined, 0, 0, {
      width: COL(6) - 15,
      height: GROUP_H,
      description: 'Systeme aus den Schichten Magna-Dienste, Planungsdienste und SAP der Systemlandschaft.',
      source: SYS,
    }),
    node('halle-sg', 'halle', 'Halle Spritzguss', undefined, 0, 310, {
      width: COL(2) - 15,
      height: GROUP_H,
      properties: { kuerzel: 'SG' },
      source: SYS,
    }),
    node('halle-lack', 'halle', 'Lackieranlage', undefined, 510, 310, {
      width: COL(3) - 15,
      height: GROUP_H,
      properties: { kuerzel: 'LACK' },
      source: SYS,
    }),
    node('halle-montage', 'halle', 'Halle Montage', undefined, 0, MONTAGE_Y, {
      width: COL(4) - 15,
      height: MONTAGE_H,
      properties: { kuerzel: 'MON' },
      description: 'Enthält laut Systemlandschaft auch Wareneingang und Warenausgang.',
      source: SYS,
    }),
    node('ebene-ressourcen', 'ebene', 'Ressourcen', undefined, 1270, 310, {
      description: 'Geteilte Ressourcen und Ladungsträger der Intralogistik.',
      width: COL(1) - 15,
      height: 56 + 3 * 104,
    }),
    node('ebene-drz', 'ebene', 'DRZ-Module', undefined, 0, DRZ_Y, {
      width: COL(4) - 15,
      height: GROUP_H,
      description: 'Fähigkeiten des Digitalen Resilienz-Zwillings. Zuordnungen zu Organisationsmodulen sind Beispiele.',
      source: 'Referenzarchitektur V0.1, Issues KORALLE-Backend',
    }),

    // ── IT-Systemlandschaft ─────────────────────────────────────
    node('it-sg-mpm', 'it', 'SG-MPM', 'ebene-it', COL(0), ROW1, {
      description: 'Magna-Produktionsmanagement Spritzguss: Spritzgussplan, Produktionsaufträge, Backflush.',
      properties: { systemtyp: 'Produktionsmanagement / MES' },
      source: SYS,
    }),
    node('it-sap', 'it', 'SAP (ERP)', 'ebene-it', COL(1), ROW1, {
      description: 'Bedarfe und Bestände (zyklisch), Backflush-Buchungen, Lagerorte, Lieferpapiere.',
      properties: { systemtyp: 'ERP', hersteller: 'SAP' },
      source: SYS,
    }),
    node('it-lack-mpm', 'it', 'LACK-MPM', 'ebene-it', COL(2), ROW1, {
      description: 'Magna-Produktionsmanagement Lack: Lackplan, Rückmeldung Lackplanposition.',
      properties: { systemtyp: 'Produktionsmanagement / MES' },
      source: SYS,
    }),
    node('it-wms', 'it', 'WMS', 'ebene-it', COL(3), ROW1, {
      description: 'Lagerverwaltung: Fahraufträge Voll-/Leergut, Container-Verwaltung, WMS-Labels.',
      properties: { systemtyp: 'Lagerverwaltung / WMS' },
      source: SYS,
    }),
    node('it-qar', 'it', 'QAR', 'ebene-it', COL(4), ROW1, {
      description: 'Quality Assessment Report: iO/niO-Buchung, Prüfanweisungen.',
      properties: { systemtyp: 'Qualität' },
      source: SYS,
    }),
    node('it-andon', 'it', 'Andon', 'ebene-it', COL(5), ROW1, {
      description: 'Visuelle/akustische Meldung von Stillständen und Qualitätsproblemen.',
      properties: { systemtyp: 'Monitoring / Andon' },
      source: SYS,
    }),
    node('it-notsystem', 'it', 'Notsystem', 'ebene-it', COL(0), ROW2, {
      description: 'Rückfallebene: „Nächster Auftrag (aus Notsystem)“ im Bereich HiLis.',
      properties: { systemtyp: 'Rückfallebene' },
      source: SYS,
    }),
    node('it-wibond', 'it', 'WIBOND (PTL)', 'ebene-it', COL(1), ROW2, {
      description: 'Pick-to-Light für die Kommissionierung.',
      properties: { systemtyp: 'Planung / Steuerung', hersteller: 'WIBOND' },
      source: SYS,
    }),
    node('it-jitm', 'it', 'JITM', 'ebene-it', COL(2), ROW2, {
      description: 'Just-in-Time-Manufacturing: Montage-Reihenfolge, Status 3100 / 3200 / 3500.',
      properties: { systemtyp: 'Planung / Steuerung' },
      source: SYS,
    }),
    node('it-jis-admin', 'it', 'JIS-Admin', 'ebene-it', COL(3), ROW2, {
      description: 'JIS-Gestellpositionen, Ladelisten (JIS-Admin und JIS-Terminal).',
      properties: { systemtyp: 'Planung / Steuerung' },
      source: SYS,
    }),
    node('it-edi', 'it', 'EDI & ID-Integrität', 'ebene-it', COL(4), ROW2, {
      description:
        'Übergeordnete Einflusskategorie (hochgewichtet). Wirkt prozessübergreifend und ist für den DZ kritischer als jeder einzelne Prozessschritt.',
      properties: { systemtyp: 'Schnittstelle / EDI', gewichtung: 'hoch' },
      groessen: groessen(
        ['EDI-Schnittstellen (ASN, JIS, Abrufe)', 'EPC-/Barcode-Leser, Scanner, WLAN-Infrastruktur', 'MES / WMS / MPM / JITM / QAR / NANO'],
        [
          'ASN-Validierungslogik',
          'EPC-Verifizierungs- und ID-Matching-Logik',
          'Automatischer Fahrauftragsgenerator (WMS)',
          'Rückmeldeketten (Euromap, Lackplan, Montagefreigaben)',
          'Labelerzeugungslogik (kontinuierlich, asynchron)',
        ],
        [
          'fehlerhafte / verspätete ASN',
          'EPC-Fehllesungen, widersprüchliche IDs',
          'Scanner-/WLAN-Ausfälle',
          'verzögerte oder fehlende Rückmeldungen (MES/WMS/MPM/JITM)',
          'falsche oder fehlende Labels (JIS / RTP / Container)',
        ],
      ),
      drz: ['drz-fruehwarnung', 'drz-streaming'],
      source: `${MAIL}, Abschnitt 0`,
    }),
    node('ds-scanner', 'daten', 'EPC-/Barcode-Scanner & WLAN', 'ebene-it', COL(5), ROW2, {
      description: 'Werksweite Identifikations-Infrastruktur.',
      properties: { protokoll: 'RFID / EPC', zugang: 'offen' },
      source: MAIL,
    }),

    // ── Halle Spritzguss ─────────────────────────────────────────
    node('p-spritzguss', 'prozess', 'Spritzguss', 'halle-sg', COL(0), ROW1, {
      properties: { kuerzel: 'SG' },
      groessen: groessen(
        ['SG-Maschinen', 'Zykluszeit'],
        ['Auftragsreihenfolge', 'Materialbereitstellung'],
        ['Ausschuss', 'Maschinenstillstand', 'Euromap-Fehler', 'falsches Material/Farbe', 'Verzögerte Materialbereitstellung (Logistik)'],
      ),
      drz: ['drz-fruehwarnung'],
      source: `${MAIL}, Abschnitt 2`,
    }),
    node('l-rtp', 'lager', 'Rohteilpuffer (RTP)', 'halle-sg', COL(1), ROW1, {
      properties: { kuerzel: 'RTP', strategie: 'FIFO' },
      groessen: groessen(
        ['Pufferhöhe', 'Stellplatzlayout'],
        ['SG→RTP Nachschub', 'Auslagerstrategie RTP→Lack', 'Farb-/Auftragspriorisierung'],
        [
          'Bestandsabweichungen',
          'fehlende EPC / defekte Labels / fehlende RTP-IDs',
          'falsche physische Einlagerung',
          'FIFO verletzt, überalterte Bestände',
          'RTP voll / Rückstau Lack',
          'beschädigte Rohteile',
        ],
      ),
      drz: ['drz-simulation'],
      source: `${MAIL}, Abschnitt 3`,
    }),
    node('ds-euromap', 'daten', 'Euromap 63 (SG-Maschinen)', 'halle-sg', COL(0), ROW2, {
      description: 'Rückmeldung und Abgleich Euromap zu Auftrag.',
      properties: { protokoll: 'Euromap 63', zugang: 'offen' },
      drz: ['drz-streaming'],
      source: SYS,
    }),
    node('t-sg', 'team', 'Team Spritzguss', 'halle-sg', COL(1), ROW2, {
      description: 'Beispiel. Zuschnitt der Teams mit Magna und Betriebsrat abstimmen.',
      properties: { schichtbetrieb: true },
      drz: ['drz-tagebuch', 'drz-intervention', 'drz-ideen'],
    }),

    // ── Lackieranlage ────────────────────────────────────────────
    node('p-lack', 'prozess', 'Lackanlage', 'halle-lack', COL(0), ROW1, {
      description: 'Lackeingang, Lackplan und Lackausgang.',
      properties: { kuerzel: 'LACK', teilbereiche: ['Sequenz-U', 'Lackeingang', 'Lackausgang'] },
      groessen: groessen(
        ['Linienkapazität', 'EPC-Reader-Qualität', 'Puffergrößen'],
        ['Taktreihenfolge', 'Slot-Zuteilung Lackplan'],
        ['Verschmutzung / Stillstand', 'Kettenstopps Fördertechnik', 'EPC-Fehllesung → Falschverheiratung', 'Farbwechsel-Variabilität', 'Lackplanverzug'],
      ),
      drz: ['drz-simulation', 'drz-fruehwarnung', 'drz-ki'],
      source: `${MAIL}, Abschnitt 4`,
    }),
    node('p-qualitaet', 'prozess', 'Qualitätsmodule', 'halle-lack', COL(1), ROW1, {
      description: 'QAR, NANO-Messzelle und Prüfplätze.',
      properties: { teilbereiche: ['Polierplatz', 'QAR-Prüfplatz', 'NANO-Messzelle'] },
      groessen: groessen(
        ['Messzellenkapazität', 'Prüfsequenz'],
        ['Stichprobenplan', 'Prüfparameter'],
        [
          'NIO-Rate',
          'Prüfplatzausfall',
          'Nacharbeit',
          'blockierende iO/niO-Meldungen',
          'Prüfmittelabweichung / fehlende Kalibrierung',
          'Softwarefehler',
          'verzögerte Weitergabe an ERP/MES/WMS',
          'Medienausfall (Druckluft)',
        ],
      ),
      drz: ['drz-fruehwarnung'],
      source: `${MAIL}, Abschnitt 6`,
    }),
    node('p-packbruecke', 'prozess', 'Packbrücke / Intralogistik', 'halle-lack', COL(2), ROW1, {
      properties: { teilbereiche: ['Packbrücke', 'Kleinteilepackplatz'] },
      groessen: groessen(
        ['Packplätze', 'Stellplätze'],
        ['Nachschubregeln', 'Bereitstelllogik (Lackausbringung)', 'Packreihenfolge (Farbe, Auftrag, JIT/JIS)', 'Konsolidierungslogik'],
        [
          'falscher Containertyp',
          'fehlende/falsche EPC',
          'beschädigte / unvollständige Gebinde',
          'fehlende Packhilfsmittel',
          'Scanner/WLAN-Ausfall',
          'Stapler kollidiert mit Packreihenfolge',
          'fehlende Ressourcen',
        ],
      ),
      drz: ['drz-ki'],
      source: `${MAIL}, Abschnitt 5`,
    }),
    node('ds-rfid-lack', 'daten', 'RFID-Reader Lackein-/ausgang', 'halle-lack', COL(0), ROW2, {
      description: 'Lesung EPC, Erzeugung HALB, Rückmeldung lackierter Skids.',
      properties: { protokoll: 'RFID / EPC', zugang: 'offen' },
      drz: ['drz-streaming'],
      source: SYS,
    }),
    node('ds-opc-nano', 'daten', 'NANO-Messzelle (OPC)', 'halle-lack', COL(1), ROW2, {
      description: 'Messergebnisse der Qualitätsprüfung über OPC.',
      properties: { protokoll: 'OPC (klassisch)', zugang: 'offen' },
      source: SYS,
    }),
    node('t-lack', 'team', 'Team Lack & Qualität', 'halle-lack', COL(2), ROW2, {
      description: 'Beispiel. Zuschnitt der Teams mit Magna und Betriebsrat abstimmen.',
      properties: { schichtbetrieb: true },
      drz: ['drz-tagebuch', 'drz-intervention', 'drz-ideen'],
    }),

    // ── Halle Montage ───────────────────────────────────────────
    node('l-hilis', 'lager', 'HiLis (Hochregallager)', 'halle-montage', COL(0), ROW1, {
      description:
        'Hochregallager lackierte Teile. Laut Vorhabenbeschreibung besonders valide Datenquelle für eine DZ-Simulation.',
      properties: { kuerzel: 'HiLis', strategie: 'nach Farbe/Typ/FIFO/Charge' },
      groessen: groessen(
        ['Regalplätze', 'Gassen / RBG', 'Fördertechnik + E/A'],
        ['Einlagerstrategie (Farbe/Typ/FIFO/Charge)', 'Auslagerpriorisierung (Sequenz, Auftrag, JIS)', 'Konsolidierung / Umlagerung'],
        [
          'Gassen-/Station-/Fördertechnik-Ausfall',
          'RBG-Fehlpositionierung',
          'EPC-/Barcode-Fehler',
          'blockierte Übergabepunkte zur Montage',
          'Rückstau ausgangsseitig',
          'Performance-Degradation bei Peaks',
        ],
      ),
      drz: ['drz-simulation', 'drz-fruehwarnung'],
      source: `${MAIL}, Abschnitt 7`,
    }),
    node('p-montage', 'prozess', 'Montage / Kommissionierung / EOL', 'halle-montage', COL(1), ROW1, {
      description:
        'Zwei Montagelinien (Front/Heck) mit den Stationen aus der ERA, siehe Linien-Gruppen. Takt laut Technik-Meeting ca. 90 s pro Bauteil/Fahrzeug.',
      properties: {
        teilbereiche: ['Kommissionierung', 'Setwagen', 'BOL', 'SSA/MoVo', 'Kundendienst Kleinteile', 'EOL'],
        simZeit: 90,
      },
      groessen: withTakt(groessen(
        ['Montagearbeitsplätze', 'Linienlayout', 'Agilox-Flotte', 'EOL/BOL-Kapazität'],
        ['Kommissionierlogik', 'Verheiratungslogik', 'Operationenreihenfolge', 'Prüf- & Freigabevorschriften', 'Agilox-Fahrpriorisierung'],
        [
          'Kommissionierfehler',
          'beschädigte Bauteile (Vorlager)',
          'EOL-Stop',
          'Agilox-Ausfall / Routenstau / Navigationsfehler',
          'IT-Störungen (MES, Scanner, EOL-Software)',
          'fehlende Betriebsmittel',
          'Personal-/Taktversatz',
          'falsche Vorsortierung Kleinteile',
        ],
      )),
      drz: ['drz-simulation', 'drz-fruehwarnung', 'drz-ideen'],
      source: `${MAIL}, Abschnitt 8; Takt: ${MEETING}`,
    }),
    node('p-jis', 'prozess', 'JIT/JIS-Sequenzierung', 'halle-montage', COL(2), ROW1, {
      description: 'Sequenzierung und Gestellbeladung.',
      properties: { teilbereiche: ['JIS Gestell Beladung + Auslieferung'] },
      groessen: groessen(
        ['Zonen', 'Gestelltypen', 'Ladeplätze'],
        ['Sequenzlogik', 'Pufferstrategie'],
        [
          'Fehlteil (zu spät)',
          'EPC-Fehllesung',
          'OEM-Produktionsabweichungen',
          'kurzfristige Abrufänderungen',
          'fehlende Gestelle',
          'verspätetes Leergut',
          'Fahrzeugvarianten-Sprünge',
          'Verwechslung bauähnlicher Teile',
        ],
      ),
      drz: ['drz-simulation', 'drz-ki'],
      source: `${MAIL}, Abschnitt 9`,
    }),
    node('p-wa', 'prozess', 'Warenausgang', 'halle-montage', COL(3), ROW1, {
      properties: { teilbereiche: ['Warenausgang non-JIS'] },
      groessen: groessen(
        ['Zeitfenster', 'Verladepunkte'],
        ['Packreihenfolge', 'Versandlogik', 'Ladelistenabschluss'],
        [
          'Abrufänderung Kunde',
          'verspäteter LKW',
          'falsche Gestellposition JIS',
          'unvollständige Ladelisten',
          'falsche Rampenreihenfolge',
          'Gewichtsbeschränkungen',
          'verspätete Leergutrückführung',
        ],
      ),
      source: `${MAIL}, Abschnitt 10`,
    }),
    node('ds-rfid-hilis', 'daten', 'RFID-Reader HiLis', 'halle-montage', COL(0), ROW2, {
      properties: { protokoll: 'RFID / EPC', zugang: 'offen' },
      source: SYS,
    }),
    node('p-we', 'prozess', 'Wareneingang', 'halle-montage', COL(3), ROW2, {
      description: 'Wareneingang, ASN-Abgleich, Lager und WMS.',
      groessen: groessen(
        ['verfügbare Container', 'dynamische Einlagerlogik (nicht fixe Lagerorte)', 'Stapler & Ressourcen'],
        ['ASN-Abgleich', 'Voll-/Leergutlogik', 'WE-Qualitätsprüfung', 'Fahrauftragslogik (WMS)'],
        [
          'ASN falsch/verspätet',
          'fehlerhafter Lieferschein',
          'falsche Paletten / beschädigte LHM',
          'WMS/Scanner/WLAN-Ausfall',
          'WE-Peak / Lagerkapazität voll',
          'Fahrer-/Staplerengpässe',
          'nicht gemeldete Qualitätsabweichungen',
        ],
      ),
      drz: ['drz-ki'],
      source: `${MAIL}, Abschnitt 1`,
    }),
    node('t-montage', 'team', 'Team Montage & Logistik', 'halle-montage', COL(1), ROW2, {
      description: 'Beispiel. Zuschnitt der Teams mit Magna und Betriebsrat abstimmen.',
      properties: { schichtbetrieb: true },
      drz: ['drz-tagebuch', 'drz-intervention', 'drz-ideen'],
    }),
    node('ds-rfid-tor', 'daten', 'RFID-Tor Warenausgang', 'halle-montage', COL(2), ROW2, {
      description: 'Identifizierung der Container und JIS-Gestelle beim Verladen.',
      properties: { protokoll: 'RFID / EPC', zugang: 'offen' },
      source: SYS,
    }),
    node('ds-opc-montage', 'daten', 'Arbeitsplatzstatus Montage (OPC-Events)', 'halle-montage', COL(0), ROW3, {
      description:
        'Status-Events der Arbeitsplätze in der Montage, liegt als Tabelle vor. Es fehlt die Zuordnung Arbeitsplatz → Linie. Bezeichnung „OPC“ im Transkript unsicher.',
      properties: {
        protokoll: 'OPC (klassisch)',
        frequenz: 'ereignisbasiert',
        zugang: 'vorhanden',
        zugangsweg: 'CSV-Export aus der Magna-Datenbank; Live-Zugriff per VPN-Tunnel geplant',
        echtzeit: false,
      },
      drz: ['drz-streaming'],
      source: MEETING,
    }),
    node('ds-takt-montage', 'daten', 'Taktung Montagelinien', 'halle-montage', COL(1), ROW3, {
      description: 'Tabelle mit der Taktung der zwei Montagelinien (Assembly Lines).',
      properties: {
        protokoll: 'CSV / Datei',
        frequenz: 'pro Takt',
        zugang: 'vorhanden',
        zugangsweg: 'CSV-Export aus der Magna-Datenbank',
        echtzeit: false,
      },
      source: MEETING,
    }),
    node('ds-rfid-stationen', 'daten', 'RFID an den Stationen', 'halle-montage', COL(2), ROW3, {
      description: 'RFID-Lesung an jeder Station der Montage.',
      properties: { protokoll: 'RFID / EPC', zugang: 'offen' },
      source: MEETING,
    }),

    // ── Externe Akteure ─────────────────────────────────────────
    node('x-oem', 'extern', 'OEM (Kunden)', undefined, 1010, 666, {
      description: 'Automobilhersteller, beliefert just-in-sequence.',
      properties: { rolle: 'Kunde / OEM' },
      source: 'Vorhabenbeschreibung KORALLE',
    }),
    node('x-lieferanten', 'extern', 'Lieferanten', undefined, 1010, 770, {
      description: 'Material- und Kaufteillieferanten, avisieren per ASN.',
      properties: { rolle: 'Lieferant' },
      source: SYS,
    }),

    // ── Ressourcen ──────────────────────────────────────────────
    node('r-stapler', 'ressource', 'Staplerflotte', 'ebene-ressourcen', COL(0), ROW1, {
      description: 'Stapler mit Staplerterminal; erhalten Fahraufträge aus dem WMS.',
      source: SYS,
    }),
    node('r-agilox', 'ressource', 'Agilox-Flotte (AMR)', 'ebene-ressourcen', COL(0), ROW1 + 104, {
      description: 'Autonome mobile Roboter in der Montage.',
      properties: {},
      source: SYS,
    }),
    node('r-ladungstraeger', 'ressource', 'Container & JIS-Gestelle', 'ebene-ressourcen', COL(0), ROW1 + 208, {
      description: 'Ladungsträger inklusive Leergut.',
      source: MAIL,
    }),

    // ── DRZ-Module ───────────────────────────────────────────────
    drzNode('drz-simulation', 'Diskrete Simulation', 0, 'simulation', 'prototypisch', 'AP 4', '#8', {
      description:
        'Ereignisdiskrete Engine (Vorschlag für KORALLE-Backend apps/simulations), Modell nach KORALLE-bpmn-graph-sim. Erster Anwendungsfall: Prozesszwilling Magna (Störung einwerfen, Rückstau und Engpässe sehen).',
      source: MEETING,
    }),
    drzNode('drz-fruehwarnung', 'Frühwarnung', 1, 'fruehwarnung', 'in Entwicklung', 'AP 4', '', {
      description: 'Early Detection (Jörg): soll live im Hintergrund alarmieren. Basis 1D-CNN aus KORALLE-Sandbox.',
      source: MEETING,
    }),
    drzNode('drz-ki', 'KI-Vorschlagssystem', 2, 'ki_vorschlag', 'geplant', 'AP 4', ''),
    drzNode('drz-intervention', 'Intervention-Engine', 3, 'intervention', 'geplant', 'AP 4', '#11', {
      description: 'Vor allem auf Teamebene. Impulse für die individuelle Resilienz erarbeiten Anja und Sandra.',
      source: MEETING,
    }),
    drzNode('drz-tagebuch', 'Tagebuchstudie (TBS)', 4, 'tagebuch', 'im Pilotbetrieb', 'AP 3.3 / 3.4', '#10', {
      description:
        'Welle 1 läuft bei CPT und Magna (App auf eigenem Server, Umzug auf die URZ-VM geplant). 2 Wellen à 10 Arbeitstage, 3 Fragebögen pro Tag. Garmin-Uhren in Welle 1 in Zwickau noch nicht verfügbar. Auswertung nur auf Kollektivebene.',
      source: MEETING,
    }),
    drzNode('drz-ideen', 'Ideenmanagement', 5, 'ideen', 'geplant', 'AP 2', '#3', {
      description:
        'Ideenforum als Reiter in der TBS-App; Klassifikation eingehender Ideen per Sprachmodell (UL). Magna nutzt ein eigenes System mit Personennamen (Datenschutz klären).',
      source: MEETING,
    }),
    drzNode('drz-streaming', 'Daten-Streaming', 6, 'streaming', 'geplant', 'AP 4.2', '#1'),
    drzNode('drz-assistenz', 'MCP / LLM-Assistenz', 7, 'assistenz', 'geplant', '', ''),
  ]

  const PROCESS_ORDER = `${MAIL} (Prozessreihenfolge)`
  const DERIVED = 'abgeleitet, mit Magna prüfen'

  const edges: ModelEdge[] = [
    // Materialfluss
    edge('material', 'x-lieferanten', 'p-we', 'Rohmaterial, Kaufteile', 3, { source: PROCESS_ORDER }),
    edge('material', 'p-we', 'p-spritzguss', 'Granulat / Material', 3, { source: PROCESS_ORDER }),
    edge('material', 'p-spritzguss', 'l-rtp', 'Rohteile in Containern', 3, { source: PROCESS_ORDER }),
    edge('material', 'l-rtp', 'p-lack', 'Rohteile nach Lackplan', 3, { source: PROCESS_ORDER }),
    edge('material', 'p-lack', 'p-qualitaet', 'lackierte Teile (Skids)', 3, { source: PROCESS_ORDER }),
    edge('material', 'p-qualitaet', 'p-packbruecke', 'geprüfte Teile', 3, { source: PROCESS_ORDER }),
    edge('material', 'p-packbruecke', 'l-hilis', 'Container lackierte Teile', 3, { source: PROCESS_ORDER }),
    edge('material', 'l-hilis', 'p-montage', 'Bauteile in Sequenz', 4, { source: PROCESS_ORDER }),
    edge('material', 'p-we', 'p-montage', 'Kaufteile / Kleinteile', 2, { source: DERIVED }),
    edge('material', 'p-montage', 'p-jis', 'montierte Module', 4, { source: PROCESS_ORDER }),
    edge('material', 'p-jis', 'p-wa', 'beladene JIS-Gestelle', 4, { source: PROCESS_ORDER }),
    edge('material', 'p-wa', 'x-oem', 'JIT/JIS-Lieferung', 4, { source: PROCESS_ORDER }),
    edge('material', 'x-oem', 'p-we', 'Leergut-Rückführung', 2, { source: MAIL }),

    // Steuerung
    edge('control', 'it-sg-mpm', 'p-spritzguss', 'Spritzgussplan', 3, { messages: ['Spritzgussplan', 'Produktionsaufträge'] }),
    edge('control', 'it-lack-mpm', 'p-lack', 'Lackplan', 4, { messages: ['Lackplan'] }),
    edge('control', 'it-jitm', 'p-montage', 'Montage-Reihenfolge', 4, { messages: ['Montage-Reihenfolge', 'JITM-Status 3100'] }),
    edge('control', 'it-jitm', 'l-hilis', 'Auslageranforderung', 3, { messages: ['Auslageranforderung', 'Auftrag Auslagerung'] }),
    edge('control', 'it-wms', 'r-stapler', 'Fahraufträge', 3, { messages: ['Fahrauftrag Vollgut', 'Fahrauftrag Leergut'] }),
    edge('control', 'it-jis-admin', 'p-jis', 'Gestellpositionen', 3, { messages: ['JIS-Gestellposition', 'Liste aller JIS-Gestellpositionen'] }),
    edge('control', 'it-wibond', 'p-montage', 'Pick-to-Light', 2, { messages: ['Kommissionierung'] }),

    // Informationsfluss
    edge('information', 'x-oem', 'it-edi', 'JIS-Abruf', 4, { messages: ['JIS-Abruf', 'Kundenbedarf'] }),
    edge('information', 'x-lieferanten', 'it-edi', 'ASN', 3, { messages: ['ASN (vom Lieferanten)'] }),
    edge('information', 'it-edi', 'it-sap', 'Bedarfe, ASN-Import', 3, { messages: ['Bedarfe', 'ASN-Import'] }),
    edge('information', 'it-edi', 'it-jis-admin', 'JIS-Abruf', 4, { messages: ['XML-Datei / Abruf und Zone'] }),
    edge('information', 'it-sap', 'it-sg-mpm', 'Bedarfe & Bestände', 2, { messages: ['Bedarfe (zyklisch)', 'Bestände (zyklisch)'] }),
    edge('information', 'it-sap', 'it-lack-mpm', 'Bedarfe & Bestände', 2, { messages: ['Bedarfe (zyklisch)', 'Bestände (zyklisch)'] }),
    edge('information', 'p-spritzguss', 'it-sg-mpm', 'iO/niO, Euromap-Abgleich', 2, {
      messages: ['iO/niO-Rückmeldung', 'Rückmeldung & Abgleich Euromap zu Auftrag'],
    }),
    edge('information', 'it-sg-mpm', 'it-sap', 'Backflush', 2, { messages: ['Backflush DB (iO + niO)'] }),
    edge('information', 'p-lack', 'it-lack-mpm', 'Lackplan-Rückmeldung', 3, {
      messages: ['Rückmeldung eingefahrene Lackplanposition', 'Rückmeldung lackierte Skids & EPCs'],
    }),
    edge('information', 'p-qualitaet', 'it-qar', 'iO/niO, Prüfanweisung', 3, {
      messages: ['Meldung iO/niO', 'Abfrage Info/Prüfanweisung'],
      bidirectional: true,
    }),
    edge('information', 'it-qar', 'it-sap', 'Backflush niO', 2, { messages: ['Backflush DB (niO)'] }),
    edge('information', 'l-rtp', 'it-wms', 'Bestände RTP', 2, { messages: ['Bestände Rohteilpuffer', 'Container-Befüllung'] }),
    edge('information', 'p-packbruecke', 'it-wms', 'Container-Einlagerung', 3, {
      messages: ['Container-Einlagerung', 'Anforderung Containertyp', 'Container-Label'],
    }),
    edge('information', 'it-wms', 'it-sap', 'Umbuchung Lagerort', 2, { messages: ['Backflush DB (Umbuchung Lort)'] }),
    edge('information', 'l-hilis', 'it-jitm', 'Tablarposition', 2, { messages: ['Rückmeldung Tablarposition'] }),
    edge('information', 'p-montage', 'it-jitm', 'Fertigmeldung', 3, { messages: ['Fertigmeldung', 'JITM-Status 3200 / 3500'] }),
    edge('information', 'p-we', 'it-sap', 'ASN-Buchung', 3, { messages: ['ASN-Buchung', 'Cross-Check Ware vs. ASN'] }),
    edge('information', 'p-wa', 'it-sap', 'Lieferpapiere', 3, { messages: ['Erstellung Lieferpapiere / Ladelisten', 'Sendungsbeleg'] }),
    edge('information', 'it-sap', 'it-edi', 'ASN an Kunden', 3, { messages: ['ASN (Versand)'], source: DERIVED }),
    edge('information', 'it-edi', 'x-oem', 'ASN', 3, { messages: ['ASN (Versand)'], source: DERIVED }),
    edge('information', 'it-notsystem', 'l-hilis', 'Nächster Auftrag', 2, { messages: ['Nächster Auftrag (aus Notsystem)'] }),
    edge('information', 'p-spritzguss', 'it-andon', 'Stillstände', 2, { messages: ['Stillstände'] }),
    edge('information', 'ds-euromap', 'p-spritzguss', 'Maschinendaten', 2, { messages: ['Euromap 63'] }),
    edge('information', 'ds-rfid-lack', 'p-lack', 'EPC-Lesung', 3, { messages: ['Lesung EPC', 'Erzeugung HALB'] }),
    edge('information', 'ds-opc-nano', 'p-qualitaet', 'Messergebnis', 2, { messages: ['Messergebnis'] }),
    edge('information', 'ds-rfid-hilis', 'l-hilis', 'EPC-Lesung', 2, { messages: ['Lesung EPC'] }),
    edge('information', 'ds-rfid-tor', 'p-wa', 'Gestell-Identifikation', 3, { messages: ['Identifizierung Container', 'Scannen JIS-Gestell'] }),
    edge('information', 'ds-scanner', 'it-edi', 'ID-Lesungen', 4, { messages: ['EPC-/Barcode-Lesungen'], source: MAIL }),
    edge('information', 'ds-opc-montage', 'p-montage', 'Arbeitsplatzstatus', 3, { messages: ['Status-Events je Arbeitsplatz'], source: MEETING }),
    edge('information', 'ds-takt-montage', 'p-montage', 'Taktzeiten', 2, { messages: ['Taktung je Linie'], source: MEETING }),
    edge('information', 'ds-rfid-stationen', 'p-montage', 'Stationslesungen', 2, { messages: ['RFID-Lesung je Station'], source: MEETING }),

    // Ressourcennutzung
    edge('resource', 'r-stapler', 'p-we', 'Stapler', 3, { source: MAIL }),
    edge('resource', 'r-stapler', 'l-rtp', 'Stapler', 3, { source: DERIVED }),
    edge('resource', 'r-stapler', 'p-packbruecke', 'Stapler', 3, { source: MAIL }),
    edge('resource', 'r-agilox', 'p-montage', 'AMR-Transporte', 3, { source: MAIL }),
    edge('resource', 'r-ladungstraeger', 'p-packbruecke', 'Container', 2, { source: MAIL }),
    edge('resource', 'r-ladungstraeger', 'p-jis', 'JIS-Gestelle', 3, { source: MAIL }),
  ]

  nodes.push(...stationNodes())

  return {
    schemaVersion: SCHEMA_VERSION,
    organization: {
      id: 'magna-meerane',
      name: 'Magna Exteriors Meerane',
      description: 'Pilot „Resilienz für die Fertigung“. Startmodell aus Mail-Beschreibung und Systemlandschaft.',
    },
    nodes,
    edges,
  }
}

function drzNode(
  id: string,
  label: string,
  index: number,
  drzKind: string,
  status: string,
  arbeitspaket: string,
  issue: string,
  opts: { description?: string; source?: string } = {},
): ModelNode {
  return node(id, 'drz', label, 'ebene-drz', COL(index % 4), index < 4 ? ROW1 : ROW2, {
    properties: { drzKind, status, arbeitspaket, issue },
    ...opts,
  })
}

/** Adds the takt from the technical meeting as a Strukturgröße. */
function withTakt(list: Groesse[]): Groesse[] {
  const takt: Groesse = {
    id: `g${++seq}`,
    kind: 'struktur',
    name: 'Takt',
    value: 'ca. 90 s pro Bauteil / Fahrzeug',
    note: MEETING,
  }
  return [takt, ...list]
}

const LINE_GROUPS: { line: Line; id: string; label: string; typeId: string; description: string; x: number }[] = [
  {
    line: 'front',
    id: 'linie-front',
    label: 'Montagelinie Front (MEB)',
    typeId: 'linie',
    description: 'Stationen mit „Front“ in der Bezeichnung (ERA). Takt laut Technik-Meeting ca. 90 s.',
    x: 0,
  },
  {
    line: 'heck',
    id: 'linie-heck',
    label: 'Montagelinie Heck (MEB)',
    typeId: 'linie',
    description: 'Stationen mit „Heck“ in der Bezeichnung (ERA). Takt laut Technik-Meeting ca. 90 s.',
    x: LINE_W + 30,
  },
  {
    line: 'offen',
    id: 'linie-offen',
    label: 'MEB-Arbeitsplätze, Linie offen',
    typeId: 'ebene',
    description: 'Arbeitsplätze ohne Front/Heck in der Bezeichnung. Zuordnung mit Magna klären (OPC-Arbeitsplatz-IDs).',
    x: 2 * (LINE_W + 30),
  },
]

/** Line groups (collapsed) with the workplaces from the ERA layout. */
function stationNodes(): ModelNode[] {
  const out: ModelNode[] = []
  for (const g of LINE_GROUPS) {
    const stations = MAGNA_STATIONS.filter((s) => s.line === g.line)
    const group = node(g.id, g.typeId, g.label, undefined, g.x, LINES_Y, {
      description: g.description,
      properties: g.typeId === 'linie' ? { kuerzel: g.line === 'front' ? 'F' : 'H', takt: 90 } : {},
      width: LINE_W,
      height: lineHeight(stations.length),
      source: g.typeId === 'linie' ? `${ERA_SOURCE}; Takt: ${MEETING}` : ERA_SOURCE,
    })
    group.layout.collapsed = true
    out.push(group)
    stations.forEach((st, i) => {
      out.push(
        node(`st-${st.lnr.toLowerCase()}`, 'station', st.name, g.id, STATION_X(i), STATION_Y(i), {
          description: st.guess ? `Linie laut Bezeichnung offen. Vermutung: ${st.guess}, mit Magna prüfen.` : undefined,
          properties: {
            lnr: st.lnr,
            stationstyp: st.typ,
            ...(st.derivate.length > 0 ? { derivate: st.derivate } : {}),
            ...(st.era !== undefined ? { eraPunkte: st.era } : {}),
            ...(st.eraMean ? { eraMittelwert: true } : {}),
            ...(st.eraNote ? { eraHinweis: st.eraNote } : {}),
          },
          source: ERA_SOURCE,
        }),
      )
    })
  }
  return out
}
