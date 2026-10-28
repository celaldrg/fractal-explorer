/**
 * A pool of module Web Workers that compute render tiles. Free workers pull
 * jobs from a render queue (tiles.js); results of a replaced render are
 * dropped. Where module workers are missing or fail, a stand-in computes the
 * tiles on the main thread, one per task, so the page keeps responding; the
 * console says so once, so that a broken worker does not go unnoticed.
 */

import { computeTile } from './render.js';
import { workerCount } from './display.js';

const WORKER_URL = new URL('./render-worker.js', import.meta.url);

let fallbackReported = false;

/**
 * @typedef {import('./tiles.js').TileJob} TileJob
 * @typedef {{fractal: import('./fractals.js').FractalParams, view: import('./view.js').View, width: number, height: number}} TileRequest
 * @typedef {{generation: number, request: TileRequest, tile: TileJob}} TileMessage
 * @typedef {{postMessage(message: TileMessage, transfer?: Transferable[]): void, terminate(): void,
 *   onmessage: ((event: {data: any}) => void)|null, onerror: ((event: Event) => void)|null}} WorkerLike
 * @typedef {(tile: TileJob, values: Float32Array, status: {passComplete: boolean, finished: boolean}) => void} TileHandler
 */

/**
 * Warns, once per page, that tiles are computed on the main thread.
 * @param {string} reason
 * @param {...unknown} details the error or error event, for the console
 */
function reportFallback(reason, ...details) {
  if (fallbackReported) return;
  fallbackReported = true;
  console.warn(`Fractal Explorer: ${reason}; drawing on the main thread instead.`, ...details);
}

/**
 * A main-thread stand-in with the Worker interface.
 * @returns {WorkerLike}
 */
function createLocalWorker() {
  /** @type {WorkerLike} */
  const local = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      setTimeout(() => {
        const values = computeTile({ ...message.request, ...message.tile });
        local.onmessage?.({ data: { generation: message.generation, tile: message.tile, values } });
      }, 0);
    },
    terminate() {},
  };
  return local;
}

/**
 * A module worker, or the stand-in where workers are unavailable.
 * @returns {WorkerLike}
 */
function spawnWorker() {
  if (typeof Worker === 'undefined') {
    reportFallback('this browser has no Web Workers');
    return createLocalWorker();
  }
  try {
    return /** @type {WorkerLike} */ (/** @type {unknown} */ (new Worker(WORKER_URL, { type: 'module' })));
  } catch (error) {
    reportFallback('a render worker could not be started', error);
    return createLocalWorker();
  }
}

/**
 * Creates the pool, sized from navigator.hardwareConcurrency.
 */
export function createWorkerPool() {
  let generation = 0;
  /** @type {{generation: number, request: TileRequest, queue: ReturnType<typeof import('./tiles.js').createRenderQueue>, onTile: TileHandler}|null} */
  let task = null;
  /** @type {Array<{worker: WorkerLike, message: TileMessage|null}>} */
  const slots = [];

  /**
   * @param {{worker: WorkerLike, message: TileMessage|null}} slot
   * @param {WorkerLike} worker
   */
  function attach(slot, worker) {
    slot.worker = worker;
    worker.onmessage = (event) => receive(slot, event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      reportFallback('a render worker failed', event);
      replaceWithLocal(slot);
    };
  }

  /** @param {{worker: WorkerLike, message: TileMessage|null}} slot */
  function replaceWithLocal(slot) {
    slot.worker.terminate();
    attach(slot, createLocalWorker());
    if (slot.message) slot.worker.postMessage(slot.message);
  }

  /**
   * @param {{worker: WorkerLike, message: TileMessage|null}} slot
   * @param {{generation: number, tile: TileJob, values: Float32Array}} data
   */
  function receive(slot, data) {
    slot.message = null;
    const active = task;
    if (active && data.generation === active.generation) {
      const status = active.queue.complete(data.tile);
      if (status.finished) task = null;
      active.onTile(data.tile, data.values, status);
    }
    dispatch();
  }

  /** Hands queued jobs to free workers. */
  function dispatch() {
    for (const slot of slots) {
      if (!task) return;
      if (slot.message) continue;
      const tile = task.queue.next();
      if (!tile) return;
      slot.message = { generation: task.generation, request: task.request, tile };
      slot.worker.postMessage(slot.message);
    }
  }

  for (let i = 0; i < workerCount(globalThis.navigator?.hardwareConcurrency); i++) {
    const slot = { worker: spawnWorker(), message: null };
    attach(slot, slot.worker);
    slots.push(slot);
  }

  return {
    /**
     * Starts computing a render queue, replacing any render in progress.
     * @param {TileRequest} request what every tile shares
     * @param {ReturnType<typeof import('./tiles.js').createRenderQueue>} queue
     * @param {TileHandler} onTile called for every finished tile of this render
     */
    run(request, queue, onTile) {
      generation += 1;
      task = { generation, request, queue, onTile };
      dispatch();
    },

    /** Drops the render in progress; tiles still being computed are ignored. */
    cancel() {
      task = null;
    },
  };
}
