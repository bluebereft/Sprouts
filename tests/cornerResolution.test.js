/* ================================================================
   tests/cornerResolution.test.js — Sprouts v0.9.2 (PR 4)

   Tests for js/cornerResolution.js — pure angle-to-corner-index
   resolution. All inputs are synthetic angles; no boardView, no
   DOM, matching the module's own scope (see its file header).
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCornerIndex } from '../js/cornerResolution.js';

const DEG = Math.PI / 180;

// ── Degree-0 (isolated vertex) ────────────────────────────────────

test('resolveCornerIndex: degree-0 vertex always resolves to corner 0', () => {
  assert.equal(resolveCornerIndex([], 0), 0);
  assert.equal(resolveCornerIndex([], 3.14), 0);
  assert.equal(resolveCornerIndex([], -1.5), 0);
});

// ── Degree-1 (single existing dart) ───────────────────────────────

test('resolveCornerIndex: degree-1 vertex — any new angle resolves to the single gap (index 0)', () => {
  // One existing dart at 0°. The gap spans the whole circle, so
  // every possible new angle lands in it.
  assert.equal(resolveCornerIndex([0], 90 * DEG), 0);
  assert.equal(resolveCornerIndex([0], 180 * DEG), 0);
  assert.equal(resolveCornerIndex([0], 270 * DEG), 0);
  assert.equal(resolveCornerIndex([0], 359 * DEG), 0);
});

// ── Degree-2 ───────────────────────────────────────────────────────

test('resolveCornerIndex: degree-2 vertex — new angle strictly between the two existing angles resolves to index 0', () => {
  // Existing darts at 0° and 180° (in sigma order). Gap 0 spans
  // 0deg -> 180deg (counterclockwise); gap 1 spans 180deg -> 360deg(=0deg).
  const existing = [0, 180 * DEG];
  assert.equal(resolveCornerIndex(existing, 90 * DEG), 0);   // in gap 0
  assert.equal(resolveCornerIndex(existing, 270 * DEG), 1);  // in gap 1
});

test('resolveCornerIndex: degree-2 vertex — wraparound gap is handled correctly', () => {
  // Existing darts at 350° and 10° (sigma order) — gap 0 spans
  // 350deg -> 10deg, crossing the 0deg/360deg boundary.
  const existing = [350 * DEG, 10 * DEG];
  assert.equal(resolveCornerIndex(existing, 0), 0);           // inside the wraparound gap
  assert.equal(resolveCornerIndex(existing, 180 * DEG), 1);   // the other gap
});

// ── Degree-3 ───────────────────────────────────────────────────────

test('resolveCornerIndex: degree-3 vertex — resolves to the correct one of three gaps', () => {
  const existing = [0, 120 * DEG, 240 * DEG];
  assert.equal(resolveCornerIndex(existing, 60 * DEG), 0);    // between 0 and 120
  assert.equal(resolveCornerIndex(existing, 180 * DEG), 1);   // between 120 and 240
  assert.equal(resolveCornerIndex(existing, 300 * DEG), 2);   // between 240 and 360(=0)
});

// ── Angle normalization ────────────────────────────────────────────

test('resolveCornerIndex: negative and >360° angles normalize correctly', () => {
  const existing = [0, 180 * DEG];
  assert.equal(resolveCornerIndex(existing, -270 * DEG), 0); // -270 === 90
  assert.equal(resolveCornerIndex(existing, 450 * DEG), 0);  // 450 === 90
});
