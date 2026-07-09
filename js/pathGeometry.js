/* ================================================================
   pathGeometry.js — Sprouts v1.0 (PR 9)

   Responsibility
   ────────────────
   Pure geometry utility. Given a drawn/stored curve (an array of
   {x, y} points, as produced by drawInteraction.js and stored by
   boardView.js), answers two questions needed for real corner
   resolution (see js/cornerResolution.js):

     • departureAngle(points, end) — the angle a curve departs at
       one of its two endpoints (used for a dot that is an ORIGINAL
       endpoint of a move — i.e. edges[k].a per the reducer's fixed
       convention, see js/engine/darts.js).

     • arcLengthSplit(points) — the point at the curve's arc-length
       midpoint (where a new sprout dot is placed) PLUS the two
       departure angles a sprout has at creation, one toward each
       original endpoint (used for a dot that IS the sprout —
       edges[k].b). Splitting a smooth curve at an interior point
       yields two rays that are the same local tangent, forward and
       reversed — no special-casing needed beyond that.

   This file knows nothing about Sprouts, engine state, dots, or
   moves — same discipline as pathSimplify.js/crossingDetection.js.
   No imports from engine/, boardView.js, or any game-specific
   module.

   Single source of truth: renderer.js's pathMidpoint() re-exports
   arcLengthSplit's point rather than re-implementing the arc-length
   walk, so sprout PLACEMENT and sprout ANGLE resolution can never
   disagree about where the split point is.

   Depends on: nothing.
   ================================================================ */

/**
 * Angle (radians) of the direction from p0 to p1.
 *
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @returns {number}
 */
export function segmentAngle(p0, p1) {
  return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

/**
 * The angle a curve departs at one of its endpoints.
 *
 * @param {Array<{x:number,y:number}>} points — at least 2 points
 * @param {'start'|'end'} end — which endpoint's departure to compute
 * @returns {number} angle in radians
 */
export function departureAngle(points, end) {
  if (!points || points.length < 2) {
    throw new Error('departureAngle requires at least 2 points');
  }
  return (end === 'start')
    ? segmentAngle(points[0], points[1])
    : segmentAngle(points[points.length - 1], points[points.length - 2]);
}

/**
 * Finds the arc-length midpoint of a polyline and the two departure
 * angles a sprout placed there would have — one toward the "start"
 * end of the path, one toward the "end" end.
 *
 * The midpoint is found by walking cumulative segment length until
 * half the total arc length is reached (identical algorithm to the
 * one previously inlined in renderer.js's pathMidpoint — moved here
 * so placement and angle resolution share one implementation).
 *
 * @param {Array<{x:number,y:number}>} points
 * @returns {{
 *   point: {x:number,y:number},
 *   angleTowardStart: number,
 *   angleTowardEnd: number
 * }}
 */
export function arcLengthSplit(points) {
  if (!points || points.length === 0) {
    return { point: { x: 0, y: 0 }, angleTowardStart: 0, angleTowardEnd: 0 };
  }
  if (points.length === 1) {
    return { point: points[0], angleTowardStart: 0, angleTowardEnd: 0 };
  }

  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segmentLengths.push(len);
    totalLength += len;
  }

  // Degenerate (all points coincide): no direction is meaningful.
  // Matches pathMidpoint's own degenerate fallback (return points[0]).
  if (totalLength === 0) {
    return { point: points[0], angleTowardStart: 0, angleTowardEnd: 0 };
  }

  const halfLength = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= halfLength) {
      const remaining = halfLength - accumulated;
      const t  = segLen === 0 ? 0 : remaining / segLen;
      const p1 = points[i];
      const p2 = points[i + 1];
      const point = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };

      // The local tangent at the split point is this segment's
      // direction. The two rays a sprout departs on are that
      // direction and its exact reverse (splitting a curve at an
      // interior point does not create a new bend).
      const angleTowardEnd   = segmentAngle(p1, p2);
      const angleTowardStart = angleTowardEnd + Math.PI;

      return { point, angleTowardStart, angleTowardEnd };
    }
    accumulated += segLen;
  }

  // Floating-point edge case: rounding left the walk just short of
  // halfLength at the very last segment. Fall back to the last point
  // — same fallback shape pathMidpoint's original loop implicitly
  // fell through to (function body continues past the loop there).
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    point: last,
    angleTowardEnd: segmentAngle(prev, last),
    angleTowardStart: segmentAngle(prev, last) + Math.PI,
  };
}
