/**
 * Workplaces of the assembly area "Montage MEB" at Magna Meerane.
 *
 * Source: "20240820_I_MEZ_Layout Montage MEB ERA Visualisierung_EHS-1 1.pdf"
 * (ERA – ergonomic risk analysis, EHS Magna, Stand 19.03.2025, Rev. 15).
 * LNr. and names are taken from the table in the PDF, ERA points from the
 * layout. LNr. 4 ("frei (Aufnahmemodul)") is not a workplace and is left out;
 * 252/253 "EOL Front" are two stations in the layout.
 *
 * The line (Front/Heck) is only set when the name says so. For the rest the
 * assignment is open; `guess` is a hint from the part name, not a fact.
 * The mapping to the workplace ids in the OPC events is still missing.
 */
export type Line = 'front' | 'heck' | 'offen'

export interface MagnaStation {
  lnr: string
  name: string
  typ: 'SSA' | 'MOVO' | 'BOL' | 'EOL' | 'KA' | 'Vormontage' | 'Stanze' | 'Sonstiges'
  derivate: string[]
  line: Line
  /** ERA points; undefined if the layout shows no value. */
  era?: number
  /** Value marked with Ø in the layout (mean over variants). */
  eraMean?: boolean
  eraNote?: string
  guess?: string
}

export const ERA_SOURCE = 'ERA Montage MEB (EHS Magna, Stand 19.03.2025, Rev. 15)'

