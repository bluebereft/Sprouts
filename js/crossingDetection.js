/* ================================================================
   crossingDetection.js — Sprouts v0.7

   Responsibility
   ──────────────
   Pure geometry utility. Determines whether one polyline path
   crosses (intersects) another, or itself.

   This file knows nothing about Sprouts, dots, moves, or regions.
   It operates only on arrays of {x, y} points and plain numbers.
   No imports from engine/, boardView.js, or any game-specific module.

   Dot-radius exclusion
   ─────────────────────
   Every edge path's first and last point sit at (or very near) a
   dot's center. Two different edges sharing the same dot will both
   have a short final segment running from "just outside the dot"
   to "the dot's center" — and those short segments can numerically
   cross each other even though, visually, they're just two lines
   converging on the same point inside a dot the player can see as
   a single coloured circle.

   trimNearPoints() removes the leading/trailing portion of a path
   that falls within a given radius of one or more exclusion points
   (dot centers), so crossing checks only consider the visible,
   "open board" portion of each path — exactly what the player can
   actually see crossing or not crossing.

   Used by ui.js (v0.7) to retrospectively check a freshly-drawn
   curve against all existing edge paths after the player finishes
   drawing. The same primitives will be reused at v0.9 to check a
   curve against a region's boundary once real regions exist — the
   check itself does not need to change, only what it's checked
   against.

   Depends on: nothing.
   ================================================================ */

/**
 * Returns a copy of path with any leading and/or trailing points
 * removed that fall within `radius` of any point in `exclusionPoints`.
 *
 * Walks in from the start, dropping points while they're within
 * radius of an exclusion point, then does the same from the end.
 * Where the trimmed boundary falls strictly between two original
 * points, a new interpolated point is inserted exactly at the
 * radius boundary, so the trimmed path's endpoint sits precisely on
 * the circle's edge rather than jumping past it — this keeps the
 * trim accurate regardless of how widely spaced the original sample
 * points were.
 *
 * If the entire path falls within radius of an exclusion point
 * (a degenerate, very short draw near a single dot), returns an
 * empty array.
 *
 * @param {Array<{x:number, y:number}>} path
 * @param {Array<{x:number, y:number}>} exclusionPoints — dot centers
 * @param {number} radius
 * @returns {Array<{x:number, y:number}>}
 */
export function trimNearPoints(path, exclusionPoints, radius) {
  if (!path || path.length === 0) return [];
  if (!exclusionPoints || exclusionPoints.length === 0) return [...path];

  const isExcluded = (p) =>
    exclusionPoints.some(c => Math.hypot(p.x - c.x, p.y - c.y) <= radius);

  let start = 0;
  while (start < path.length && isExcluded(path[start])) start++;

  if (start >= path.length) return []; // entire path was within radius

  let end = path.length - 1;
  while (end > start && isExcluded(path[end])) end--;

  const trimmed = path.slice(start, end + 1);

  // Interpolate a precise boundary point at the start, if we trimmed
  // anything and there's a preceding excluded point to interpolate from.
  if (start > 0) {
    const boundary = interpolateToRadius(path[start - 1], path[start], exclusionPoints, radius);
    if (boundary) trimmed.unshift(boundary);
  }

  // Same at the end.
  if (end < path.length - 1) {
    const boundary = interpolateToRadius(path[end + 1], path[end], exclusionPoints, radius);
    if (boundary) trimmed.push(boundary);
  }

  return trimmed;
}

/**
 * Finds the point along the segment from `outside` to `inside` where
 * it first crosses `radius` distance from the nearest exclusion
 * point. Used by trimNearPoints to place a precise boundary point
 * rather than just dropping points wholesale.
 *
 * Falls back to returning `inside` unmodified if no exclusion point
 * is near enough to matter (defensive; should not normally happen
 * given how this is called).
 *
 * @param {{x:number,y:number}} outside — point already excluded
 * @param {{x:number,y:number}} inside  — point already kept
 * @param {Array<{x:number,y:number}>} exclusionPoints
 * @param {number} radius
 * @returns {{x:number,y:number}|null}
 */
