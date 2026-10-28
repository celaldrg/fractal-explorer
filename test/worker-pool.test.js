import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerPool } from '../src/worker-pool.js';
import { planRender, createRenderQueue } from '../src/tiles.js';
import { computeTile } from '../src/render.js';

/** A module worker whose script died on load: it reports an error and never answers. */
class DeadWorker {
  /** @type {DeadWorker[]} */
  static instances = [];

  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
    DeadWorker.instances.push(this);
    setTimeout(() => this.onerror?.({ preventDefault() {} }), 0);
  }

  postMessage() {}

  terminate() {
    this.terminated = true;
  }
}

test('when the workers die on load, the pool warns once and still renders every tile', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const hadWorker = 'Worker' in globalThis;
  const original = globalThis.Worker;
  globalThis.Worker = DeadWorker;
  t.after(() => {
    if (hadWorker) globalThis.Worker = original;
    else delete globalThis.Worker;
  });

  const width = 40;
  const height = 30;
  const request = {
    fractal: { type: 'mandelbrot', maxIter: 60, cRe: 0, cIm: 0 },
    view: { cx: -0.75, cy: 0, scale: 2.8 },
    width,
    height,
  };
  const jobs = planRender(width, height, { tileSize: 16 });
  const pool = createWorkerPool();
  const received = [];
  await new Promise((resolve) => {
    pool.run(request, createRenderQueue(jobs), (tile, values, status) => {
      received.push(tile.id);
      assert.deepEqual(values, computeTile({ ...request, ...tile }));
      if (status.finished) resolve();
    });
  });

  assert.deepEqual(
    received.sort((a, b) => a - b),
    jobs.map((job) => job.id),
    'every tile arrives once',
  );
  assert.ok(DeadWorker.instances.length > 0);
  assert.ok(DeadWorker.instances.every((worker) => worker.terminated), 'dead workers are let go');
  assert.equal(warn.mock.callCount(), 1, 'one warning, however many workers died');
  assert.match(warn.mock.calls[0].arguments[0], /render worker failed.*main thread/);
});
