/**
 * Render worker: computes one tile per message with the shared engine and
 * sends the escape values back without copying them.
 */

import { computeTile } from './render.js';

self.onmessage = (event) => {
  const { generation, request, tile } = event.data;
  const values = computeTile({ ...request, ...tile });
  self.postMessage({ generation, tile, values }, [values.buffer]);
};
