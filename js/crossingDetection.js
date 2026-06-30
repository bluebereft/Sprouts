/* ================================================================
   crossingDetection.js — Sprouts v0.7

   Responsibility
   ──────────────
   Pure geometry utility. Determines whether one polyline path
   crosses (intersects) another, or itself.

   This file knows nothing about Sprouts, dots, moves, or regions.
   It operates only on arrays of {x, y} points. No imports from
   engine/, boardView.js, or any game-specific module.

   Used by ui.js (v0.7) to retrospectively check a freshly-drawn
   curve against all existing edge paths after the player finishes
   drawing. The same primitives will be reused at v0.9 to check a
   curve against a region's boundary once real regions exist — the
   check itself does not need to change, only what it's checked
   against.

   Depends on: nothing.
   ================================================================ */

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

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  // Collinear edge cases: a point lies exactly on the other segment.
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

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
