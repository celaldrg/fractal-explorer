import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SIZE,
  PASS_STEPS,
  splitTiles,
  sortCenterOut,
  planRender,
  sampleCount,
  createRenderQueue,
  readTiles,
} from '../src/tiles.js';

/**
 * Counts how often each pixel is covered by the given tiles.
 * @returns {Uint8Array} one counter per pixel
 */
function coverage(tiles, width, height) {
  const hits = new Uint8Array(width * height);
  for (const { x, y, w, h } of tiles) {
    assert.ok(w > 0 && h > 0, 'tiles are not empty');
    assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, 'tiles stay inside the image');
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) hits[row * width + col]++;
    }
  }
  return hits;
}

const coveredOnce = (hits) => hits.every((count) => count === 1);
const distance = (tile, width, height) =>
  (tile.x + tile.w / 2 - width / 2) ** 2 + (tile.y + tile.h / 2 - height / 2) ** 2;

test('tiles cover every pixel of a 1000x700 image exactly once', () => {
  const [width, height] = [1000, 700];
  assert.ok(coveredOnce(coverage(splitTiles(width, height), width, height)));
  const jobs = planRender(width, height);
  assert.deepEqual([...new Set(jobs.map((job) => job.pass))], [0, 1, 2]);
  for (let pass = 0; pass < PASS_STEPS.length; pass++) {
    const passJobs = jobs.filter((job) => job.pass === pass);
    assert.ok(coveredOnce(coverage(passJobs, width, height)), `pass ${pass}`);
    assert.ok(passJobs.every((job) => job.step === PASS_STEPS[pass]));
  }
});

test('coverage holds for other image and tile sizes', () => {
  for (const [width, height] of [[1, 1], [129, 127], [3, 500], [640, 480]]) {
    for (const size of [1, 7, 64, TILE_SIZE, 1000]) {
      const tiles = splitTiles(width, height, size);
      assert.ok(coveredOnce(coverage(tiles, width, height)), `${width}x${height} in tiles of ${size}`);
      assert.equal(tiles.length, Math.ceil(width / size) * Math.ceil(height / size));
    }
  }
  assert.deepEqual(splitTiles(0, 0), []);
  assert.deepEqual(planRender(0, 300), []);
  assert.deepEqual(splitTiles(50, 30), [{ x: 0, y: 0, w: 50, h: 30 }]);
  assert.deepEqual(splitTiles(10, 10, 0), [{ x: 0, y: 0, w: 10, h: 10 }], 'an invalid size falls back');
});

test('edge tiles are cut to fit', () => {
  const tiles = splitTiles(1000, 700);
  assert.equal(tiles.length, 8 * 6);
  assert.ok(tiles.every((tile) => tile.w === (tile.x === 896 ? 104 : 128)));
  assert.ok(tiles.every((tile) => tile.h === (tile.y === 640 ? 60 : 128)));
});

test('passes go coarse to fine and each pass runs from the centre outwards', () => {
  const [width, height] = [1000, 700];
  const jobs = planRender(width, height);
  jobs.forEach((job, index) => assert.equal(job.id, index));
  for (let i = 1; i < jobs.length; i++) {
    assert.ok(jobs[i].pass >= jobs[i - 1].pass, 'passes in order');
    if (jobs[i].pass === jobs[i - 1].pass) {
      assert.ok(distance(jobs[i], width, height) >= distance(jobs[i - 1], width, height), 'centre outwards');
    }
  }
  const first = jobs[0];
  assert.equal(first.step, 8);
  assert.ok(first.x <= width / 2 && width / 2 <= first.x + first.w, 'the first tile holds the centre');
  assert.ok(first.y <= height / 2 && height / 2 <= first.y + first.h);
  assert.deepEqual(planRender(10, 10, { steps: [0] })[0].step, 1, 'an invalid step falls back to 1');
  assert.deepEqual(
    planRender(256, 128, { tileSize: 64, steps: [4, 1] }).map((job) => job.step),
    [4, 4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1],
  );
});

