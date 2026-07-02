/* ================================================================
   tests/engine/regions.test.js — Sprouts v0.9

   Tests for js/engine/regions.js.

   v0.9 scope only: buildInitialTopology(), which seeds the starting
   topological data model. Deliberately narrow — no Euler's formula
   checks, no invariant checker, no getRegionForDot() lookup tests.
   Those belong to v0.9.1, which builds real query functions tested
   against hand-constructed multi-region fixtures. This file only
   confirms the STARTING structure is seeded correctly, since every
   later query and every mutation the reducer will eventually perform
   builds on this being right.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialTopology } from '../../js/engine/regions.js';

test('buildInitialTopology: produces exactly one region', () => {
  const topo = buildInitialTopology(3);
  assert.equal(topo.regions.length, 1);
  assert.equal(topo.regions[0].id, 0);
});

test('buildInitialTopology: produces exactly dotCount boundaries, not one shared boundary', () => {
  // A boundary is a cyclic walk along real edges. With zero edges at
  // game start, there is no walk connecting separate dots — each
  // isolated dot is trivially its own boundary. One shared boundary
  // holding all dots would be wrong and would break Euler's formula
  // (C = dotCount requires dotCount boundaries, not one).
  const topo = buildInitialTopology(4);
  assert.equal(topo.boundaries.length, 4);
});

test('buildInitialTopology: each boundary holds exactly one dot, matching 0..count-1', () => {
  const topo = buildInitialTopology(3);
  const vertexSets = topo.boundaries.map(b => b.vertices);
  assert.deepEqual(vertexSets, [[0], [1], [2]]);
});

test('buildInitialTopology: boundary ids are unique and sequential starting at 0', () => {
  const topo = buildInitialTopology(4);
  assert.deepEqual(topo.boundaries.map(b => b.id), [0, 1, 2, 3]);
});

test('buildInitialTopology: the single region lists every boundary id', () => {
  const topo = buildInitialTopology(5);
  assert.deepEqual(topo.regions[0].boundaries, [0, 1, 2, 3, 4]);
});

test('buildInitialTopology: nextRegionId starts at 1, nextBoundaryId starts at dotCount', () => {
  // Region 0 and boundaries 0..dotCount-1 are already taken.
  const topo = buildInitialTopology(6);
  assert.equal(topo.nextRegionId, 1);
  assert.equal(topo.nextBoundaryId, 6);
});

test('buildInitialTopology: works correctly for the minimum case of 1 dot', () => {
  const topo = buildInitialTopology(1);
  assert.equal(topo.regions.length, 1);
  assert.equal(topo.boundaries.length, 1);
  assert.deepEqual(topo.boundaries[0].vertices, [0]);
  assert.equal(topo.nextBoundaryId, 1);
});