function interpolateToRadius(outside, inside, exclusionPoints, radius) {
  // Find the exclusion point nearest to `outside`, since that's the
  // one responsible for excluding it.
  let nearest = null;
  let nearestDist = Infinity;
  for (const c of exclusionPoints) {
    const d = Math.hypot(outside.x - c.x, outside.y - c.y);
    if (d < nearestDist) { nearestDist = d; nearest = c; }
  }
  if (!nearest) return null;

  // Walk a few steps along the segment to approximate the radius
  // crossing point. A small fixed number of steps is sufficient
  // here since this only affects sub-pixel visual precision, not
  // crossing correctness.
  const STEPS = 8;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const px = outside.x + (inside.x - outside.x) * t;
    const py = outside.y + (inside.y - outside.y) * t;
    if (Math.hypot(px - nearest.x, py - nearest.y) >= radius) {
      return { x: px, y: py };
    }
  }
  return inside;
}

/**
 * Returns true if pathA crosses pathB anywhere.
 * Treats each path as a sequence of straight segments and checks
 * every segment of pathA against every segment of pathB.
 *
 * @param {Array<{x:number, y:number}>} pathA
 * @param {Array<{x:number, y:number}>} pathB
 * @returns {boolean}
 */
export function pathsCross(pathA, pathB) {
  if (!pathA || !pathB || pathA.length < 2 || pathB.length < 2) {
    return false;
  }

  for (let i = 0; i < pathA.length - 1; i++) {
    for (let j = 0; j < pathB.length - 1; j++) {
      if (segmentsIntersect(pathA[i], pathA[i + 1], pathB[j], pathB[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if any path in existingPaths crosses candidatePath.
 * Convenience wrapper for checking one new path against many.
 *
 * @param {Array<{x:number, y:number}>}   candidatePath
 * @param {Array<Array<{x:number, y:number}>>} existingPaths
 * @returns {boolean}
 */
export function crossesAny(candidatePath, existingPaths) {
  if (!Array.isArray(existingPaths)) return false;
  return existingPaths.some(existing => pathsCross(candidatePath, existing));
}

/**
 * Returns true if a path crosses itself anywhere.
 * Checks every pair of non-adjacent segments within the same path.
 *
 * A small epsilon tolerance is used in the underlying intersection
 * test to avoid false positives from near-parallel segments that
 * pass very close to each other without actually crossing — common
 * in raw or lightly-simplified hand-drawn input, where floating
 * point noise in nearly-collinear segments can otherwise register
 * as a spurious crossing.
 *
 * @param {Array<{x:number, y:number}>} path
 * @returns {boolean}
 */
export function pathSelfIntersects(path) {
  if (!path || path.length < 4) return false;

  for (let i = 0; i < path.length - 1; i++) {
    // Start j at i + 2 to skip the adjacent segment, which always
    // shares an endpoint with segment i and would register as a
    // false-positive "crossing" at that shared point.
    for (let j = i + 2; j < path.length - 1; j++) {
      if (i === 0 && j === path.length - 2) continue; // shared start/end of a closed loop is fine
      if (segmentsIntersect(path[i], path[i + 1], path[j], path[j + 1])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Standard segment-segment intersection test using orientation.
 * Returns true if segment p1-p2 properly intersects segment p3-p4.
 *
 * Uses an epsilon tolerance on the orientation test so that nearly-
 * collinear segments (common artifacts of hand-drawn input, even
 * after simplification) are not flagged as crossing due to floating
 * point noise. Two segments must diverge by more than EPSILON in
 * cross-product magnitude to count as a genuine crossing.
 *
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {{x:number,y:number}} p4
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))) {
    return true;
  }

  // Collinear edge cases: a point lies exactly (within epsilon) on
  // the other segment.
  if (Math.abs(d1) <= EPSILON && onSegment(p3, p4, p1)) return true;
  if (Math.abs(d2) <= EPSILON && onSegment(p3, p4, p2)) return true;
  if (Math.abs(d3) <= EPSILON && onSegment(p1, p2, p3)) return true;
  if (Math.abs(d4) <= EPSILON && onSegment(p1, p2, p4)) return true;

  return false;
}

// Tolerance for the orientation cross-product test. The cross product
// direction() returns scales with the PRODUCT of coordinate
// differences (it is twice the signed area of a triangle), so the
// tolerance must scale with the board's coordinate range, not be a
// small fixed constant. At a board scale of ~700x500 SVG user units,
// segments need to diverge by more than roughly 2 user units of
// perpendicular distance to count as a genuine crossing; this
// constant approximates that threshold in cross-product units.
const EPSILON = 50;

/**
 * Cross product to determine turn direction of p1→p2→p3.
 * @returns {number} positive, negative, or zero
 */
function direction(p1, p2, p3) {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x);
}

/**
 * Returns true if point p lies on the segment a-b, given they are
 * already known to be collinear.
 */
function onSegment(a, b, p) {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
         Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}
