/**
 * Colour palettes as plain data. Each palette is a cyclic gradient: `stops`
 * holds [position, colour] pairs with ascending positions in [0, 1), and the
 * gradient runs from the last stop back round to the first. `inside` colours
 * the points that never escape.
 */

/**
 * @typedef {Object} Palette
 * @property {string} id
 * @property {{en: string, tr: string}} name
 * @property {string} inside hex colour of the set itself
 * @property {Array<[number, string]>} stops gradient stops
 */

/** @type {Palette[]} */
export const PALETTES = [
  {
    id: 'aurora',
    name: { en: 'Aurora', tr: 'Kutup Işığı' },
    inside: '#020617',
    stops: [
      [0, '#020617'],
      [0.18, '#0e4d64'],
      [0.38, '#22c55e'],
      [0.52, '#e0f78a'],
      [0.7, '#a855f7'],
      [0.86, '#312e81'],
    ],
  },
  {
    id: 'ember',
    name: { en: 'Ember', tr: 'Kor' },
    inside: '#000000',
    stops: [
      [0, '#0c0400'],
      [0.22, '#7f1d1d'],
      [0.45, '#ea580c'],
      [0.65, '#facc15'],
      [0.8, '#fff7d6'],
      [0.92, '#7c2d12'],
    ],
  },
  {
    id: 'orchid',
    name: { en: 'Orchid', tr: 'Orkide' },
    inside: '#0b0613',
    stops: [
      [0, '#0b0613'],
      [0.25, '#6b21a8'],
      [0.5, '#e879f9'],
      [0.68, '#fdf4ff'],
      [0.85, '#4338ca'],
    ],
  },
  {
    id: 'lagoon',
    name: { en: 'Lagoon', tr: 'Lagün' },
    inside: '#01161e',
    stops: [
      [0, '#01161e'],
      [0.25, '#0369a1'],
      [0.45, '#22d3ee'],
      [0.6, '#f0fdfa'],
      [0.78, '#14b8a6'],
      [0.9, '#0c4a6e'],
    ],
  },
  {
    id: 'neon',
    name: { en: 'Neon', tr: 'Neon' },
    inside: '#05010d',
    stops: [
      [0, '#05010d'],
      [0.16, '#3b0764'],
      [0.32, '#e879f9'],
      [0.48, '#fdf4ff'],
      [0.62, '#22d3ee'],
      [0.78, '#1d4ed8'],
      [0.9, '#a3e635'],
    ],
  },
  {
    id: 'citrus',
    name: { en: 'Citrus', tr: 'Narenciye' },
    inside: '#0d1302',
    stops: [
      [0, '#1a2e05'],
      [0.3, '#84cc16'],
      [0.5, '#fde047'],
      [0.7, '#f97316'],
      [0.85, '#7c2d12'],
    ],
  },
  {
    id: 'glacier',
    name: { en: 'Glacier', tr: 'Buzul' },
    inside: '#0b1220',
    stops: [
      [0, '#0b1220'],
      [0.3, '#1e3a8a'],
      [0.55, '#93c5fd'],
      [0.72, '#ffffff'],
      [0.86, '#64748b'],
    ],
  },
  {
    id: 'dusk',
    name: { en: 'Dusk', tr: 'Alacakaranlık' },
    inside: '#0c0a1d',
    stops: [
      [0, '#1e1b4b'],
      [0.25, '#7e22ce'],
      [0.45, '#ec4899'],
      [0.65, '#fb923c'],
      [0.8, '#fde68a'],
      [0.92, '#9d174d'],
    ],
  },
  {
    id: 'coral',
    name: { en: 'Coral Reef', tr: 'Mercan Resifi' },
    inside: '#03191c',
    stops: [
      [0, '#042f2e'],
      [0.25, '#0d9488'],
      [0.45, '#fef3c7'],
      [0.6, '#fb7185'],
      [0.8, '#be123c'],
      [0.92, '#1e3a3a'],
    ],
  },
  {
    id: 'graphite',
    name: { en: 'Graphite', tr: 'Grafit' },
    inside: '#000000',
    stops: [
      [0, '#111111'],
      [0.5, '#f5f5f5'],
    ],
  },
];

/** Palette used when nothing else is chosen. */
export const DEFAULT_PALETTE_ID = 'aurora';

/**
 * Looks up a palette by id.
 * @param {string} id
 * @returns {Palette|null}
 */
export function getPalette(id) {
  return PALETTES.find((palette) => palette.id === id) ?? null;
}