test('centre-out sorting is stable and leaves its input alone', () => {
  const tiles = splitTiles(256, 256);
  const copy = structuredClone(tiles);
  const sorted = sortCenterOut(tiles, 256, 256);
  assert.notEqual(sorted, tiles);
  assert.deepEqual(tiles, copy);
  assert.deepEqual(sorted, tiles, 'four tiles at the same distance keep their order');
});

test('readTiles copies tile regions out of an image, one tile after another', () => {
  const values = Float32Array.from({ length: 5 * 4 }, (_, i) => i);
  const tiles = [
    { x: 1, y: 1, w: 2, h: 2 },
    { x: 4, y: 0, w: 1, h: 3 },
  ];
  assert.deepEqual([...readTiles(values, 5, tiles)], [6, 7, 11, 12, 4, 9, 14]);
  assert.equal(readTiles(values, 5, []).length, 0);

  const [width, height] = [300, 200];
  const image = Float32Array.from({ length: width * height }, (_, i) => i);
  const pass = planRender(width, height).filter((job) => job.pass === 0);
  const read = readTiles(image, width, pass);
  assert.equal(read.length, width * height);
  assert.deepEqual(read.sort(), image, 'one pass reads every pixel exactly once');
});

test('sample counts follow the step', () => {
  assert.equal(sampleCount({ x: 0, y: 0, w: 128, h: 128, step: 1 }), 16384);
  assert.equal(sampleCount({ x: 0, y: 0, w: 128, h: 128, step: 8 }), 256);
  assert.equal(sampleCount({ x: 0, y: 0, w: 104, h: 60, step: 8 }), 13 * 8);
});

test('the queue never starts a finer pass while a coarser one is still running', () => {
  const jobs = planRender(300, 200, { tileSize: 128 });
  const perPass = jobs.length / PASS_STEPS.length;
  const queue = createRenderQueue(jobs);
  const total = jobs.reduce((sum, job) => sum + sampleCount(job), 0);

  const first = [];
  for (let job = queue.next(); job; job = queue.next()) first.push(job);
  assert.equal(first.length, perPass);
  assert.ok(first.every((job) => job.pass === 0));
  assert.equal(queue.next(), null, 'pass 1 waits');
  for (const job of first.slice(0, -1)) {
    assert.deepEqual(queue.complete(job), { passComplete: false, finished: false });
  }
  assert.equal(queue.next(), null, 'still waiting for the last coarse tile');
  assert.deepEqual(queue.complete(first.at(-1)), { passComplete: true, finished: false });
  const coarse = first.reduce((sum, job) => sum + sampleCount(job), 0);
  assert.equal(queue.progress(), coarse / total);
  assert.equal(queue.next().pass, 1);
});

test('a simulated pool of workers renders every job once and finishes at 100 %', () => {
  const jobs = planRender(1000, 700);
  const queue = createRenderQueue(jobs);
  const seen = new Set();
  const running = [];
  let completedPasses = 0;
  let finished = false;
  let lastProgress = 0;
  while (!finished) {
    for (let job = running.length < 4 ? queue.next() : null; job; job = running.length < 4 ? queue.next() : null) {
      assert.ok(!seen.has(job.id), 'dispatched once');
      assert.equal(job.pass, completedPasses, 'only jobs of the current pass are running');
      seen.add(job.id);
      running.push(job);
    }
    const result = queue.complete(running.shift());
    if (result.passComplete) completedPasses++;
    finished = result.finished;
    assert.ok(queue.progress() > lastProgress);
    lastProgress = queue.progress();
  }
  assert.equal(seen.size, jobs.length);
  assert.equal(completedPasses, PASS_STEPS.length);
  assert.equal(queue.progress(), 1);
  assert.equal(queue.next(), null);
});

test('an empty queue is finished from the start', () => {
  const queue = createRenderQueue([]);
  assert.equal(queue.next(), null);
  assert.equal(queue.progress(), 1);
});
