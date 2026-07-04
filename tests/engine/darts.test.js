/* ================================================================
   tests/engine/darts.test.js — Sprouts v0.9.2 (PR 1)

   Direct unit tests for js/engine/darts.js — the pure dart-
   arithmetic layer over the existing `edges` array. No Engine, no
   reducer state beyond what each test builds directly via
   applyMove()/createMove(), matching reducer.test.js's style.

   These tests exist to pin the dart convention permanently: dart 2k
   originates at edges[k].a, dart 2k+1 at edges[k].b, alpha(d) = d^1.
   Later PRs (rotation system, tracer, oracle) depend on this
   convention being exactly right — this file is where a wrong
   convention would first surface.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove } from '../../js/engine/reducer.js';
import { createMove } from '../../js/engine/move.js';
import {
  dartCount,
  edgeOfDart,
  alpha,
  originOf,
  otherEndOf,
  incidentDarts,
  degreeOf,
} from '../../js/engine/darts.js';

function freshState() {
  return {
    dots: [{ id: 0, lives: 3 }, { id: 1, lives: 3 }],
    edges: [],
    nextDotId: 2,
    moves: [],
    currentPlayer: 0,
    initialDotCount: 2,
    startingPlayer: 0,
  };
}

// ── dartCount ────────────────────────────────────────────────────

test('dartCount: 0 for a fresh state with no edges', () => {
  assert.equal(dartCount(freshState().edges), 0);
});

test('dartCount: 2 per edge', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1)); // 2 edges
  assert.equal(dartCount(state.edges), 4);
  state = applyMove(state, createMove(0, 1)); // 2 more edges
  assert.equal(dartCount(state.edges), 8);
});

// ── edgeOfDart ───────────────────────────────────────────────────

test('edgeOfDart: darts 0 and 1 belong to edge 0; darts 2 and 3 to edge 1', () => {
  assert.equal(edgeOfDart(0), 0);
  assert.equal(edgeOfDart(1), 0);
  assert.equal(edgeOfDart(2), 1);
  assert.equal(edgeOfDart(3), 1);
});

// ── alpha: involution, fixed-point-free ─────────────────────────

test('alpha: is an involution (alpha(alpha(d)) === d)', () => {
  for (let d = 0; d < 20; d++) {
    assert.equal(alpha(alpha(d)), d);
  }
});

test('alpha: is fixed-point-free (alpha(d) !== d for all d)', () => {
  for (let d = 0; d < 20; d++) {
    assert.notEqual(alpha(d), d);
  }
});

test('alpha: pairs 2k with 2k+1', () => {
  assert.equal(alpha(0), 1);
  assert.equal(alpha(1), 0);
  assert.equal(alpha(4), 5);
  assert.equal(alpha(5), 4);
});

// ── Pinned origin convention ─────────────────────────────────────

test('originOf: dart 2k originates at edges[k].a, dart 2k+1 at edges[k].b', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  const [edge0, edge1] = state.edges;

  assert.equal(originOf(state.edges, 0), edge0.a);
  assert.equal(originOf(state.edges, 1), edge0.b);
  assert.equal(originOf(state.edges, 2), edge1.a);
  assert.equal(originOf(state.edges, 3), edge1.b);
});

// ── otherEndOf ───────────────────────────────────────────────────

test('otherEndOf: agrees with the edge\'s opposite endpoint', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  const [edge0] = state.edges;

  assert.equal(otherEndOf(state.edges, 0), edge0.b);
  assert.equal(otherEndOf(state.edges, 1), edge0.a);
});

// ── Normal move anatomy ──────────────────────────────────────────

test('incidentDarts/degreeOf: normal move gives each endpoint degree 1, sprout degree 2', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));
  const sprout = state.dots[state.dots.length - 1];

  assert.deepEqual(incidentDarts(state.edges, 0), [0]);
  assert.deepEqual(incidentDarts(state.edges, 1), [2]);
  assert.deepEqual(incidentDarts(state.edges, sprout.id), [1, 3]);

  assert.equal(degreeOf(state.edges, 0), 1);
  assert.equal(degreeOf(state.edges, 1), 1);
  assert.equal(degreeOf(state.edges, sprout.id), 2);
});

// ── Self-loop anatomy ─────────────────────────────────────────────

test('incidentDarts/degreeOf: self-loop gives the looped dot degree 2 via parallel edges', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 0));
  const sprout = state.dots[state.dots.length - 1];

  assert.deepEqual(incidentDarts(state.edges, 0), [0, 2]);
  assert.equal(degreeOf(state.edges, 0), 2);
  assert.equal(degreeOf(state.edges, sprout.id), 2);
});

// ── Lives cross-check (I-6 preview) ──────────────────────────────

test('degreeOf: lives === 3 - degreeOf(edges, id) holds for every dot across a scripted game', () => {
  let state = freshState();
  state.dots.push({ id: 2, lives: 3 });
  state.nextDotId = 3;

  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 2));
  state = applyMove(state, createMove(2, 2)); // self-loop on dot 2 (has 2 lives left)

  for (const dot of state.dots) {
    assert.equal(
      dot.lives,
      3 - degreeOf(state.edges, dot.id),
      `lives/degree mismatch for dot ${dot.id}`
    );
  }
});

// ── Permanence of existing darts ─────────────────────────────────

test('originOf: existing darts\' origins never change after subsequent moves', () => {
  let state = freshState();
  state = applyMove(state, createMove(0, 1));

  const before = [0, 1, 2, 3].map(d => originOf(state.edges, d));

  state = applyMove(state, createMove(0, 1));
  state = applyMove(state, createMove(0, 0));

  const after = [0, 1, 2, 3].map(d => originOf(state.edges, d));

  assert.deepEqual(after, before);
});
