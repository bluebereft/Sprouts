/* ================================================================
   tests/regionGeometry.test.js — Sprouts v1.0 (PR 10)

   Tests for js/regionGeometry.js — pure enclosure geometry. No
   engine, no DOM, matching the module's scope.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, partitionByEnclosure, signedArea, windingNumber } from '../js/regionGeometry.js';

// A unit square (0,0)-(10,0)-(10,10)-(0,10).
const square = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
];

test('pointInPolygon: a point clearly inside the square is inside', () => {
  assert.equal(pointInPolygon({ x: 5, y: 5 }, square), true);
});

test('pointInPolygon: points clearly outside are outside', () => {
  assert.equal(pointInPolygon({ x: 15, y: 5 }, square), false);
  assert.equal(pointInPolygon({ x: -1, y: 5 }, square), false);
  assert.equal(pointInPolygon({ x: 5, y: 20 }, square), false);
});

test('pointInPolygon: degenerate polygon (<3 points) is never inside', () => {
  assert.equal(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
  assert.equal(pointInPolygon({ x: 0, y: 0 }, []), false);
});

test('pointInPolygon: a non-convex (L-shaped) polygon classifies the notch correctly', () => {
  // L-shape: full square minus its top-right quadrant.
  //   (0,0)(10,0)(10,5)(5,5)(5,10)(0,10)
  const L = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
    { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 },
  ];
  assert.equal(pointInPolygon({ x: 2, y: 2 }, L), true);   // in the solid part
  assert.equal(pointInPolygon({ x: 7, y: 7 }, L), false);  // in the removed notch
});

test('partitionByEnclosure: splits candidates into inside and outside', () => {
  const candidates = [
    { id: 1, point: { x: 5, y: 5 } },   // inside
    { id: 2, point: { x: 50, y: 50 } }, // outside
    { id: 3, point: { x: 2, y: 8 } },   // inside
  ];
  const { inside, outside } = partitionByEnclosure(square, candidates);
  assert.deepEqual(inside.sort(), [1, 3]);
  assert.deepEqual(outside, [2]);
});

test('signedArea: nonzero for a real square, zero for a degenerate line', () => {
  // Square of side 10 has area 100 (sign depends on winding).
  assert.equal(Math.abs(signedArea(square)), 100);
  assert.equal(signedArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0);
});

// ── windingNumber (PR 10c) ─────────────────────────────────────────
//
// Needed because pointInPolygon's even-odd test cannot distinguish a
// curve from its own reverse — the exact degeneracy hit when a
// self-loop's two reconstructed "sides" trace the same physical
// curve in opposite directions (see js/cornerGeometry.js's
// resolveEndpointCorner). Winding number's SIGN can, but only when
// compared against a real reference (a fixed "always positive" rule
// was tried and found wrong for a counterclockwise-drawn loop before
// landing on "compare against the raw drawn path's own winding" —
// recorded here so the fixed-sign mistake isn't repeated).

const squareCW = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
];
const squareCCW = [...squareCW].reverse();

test('windingNumber: opposite sign for the same curve traced in opposite directions', () => {
  const point = { x: 25, y: 25 }; // clearly inside both
  const wCW = windingNumber(point, squareCW);
  const wCCW = windingNumber(point, squareCCW);
  assert.equal(wCW, 1);
  assert.equal(wCCW, -1);
});

test('windingNumber: zero for a point genuinely outside the curve, regardless of direction', () => {
  const outside = { x: 900, y: 900 };
  assert.equal(windingNumber(outside, squareCW), 0);
  assert.equal(windingNumber(outside, squareCCW), 0);
});

test('windingNumber: degenerate inputs (<2 points) return 0, not a crash', () => {
  assert.equal(windingNumber({ x: 0, y: 0 }, []), 0);
  assert.equal(windingNumber({ x: 0, y: 0 }, [{ x: 1, y: 1 }]), 0);
});
