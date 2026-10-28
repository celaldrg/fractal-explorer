/**
 * Tile scheduler: splits an image into tiles, orders them from the centre
 * outwards and plans progressive passes (a coarse preview first, then finer
 * passes). The queue hands jobs to workers one pass at a time, so a coarse
 * result can never land on top of a finer one.
 */

/** Default tile edge in pixels. */
export const TILE_SIZE = 128;

/** Default sampling steps of the passes: 8x8 blocks, then 2x2 blocks, then every pixel. */
export const PASS_STEPS = [8, 2, 1];

/**
 * @typedef {Object} Tile
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Tile & {id: number, pass: number, step: number}} TileJob
 */

/**
 * Splits a width x height image into tiles of at most size x size pixels, row by row.
 * Tiles on the right and bottom edges are cut to fit.
 * @param {number} width
 * @param {number} height
 * @param {number} [size]
 * @returns {Tile[]}
 */
export function splitTiles(width, height, size = TILE_SIZE) {
  const edge = size >= 1 ? Math.floor(size) : TILE_SIZE;
  const tiles = [];
  for (let y = 0; y < height; y += edge) {
    for (let x = 0; x < width; x += edge) {
      tiles.push({ x, y, w: Math.min(edge, width - x), h: Math.min(edge, height - y) });
    }
  }
  return tiles;
}

/**
 * Sorts tiles by the distance of their centre from the image centre (stable for ties).
 * @param {Tile[]} tiles
 * @param {number} width
 * @param {number} height
 * @returns {Tile[]} a new array
 */
export function sortCenterOut(tiles, width, height) {
  const distance = (tile) =>
    (tile.x + tile.w / 2 - width / 2) ** 2 + (tile.y + tile.h / 2 - height / 2) ** 2;
  return tiles
    .map((tile) => ({ tile, d: distance(tile) }))
    .sort((a, b) => a.d - b.d)
    .map(({ tile }) => tile);
}

/**
 * Plans a progressive render: one pass per step, each pass covering every
 * pixel once with tiles ordered from the centre outwards.
 * @param {number} width
 * @param {number} height
 * @param {{tileSize?: number, steps?: number[]}} [options]
 * @returns {TileJob[]} jobs in dispatch order
 */
export function planRender(width, height, { tileSize = TILE_SIZE, steps = PASS_STEPS } = {}) {
  const tiles = sortCenterOut(splitTiles(width, height, tileSize), width, height);
  const jobs = [];
  steps.forEach((step, pass) => {
    for (const tile of tiles) {
      jobs.push({ id: jobs.length, pass, step: step >= 1 ? Math.floor(step) : 1, ...tile });
    }
  });
  return jobs;
}

/**
 * Copies the values of some tiles out of a row-major image, one tile after another.
 * @param {Float32Array} values width values per row
 * @param {number} width
 * @param {Tile[]} tiles
 * @returns {Float32Array}
 */
export function readTiles(values, width, tiles) {
  const out = new Float32Array(tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0));
  let at = 0;
  for (const tile of tiles) {
    for (let row = 0; row < tile.h; row++) {
      const start = (tile.y + row) * width + tile.x;
      out.set(values.subarray(start, start + tile.w), at);
      at += tile.w;
    }
  }
  return out;
}

/**
 * Number of samples a job computes.
 * @param {TileJob} job
 * @returns {number}
 */
export function sampleCount(job) {
  return Math.ceil(job.w / job.step) * Math.ceil(job.h / job.step);
}

/**
 * Creates a dispatch queue over planned jobs. next() returns the next job, or
 * null when the queue is empty or the next pass must wait until every job of
 * the current pass has completed.
 * @param {TileJob[]} jobs result of planRender
 */
export function createRenderQueue(jobs) {
  const total = jobs.reduce((sum, job) => sum + sampleCount(job), 0);
  let cursor = 0;
  let inFlight = 0;
  let done = 0;
  let pass = jobs.length > 0 ? jobs[0].pass : 0;

  return {
    /** @returns {TileJob|null} */
    next() {
      if (cursor >= jobs.length) return null;
      const job = jobs[cursor];
      if (job.pass !== pass) {
        if (inFlight > 0) return null;
        pass = job.pass;
      }
      cursor++;
      inFlight++;
      return job;
    },

    /**
     * Marks a dispatched job as finished.
     * @param {TileJob} job
     * @returns {{passComplete: boolean, finished: boolean}}
     */
    complete(job) {
      inFlight--;
      done += sampleCount(job);
      const finished = cursor >= jobs.length && inFlight === 0;
      const passComplete = inFlight === 0 && (finished || jobs[cursor].pass !== job.pass);
      return { passComplete, finished };
    },

    /** @returns {number} share of samples computed so far, 0 to 1 */
    progress() {
      return total > 0 ? done / total : 1;
    },
  };
}
