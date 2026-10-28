/**
 * Interface text in English and Turkish, and the helpers that pick a language
 * and fill in placeholders. Pure data and functions: dom.js applies the text
 * to the page. Names that come with the data (fractal types, palettes, famous
 * places) carry their own {en, tr} pairs and are read with pick().
 */

/** Supported interface languages, the default first. */
export const LANGUAGES = ['en', 'tr'];

/** Language of a first visit. */
export const DEFAULT_LANGUAGE = 'en';

/** Every interface string, keyed by language and then by message key. */
export const STRINGS = {
  en: {
    'app.title': 'Fractal Explorer',
    'lang.code': 'TR',
    'lang.switch': 'TR: switch to Turkish (Türkçe)',
    'header.reset': 'Reset',
    'header.resetHint': 'Show the whole fractal again (0)',
    'header.controls': 'Controls',
    'header.controlsHint': 'Show or hide the controls',
    'toolbar.label': 'View tools',
    'toolbar.zoomIn': 'Zoom in (+)',
    'toolbar.zoomOut': 'Zoom out (−)',
    'toolbar.back': 'Back: undo the last zoom step',
    'toolbar.julia': 'Julia mode (J)',
    'canvas.label':
      'Fractal picture. Drag to pan, use the wheel or pinch to zoom, double-click or double-tap to zoom in.',
    'drawer.title': 'Controls',
    'drawer.close': 'Close the controls',
    'section.fractal': 'Fractal',
    'section.palette': 'Palette',
    'label.density': 'Density',
    'label.offset': 'Offset',
    'section.coloring': 'Coloring',
    'coloring.smooth': 'Smooth',
    'coloring.histogram': 'Histogram',
    'section.iterations': 'Iteration limit',
    'iterations.auto': 'Auto',
    'iterations.manual': 'Manual',
    'iterations.autoNote': 'Auto: {count}, rising as you zoom in',
    'iterations.manualNote': 'Manual: {count} steps per point',
    'section.julia': 'Julia set',
    'julia.pick': 'Pick c on the Mandelbrot set',
    'julia.hint':
      'Hover or drag over the set: the corner shows the Julia set of that point. Click or lift your finger to open it.',
    'julia.re': 'Real part (Re c)',
    'julia.im': 'Imaginary part (Im c)',
    'preview.title': 'Julia preview',
    'section.places': 'Famous places',
    'section.share': 'Save and share',
    'action.save': 'Save PNG',
    'action.share': 'Copy link',
    'share.note': 'The link keeps the fractal, the view, the palette with its density and offset, the coloring, the iteration limit and c.',
    'toast.copied': 'Share link copied',
    'toast.copyFailed': 'Copy the link from the address bar',
    'toast.saved': 'PNG saved',
    'section.help': 'How to explore',
    'help.drag': 'Drag to pan the picture.',
    'help.zoom': 'Wheel or pinch zooms around the pointer; double-click or double-tap zooms in.',
    'help.box': 'Shift-drag draws a zoom box; Back undoes zoom steps.',
    'help.keys': 'Keys: arrows pan, + and − zoom, 0 resets, J toggles Julia mode.',
    'info.center': 'Center',
    'info.zoom': 'Zoom',
    'info.iterations': 'Iterations',
    'info.time': 'Render',
    'info.rendering': 'drawing {percent}%',
    'notice.precision':
      'Precision limit: the view is narrower than about 1e-13, where double precision runs out and the picture turns blocky.',
    'hint.mouse': 'Drag to pan · Scroll to zoom · Double-click to dive in',
    'hint.touch': 'Drag to pan · Pinch to zoom · Double-tap to dive in',
    'footer.source': 'Source on GitHub',
  },
  tr: {
    'app.title': 'Fraktal Gezgini',
    'lang.code': 'EN',
    'lang.switch': 'EN: İngilizceye geç (English)',
    'header.reset': 'Sıfırla',
    'header.resetHint': 'Fraktalın tamamını yeniden göster (0)',
    'header.controls': 'Ayarlar',
    'header.controlsHint': 'Ayarları göster ya da gizle',
    'toolbar.label': 'Görünüm araçları',
    'toolbar.zoomIn': 'Yakınlaştır (+)',
    'toolbar.zoomOut': 'Uzaklaştır (−)',
    'toolbar.back': 'Geri: son yakınlaştırma adımını geri al',
    'toolbar.julia': 'Julia modu (J)',
    'canvas.label':
      'Fraktal resmi. Kaydırmak için sürükleyin, yakınlaştırmak için tekerleği ya da iki parmağınızı kullanın, çift tıklayarak ya da çift dokunarak yaklaşın.',
    'drawer.title': 'Ayarlar',
    'drawer.close': 'Ayarları kapat',
    'section.fractal': 'Fraktal',
    'section.palette': 'Palet',
    'label.density': 'Yoğunluk',
    'label.offset': 'Kaydırma',
    'section.coloring': 'Renklendirme',
    'coloring.smooth': 'Yumuşak',
    'coloring.histogram': 'Histogram',
    'section.iterations': 'Yineleme sınırı',
    'iterations.auto': 'Otomatik',
    'iterations.manual': 'Elle',
    'iterations.autoNote': 'Otomatik: {count}, yaklaştıkça artar',
    'iterations.manualNote': 'Elle: nokta başına {count} adım',
    'section.julia': 'Julia kümesi',
    'julia.pick': "c'yi Mandelbrot kümesinden seç",
    'julia.hint':
      'Kümenin üzerinde gezinin ya da sürükleyin: köşede o noktanın Julia kümesi görünür. Açmak için tıklayın ya da parmağınızı kaldırın.',
    'julia.re': 'Gerçel kısım (Re c)',
    'julia.im': 'Sanal kısım (Im c)',
    'preview.title': 'Julia önizlemesi',
    'section.places': 'Ünlü yerler',
    'section.share': 'Kaydet ve paylaş',
    'action.save': 'PNG kaydet',
    'action.share': 'Bağlantıyı kopyala',
    'share.note': 'Bağlantı fraktalı, görünümü, paleti (yoğunluğu ve kaydırmasıyla), renklendirmeyi, yineleme sınırını ve c değerini saklar.',
    'toast.copied': 'Paylaşım bağlantısı kopyalandı',
    'toast.copyFailed': 'Bağlantıyı adres çubuğundan kopyalayın',
    'toast.saved': 'PNG kaydedildi',
    'section.help': 'Nasıl gezinilir',
    'help.drag': 'Resmi kaydırmak için sürükleyin.',
    'help.zoom': 'Tekerlek ya da iki parmak imlecin çevresinde yakınlaştırır; çift tıklama ya da çift dokunma yaklaştırır.',
    'help.box': 'Shift ile sürükleyince yakınlaştırma kutusu çizilir; Geri, yakınlaştırma adımlarını geri alır.',
    'help.keys': 'Tuşlar: oklar kaydırır, + ve − yakınlaştırır, 0 sıfırlar, J Julia modunu açıp kapatır.',
    'info.center': 'Merkez',
    'info.zoom': 'Yakınlaştırma',
    'info.iterations': 'Yineleme',
    'info.time': 'Çizim',
    'info.rendering': 'çiziliyor %{percent}',
    'notice.precision':
      'Hassasiyet sınırı: görünüm yaklaşık 1e-13 genişliğin altına indi; çift duyarlıklı sayılar burada tükenir ve resim bloklaşır.',
    'hint.mouse': 'Sürükleyerek kaydırın · Tekerlekle yakınlaştırın · Çift tıklayarak dalın',
    'hint.touch': 'Sürükleyerek kaydırın · İki parmakla yakınlaştırın · Çift dokunarak dalın',
    'footer.source': "Kaynak kodu GitHub'da",
  },
};

/**
 * Returns a supported language, or the default for anything else.
 * @param {unknown} value
 * @returns {'en'|'tr'}
 */
export function normalizeLanguage(value) {
  return LANGUAGES.includes(/** @type {string} */ (value)) ? /** @type {'en'|'tr'} */ (value) : DEFAULT_LANGUAGE;
}

/**
 * The language the toggle switches to.
 * @param {string} lang
 * @returns {'en'|'tr'}
 */
export function otherLanguage(lang) {
  return normalizeLanguage(lang) === 'en' ? 'tr' : 'en';
}

/**
 * Looks up a message and fills its {placeholders}. Missing keys fall back to
 * English, then to the key itself, so a gap never breaks the page.
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  const text = STRINGS[normalizeLanguage(lang)][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Reads a {en, tr} pair that came with the data.
 * @param {string} lang
 * @param {{en: string, tr: string}} pair
 * @returns {string}
 */
export function pick(lang, pair) {
  return pair[normalizeLanguage(lang)] ?? pair.en;
}
