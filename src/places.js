/**
 * Famous places as data: a fractal type, a view, the Julia constant where it
 * matters, and a short name and description in English and Turkish.
 */

/**
 * @typedef {Object} Place
 * @property {string} id
 * @property {string} type fractal type id
 * @property {import('./view.js').View} view
 * @property {{re: number, im: number}|null} c Julia constant (Julia places only)
 * @property {{en: string, tr: string}} name
 * @property {{en: string, tr: string}} description
 */

/** @type {Place[]} */
export const PLACES = [
  {
    id: 'seahorse-valley',
    type: 'mandelbrot',
    view: { cx: -0.7442, cy: 0.1302, scale: 0.0042 },
    c: null,
    name: { en: 'Seahorse Valley', tr: 'Denizatı Vadisi' },
    description: {
      en: 'Curled seahorse tails in the narrow valley between the main cardioid and the big bulb on its left.',
      tr: 'Ana kardiyoid ile solundaki büyük tomurcuk arasındaki dar vadide kıvrılan denizatı kuyrukları.',
    },
  },
  {
    id: 'elephant-valley',
    type: 'mandelbrot',
    view: { cx: 0.2935, cy: 0.016, scale: 0.014 },
    c: null,
    name: { en: 'Elephant Valley', tr: 'Fil Vadisi' },
    description: {
      en: 'A parade of round, elephant-like bulbs with curling trunks along the right edge of the cardioid.',
      tr: 'Kardiyoidin sağ kenarı boyunca hortumlarını kıvıran, fil gibi yuvarlak tomurcuklardan bir geçit.',
    },
  },
  {
    id: 'spiral',
    type: 'mandelbrot',
    view: { cx: -0.76155, cy: -0.08475, scale: 0.0012 },
    c: null,
    name: { en: 'Spiral', tr: 'Sarmal' },
    description: {
      en: 'Chains of tiny copies wind into a single point in a long, tight spiral.',
      tr: 'Minik kopyalardan oluşan zincirler uzun ve sıkı bir sarmalla tek bir noktaya dolanır.',
    },
  },
  {
    id: 'mini-mandelbrot',
    type: 'mandelbrot',
    view: { cx: -1.7548, cy: 0, scale: 0.04 },
    c: null,
    name: { en: 'Mini Mandelbrot', tr: 'Mini Mandelbrot' },
    description: {
      en: 'A complete small copy of the whole set, sitting on the antenna on the real axis.',
      tr: 'Gerçel eksendeki antenin üzerinde duran, kümenin küçük ama eksiksiz bir kopyası.',
    },
  },
  {
    id: 'rabbit',
    type: 'julia',
    view: { cx: 0, cy: 0, scale: 3 },
    c: { re: -0.123, im: 0.745 },
    name: { en: 'Rabbit', tr: 'Tavşan' },
    description: {
      en: 'Every bulb grows two ears: the Julia set of a period-3 bulb.',
      tr: 'Her tomurcuğa iki kulak çıkar: 3 periyotlu bir tomurcuğun Julia kümesi.',
    },
  },
  {
    id: 'dendrite',
    type: 'julia',
    view: { cx: 0, cy: 0, scale: 3.4 },
    c: { re: 0, im: 1 },
    name: { en: 'Dendrite', tr: 'Dendrit' },
    description: {
      en: 'For c = i the set is a branching tree with no inside at all.',
      tr: 'c = i için küme, hiç içi olmayan dallı budaklı bir ağaçtır.',
    },
  },
  {
    id: 'basilica',
    type: 'julia',
    view: { cx: 0, cy: 0, scale: 3.6 },
    c: { re: -1, im: 0 },
    name: { en: 'Basilica', tr: 'Bazilika' },
    description: {
      en: 'For c = -1 domes sit on domes all the way down.',
      tr: 'c = -1 için kubbeler sonsuza dek kubbelerin üstüne oturur.',
    },
  },
  {
    id: 'galaxy',
    type: 'julia',
    view: { cx: 0, cy: 0, scale: 3.2 },
    c: { re: -0.8, im: 0.156 },
    name: { en: 'Spiral Galaxy', tr: 'Sarmal Gökada' },
    description: {
      en: 'Thin arms of dust swirl around two bright centres.',
      tr: 'İnce toz kolları iki parlak merkezin çevresinde döner.',
    },
  },
  {
    id: 'siegel-disc',
    type: 'julia',
    view: { cx: 0, cy: 0, scale: 3 },
    c: { re: -0.391, im: -0.587 },
    name: { en: 'Siegel Disc', tr: 'Siegel Diski' },
    description: {
      en: 'Points inside turn round and round forever without ever settling down.',
      tr: 'İçerideki noktalar hiç durulmadan sonsuza dek dönüp durur.',
    },
  },
  {
    id: 'armada',
    type: 'burning-ship',
    view: { cx: -1.7605, cy: 0.028, scale: 0.11 },
    c: null,
    name: { en: 'Armada', tr: 'Filo' },
    description: {
      en: 'A small ship with blazing masts on the antenna of the Burning Ship.',
      tr: "Yanan Gemi'nin anteninde direkleri alev alev yanan küçük bir gemi.",
    },
  },
];

/**
 * Looks up a place by id.
 * @param {string} id
 * @returns {Place|null}
 */
export function getPlace(id) {
  return PLACES.find((place) => place.id === id) ?? null;
}
