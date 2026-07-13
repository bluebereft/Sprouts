/* ================================================================
   tests/pathGeometry.test.js — Sprouts v1.0 (PR 9)

   Tests for js/pathGeometry.js — pure curve geometry. No boardView,
   no DOM, matching the module's own scope (see its file header).
   ================================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentAngle, departureAngle, arcLengthSplit, splitPathAtMidpoint } from '../js/pathGeometry.js';

const EPS = 1e-9;
function assertAngleClose(actual, expected, msg) {
  // Compare angles modulo 2π (atan2 range is (-π, π]).
  let diff = Math.abs(actual - expected) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  assert.ok(diff < 1e-6, `${msg}: expected ${expected}, got ${actual}`);
}

// ── segmentAngle ─────────────────────────────────────────────────

test('segmentAngle: due east/north/west/south', () => {
  assertAngleClose(segmentAngle({ x: 0, y: 0 }, { x: 1, y: 0 }), 0, 'east');
  assertAngleClose(segmentAngle({ x: 0, y: 0 }, { x: 0, y: 1 }), Math.PI / 2, 'south (SVG y-down)');
  assertAngleClose(segmentAngle({ x: 0, y: 0 }, { x: -1, y: 0 }), Math.PI, 'west');
  assertAngleClose(segmentAngle({ x: 0, y: 0 }, { x: 0, y: -1 }), -Math.PI / 2, 'north');
});

// ── departureAngle ───────────────────────────────────────────────

test('departureAngle: straight line, start vs end', () => {
  // A straight horizontal line from (0,0) to (10,0).
  const points = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
  assertAngleClose(departureAngle(points, 'start'), 0, 'departs start heading east');
  // Departing 'end' means the direction FROM the end point BACK
  // along the curve — i.e. heading west.
  assertAngleClose(departureAngle(points, 'end'), Math.PI, 'departs end heading west');
});

test('departureAngle: L-shaped curve uses only the nearest segment', () => {
  // Goes east then north. Only the first/last segment matters for
  // each endpoint's departure — the far end of the curve is
  // irrelevant to the angle at the near end.
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assertAngleClose(departureAngle(points, 'start'), 0, 'starts heading east');
  assertAngleClose(departureAngle(points, 'end'), -Math.PI / 2, 'ends heading north (backing up)');
});

test('departureAngle: throws on a degenerate (<2 point) path', () => {
  assert.throws(() => departureAngle([{ x: 0, y: 0 }], 'start'));
  assert.throws(() => departureAngle([], 'start'));
});

// ── arcLengthSplit ───────────────────────────────────────────────

test('arcLengthSplit: straight line — midpoint and opposite tangents', () => {
  // (0,0) -> (10,0): total length 10, half-length 5 lands exactly at
  // (5,0), inside the single segment. Local tangent there is due
  // east (toward end); toward-start is its exact reverse, due west.
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const split = arcLengthSplit(points);
  assert.equal(split.point.x, 5);
  assert.equal(split.point.y, 0);
  assertAngleClose(split.angleTowardEnd, 0, 'toward end = east');
  assertAngleClose(split.angleTowardStart, Math.PI, 'toward start = west');
});

test('arcLengthSplit: L-shaped curve — split point falls on the bend', () => {
  // (0,0) -> (10,0) -> (10,10): two segments of length 10 each,
  // total 20, half-length 10 — exactly the corner point (10,0).
  // At that exact boundary the walk's ">=" check keeps the FIRST
  // segment (index 0) as "the" segment containing the split, so
  // both tangents come from the east-heading segment: toward-end is
  // east (0), toward-start is west (π). This is a documented
  // consequence of the half-length landing exactly on a vertex, not
  // a claim about the curve's real shape at that instant.
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const split = arcLengthSplit(points);
  assert.equal(split.point.x, 10);
  assert.equal(split.point.y, 0);
  assertAngleClose(split.angleTowardEnd, 0, 'toward end = east (boundary segment)');
  assertAngleClose(split.angleTowardStart, Math.PI, 'toward start = west');
});

test('arcLengthSplit: the two tangents are always exactly opposite', () => {
  // Splitting a curve at an interior point never introduces a new
  // bend — for any path, the two departure angles must differ by
  // exactly π, regardless of the curve's own shape.
  const points = [
    { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 6, y: -2 }, { x: 9, y: 4 }, { x: 12, y: 0 },
  ];
  const split = arcLengthSplit(points);
  const diff = Math.abs(split.angleTowardEnd - split.angleTowardStart) % (2 * Math.PI);
  const normalized = diff > Math.PI ? 2 * Math.PI - diff : diff;
  assert.ok(Math.abs(normalized - Math.PI) < EPS, 'tangents must be exactly opposite');
});

test('arcLengthSplit: degenerate inputs match pathMidpoint\'s old fallbacks', () => {
  assert.deepEqual(arcLengthSplit([]).point, { x: 0, y: 0 });
  assert.deepEqual(arcLengthSplit([{ x: 3, y: 4 }]).point, { x: 3, y: 4 });
  // All points coincide: zero total length, falls back to points[0].
  const coincident = [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }];
  assert.deepEqual(arcLengthSplit(coincident).point, { x: 1, y: 1 });
});

// ── splitPathAtMidpoint (PR 10b) ─────────────────────────────────

test('splitPathAtMidpoint: an L-shaped curve splits at the bend into two real arcs', () => {
  // (0,0)->(10,0)->(10,10): total length 20, half 10. Walking:
  // segment0 alone (len 10) already reaches half-length exactly at
  // its end (accumulated 0 + 10 >= 10), so the split lands AT the
  // bend point (10,0), t=1, using segment INDEX 0 (not 1) — matching
  // arcLengthSplit's own documented ">=" boundary rule (keeps the
  // first segment reaching the threshold).
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const { splitPoint, arcToStart, arcToEnd } = splitPathAtMidpoint(points);
  assert.deepEqual(splitPoint, { x: 10, y: 0 });
  // arcToStart: split point back to the true start (0,0).
  assert.deepEqual(arcToStart, [{ x: 10, y: 0 }, { x: 0, y: 0 }]);
  // arcToEnd: split point, then points.slice(index+1) = points[1..] —
  // since the split point COINCIDES exactly with points[1] (the bend,
  // t=1), this includes a harmless duplicate of it before continuing
  // to the true end (10,10). Zero-length edge, doesn't affect any
  // polygon use — documented, not "fixed away".
  assert.deepEqual(arcToEnd, [{ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
});

test('splitPathAtMidpoint: a straight line splits at its exact midpoint', () => {
  // (0,0)->(10,0): length 10, half 5 -> lands at (5,0), inside the
  // single segment (not on an existing vertex).
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  const { splitPoint, arcToStart, arcToEnd } = splitPathAtMidpoint(points);
  assert.deepEqual(splitPoint, { x: 5, y: 0 });
  assert.deepEqual(arcToStart, [{ x: 5, y: 0 }, { x: 0, y: 0 }]);
  assert.deepEqual(arcToEnd, [{ x: 5, y: 0 }, { x: 10, y: 0 }]);
});

test('splitPathAtMidpoint: both arcs always start with the same splitPoint', () => {
  const points = [
    { x: 0, y: 0 }, { x: 3, y: 1 }, { x: 6, y: -2 }, { x: 9, y: 4 }, { x: 12, y: 0 },
  ];
  const { splitPoint, arcToStart, arcToEnd } = splitPathAtMidpoint(points);
  assert.deepEqual(arcToStart[0], splitPoint);
  assert.deepEqual(arcToEnd[0], splitPoint);
  // The two arcs' far ends are the path's true start and end.
  assert.deepEqual(arcToStart[arcToStart.length - 1], points[0]);
  assert.deepEqual(arcToEnd[arcToEnd.length - 1], points[points.length - 1]);
});

test('splitPathAtMidpoint: degenerate inputs (<2 points) do not crash', () => {
  const single = splitPathAtMidpoint([{ x: 3, y: 4 }]);
  assert.deepEqual(single.splitPoint, { x: 3, y: 4 });
  const empty = splitPathAtMidpoint([]);
  assert.deepEqual(empty.splitPoint, { x: 0, y: 0 });
});
