/**
 * Tiny DOM helpers for the UI modules. Elements are built with createElement
 * and filled with textContent: no HTML strings anywhere.
 */

/**
 * Looks up an element of the page skeleton by id.
 * @param {string} id
 * @returns {any} the element (typed loosely so callers can use input or canvas properties)
 */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

/**
 * Creates an element with a class, text, attributes and children.
 * @param {string} tag
 * @param {{className?: string, text?: string, attrs?: Record<string, string>}} [options]
 * @param {Node[]} [children]
 * @returns {any}
 */
export function createElement(tag, { className, text, attrs = {} } = {}, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

/**
 * Fills in the translatable parts of a subtree: text (data-i18n), aria-label
 * (data-i18n-label) and tooltip (data-i18n-title).
 * @param {ParentNode} root
 * @param {(key: string) => string} t
 */
export function translateTree(root, t) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-label]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
}

/**
 * Sets aria-pressed on a toggle button.
 * @param {Element} button
 * @param {boolean} pressed
 */
export function setPressed(button, pressed) {
  button.setAttribute('aria-pressed', String(pressed));
}
