/* ================================================================
   pathSimplify.js — Sprouts v0.7

   Responsibility
   ──────────────
   Pure geometry utility. Takes a raw sequence of pointer-sampled
   points (typically dozens to hundreds of points from a freehand
   drag) and returns a simplified point list — fewer points, same
   essential shape, with small jitter and noise removed.

   This file knows nothing about Sprouts, dots, moves, or regions.
   It would behave identically if reused in any other drawing app.
   No imports from engine/, boardView.js, or any game-specific module.

   Algorithm: Ramer–Douglas–Peucker simplification.
   Recursively keeps only the points that contribute meaningfully to
   the path's shape, discarding points that lie close to a straight
   line between their neighbours.

   Depends on: nothing.
   ================================================================ */

/**
 * Simplifies a polyline using the Ramer–Douglas–Peucker algorithm.
 *
 * @param {Array<{x:number, y:number}>} points    — raw sampled points
 * @param {number} [tolerance=2]                  — max allowed deviation
 *                                                    in SVG user units;
 *                                                    higher = more
 *                                                    aggressive simplification
 * @returns {Array<{x:number, y:number}>} simplified points
 */
export function simplifyPath(points, tolerance = 2) {
  if (!Array.isArray(points) || points.length < 3) {
    return points ? [...points] : [];
  }
  return douglasPeucker(points, tolerance);
}

/**
 * Recursive RDP implementation.
 * @param {Array<{x:number, y:number}>} points
 * @param {number} tolerance
 * @returns {Array<{x:number, y:number}>}
 */
function douglasPeucker(points, tolerance) {
  const first = points[0];
  const last  = points[points.length - 1];

  let maxDist = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist  = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left  = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    // Join without duplicating the shared point at maxIndex.
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points are within tolerance — collapse to endpoints.
  return [first, last];
}

/**
 * Perpendicular distance from a point to the line through lineStart/lineEnd.
 * Falls back to straight-line distance if lineStart === lineEnd.
 *
 * @param {{x:number, y:number}} point
 * @param {{x:number, y:number}} lineStart
 * @param {{x:number, y:number}} lineEnd
 * @returns {number}
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}
