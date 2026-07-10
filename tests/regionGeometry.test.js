/* ================================================================
   tests/regionGeometry.test.js — Sprouts v1.0 (PR 10)

   Tests for js/regionGeometry.js — pure enclosure geometry. No
   engine, no DOM, matching the module's scope.
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, partitionByEnclosure, signedArea } from '../js/regionGeometry.js';

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