export const MAGNA_STATIONS: MagnaStation[] = [
  { lnr: '1', name: 'Q4 PA Abdeckung Ziereileger S-line', typ: 'Sonstiges', derivate: ['Q4'], line: 'offen', era: 24 },
  { lnr: '2', name: 'Q4 PA Abdeckung SRA ADV & S-line', typ: 'Sonstiges', derivate: ['Q4'], line: 'offen', era: 22 },
  { lnr: '3', name: 'Q4 PA Abdeckung PDC, PLA ADV & S-line', typ: 'Sonstiges', derivate: ['Q4'], line: 'offen', era: 25 },
  { lnr: '5', name: 'ID.3 PA SKA AVC', typ: 'Sonstiges', derivate: ['ID.3'], line: 'offen', era: 13 },
  { lnr: '6', name: 'SSA ID.3 PA Front', typ: 'SSA', derivate: ['ID.3'], line: 'front', era: 35 },
  { lnr: '7', name: 'SSA ID.3 GTX Robotorzelle', typ: 'SSA', derivate: ['ID.3'], line: 'offen', era: 29 },
  { lnr: '8', name: 'SSA Cupra Emblem Front', typ: 'SSA', derivate: ['Cupra'], line: 'front', era: 19 },
  { lnr: '11', name: 'SSA ID.4 Einlegeteil PLA/ECE/NAR', typ: 'SSA', derivate: ['ID.4'], line: 'offen', era: 23 },
  { lnr: '12', name: 'SSA ID.5 Front', typ: 'SSA', derivate: ['ID.5'], line: 'front', era: 35 },
  { lnr: '15', name: 'SSA VW Neo Heck', typ: 'SSA', derivate: ['VW Neo'], line: 'heck', era: 27 },
  {
    lnr: '16',
    name: 'SSA BKD-Fahrradträger ID.3/Cupra PA',
    typ: 'SSA',
    derivate: ['ID.3', 'Cupra'],
    line: 'offen',
    era: 12,
    guess: 'Heck (Fahrradträger)',
  },
  { lnr: '16-A', name: 'Stanze Kamera Cupra STF Heck', typ: 'Stanze', derivate: ['Cupra'], line: 'heck', era: 14 },
  { lnr: '17', name: 'SSA ID.3 PA Spoiler GTX', typ: 'SSA', derivate: ['ID.3'], line: 'offen', era: 22 },
  { lnr: '18', name: 'SSA ID.4 PDC PLA Heck', typ: 'SSA', derivate: ['ID.4'], line: 'heck', era: 27 },
  { lnr: '19', name: 'SSA ID.5 Heck', typ: 'SSA', derivate: ['ID.5'], line: 'heck', era: 32 },
  { lnr: '20', name: 'SSA Cupra Heck Robotorzelle', typ: 'SSA', derivate: ['Cupra'], line: 'heck', era: 22 },
  { lnr: '20-A', name: 'Vormontage Cupra Front', typ: 'Vormontage', derivate: ['Cupra'], line: 'front', era: 26 },
  { lnr: '22', name: 'SSA Cupra Lüftungsgitter', typ: 'SSA', derivate: ['Cupra'], line: 'offen', era: 20, guess: 'Front (Lüftungsgitter)' },
  { lnr: '23', name: 'SSA ID.4 Lüftungsgitter', typ: 'SSA', derivate: ['ID.4'], line: 'offen', era: 25, guess: 'Front (Lüftungsgitter)' },
  { lnr: '24', name: 'KA ID.4 Lüftungsgitter GTX', typ: 'KA', derivate: ['ID.4'], line: 'offen', era: 25, guess: 'Front (Lüftungsgitter)' },
  { lnr: '25', name: 'SSA ID.5 Lüftungsgitter', typ: 'SSA', derivate: ['ID.5'], line: 'offen', era: 22, guess: 'Front (Lüftungsgitter)' },
  { lnr: '33', name: 'SSA Cupra Front', typ: 'SSA', derivate: ['Cupra'], line: 'front', era: 22 },
  { lnr: '36', name: 'MOVO Q4 PA Innen 1 Front', typ: 'MOVO', derivate: ['Q4'], line: 'front', era: 40, eraMean: true },
  { lnr: '42', name: 'MOVO QA PA Außen 1 Front', typ: 'MOVO', derivate: [], line: 'front', era: 42 },
  { lnr: '45', name: 'MOVO ID.3PA Front', typ: 'MOVO', derivate: ['ID.3'], line: 'front', era: 42, eraMean: true },
  { lnr: '46', name: 'MOVO ID.3 PA GTX Front', typ: 'MOVO', derivate: ['ID.3'], line: 'front', era: 46, eraMean: true },
  { lnr: '47', name: 'MOVO ID.3 PA Front', typ: 'MOVO', derivate: ['ID.3'], line: 'front', era: 42, eraMean: true },
  { lnr: '48', name: 'MOVO ID.3 PA Front', typ: 'MOVO', derivate: ['ID.3'], line: 'front', era: 42, eraMean: true },
  { lnr: '49', name: 'MOVO ID.3 PA Front', typ: 'MOVO', derivate: ['ID.3'], line: 'front', era: 42, eraMean: true },
  { lnr: '51', name: 'MOVO ID.4 Front', typ: 'MOVO', derivate: ['ID.4'], line: 'front', era: 44, eraMean: true },
  { lnr: '52', name: 'MOVO ID.4 Front', typ: 'MOVO', derivate: ['ID.4'], line: 'front', era: 44, eraMean: true },
  { lnr: '53', name: 'MOVO ID.5 Front', typ: 'MOVO', derivate: ['ID.5'], line: 'front', era: 46, eraMean: true },
  { lnr: '54', name: 'MOVO ID.5 Front', typ: 'MOVO', derivate: ['ID.5'], line: 'front', era: 46, eraMean: true },
  { lnr: '55', name: 'MOVO Cupra Front IM', typ: 'MOVO', derivate: ['Cupra'], line: 'front', era: 48, eraMean: true },
  { lnr: '56', name: 'MOVO Cupra Front IM', typ: 'MOVO', derivate: ['Cupra'], line: 'front', era: 48, eraMean: true },
  { lnr: '63', name: 'MOVO ID.3/GTX Heck IM', typ: 'MOVO', derivate: ['ID.3'], line: 'heck', era: 40 },
  { lnr: '64', name: 'MOVO ID.3/Cupra Heck Innen', typ: 'MOVO', derivate: ['ID.3', 'Cupra'], line: 'heck', era: 36 },
  {
    lnr: '65',
    name: 'MOVO ID.3 PA/GTX/ID.4/ID.5/Cupra Heck',
    typ: 'MOVO',
    derivate: ['ID.3', 'ID.4', 'ID.5', 'Cupra'],
    line: 'heck',
    era: 23,
  },
  { lnr: '66', name: 'MOVO ID.4/GTX/ID.5 Heck', typ: 'MOVO', derivate: ['ID.4', 'ID.5'], line: 'heck', era: 41 },
  { lnr: '67', name: 'MOVO ID.4/GTX/ID.5 Heck', typ: 'MOVO', derivate: ['ID.4', 'ID.5'], line: 'heck', era: 41 },
  { lnr: '69-A', name: 'MOVO Cupra Heck Innen', typ: 'MOVO', derivate: ['Cupra'], line: 'heck', era: 33 },
  { lnr: '71', name: 'Cupra Lettering (C-CON)', typ: 'Sonstiges', derivate: ['Cupra'], line: 'offen', era: 15 },
  { lnr: '231', name: 'BOL Heck', typ: 'BOL', derivate: [], line: 'heck', era: 16, eraMean: true },
  { lnr: '232', name: 'BOL Front', typ: 'BOL', derivate: [], line: 'front', era: 17 },
  { lnr: '236', name: 'EOL Heck', typ: 'EOL', derivate: [], line: 'heck', era: 33 },
  { lnr: '252', name: 'EOL Front', typ: 'EOL', derivate: [], line: 'front', era: 30, eraMean: true, eraNote: 'getrennt: M 53 / W 61' },
  { lnr: '253', name: 'EOL Front', typ: 'EOL', derivate: [], line: 'front', era: 30, eraMean: true, eraNote: 'getrennt: M 59 / W 67' },
]
