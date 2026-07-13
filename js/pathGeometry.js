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
 * Shared arc-length walk: finds the segment index and interpolation
 * fraction t where the polyline's cumulative length reaches half its
 * total. Single source of truth for arcLengthSplit() and
 * splitPathAtMidpoint() below, so "where does the sprout sit" and
 * "what are the curve's two constituent arcs" can never disagree.
 *
 * @param {Array<{x:number,y:number}>} points
 * @returns {{index:number, t:number, point:{x:number,y:number}}}
 *   index is the segment [points[index], points[index+1]] containing
 *   the midpoint; degenerate inputs return index -1.
 */
function findArcLengthMidpoint(points) {
  if (!points || points.length === 0) {
    return { index: -1, t: 0, point: { x: 0, y: 0 } };
  }
  if (points.length === 1) {
    return { index: -1, t: 0, point: points[0] };
  }

  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { index: -1, t: 0, point: points[0] };
  }

  const halfLength = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= halfLength) {
      const remaining = halfLength - accumulated;
      const t = segLen === 0 ? 0 : remaining / segLen;
      const p1 = points[i];
      const p2 = points[i + 1];
      const point = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
      return { index: i, t, point };
    }
    accumulated += segLen;
  }

  // Floating-point edge case: rounding left the walk just short of
  // halfLength at the very last segment.
  return { index: segmentLengths.length - 1, t: 1, point: points[points.length - 1] };
}

/**
 * Finds the arc-length midpoint of a polyline and the two departure
 * angles a sprout placed there would have — one toward the "start"
 * end of the path, one toward the "end" end.
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

  const { index, t, point } = findArcLengthMidpoint(points);

  if (index === -1) {
    // All points coincide (degenerate) — matches pathMidpoint's own
    // degenerate fallback (return points[0]); no direction meaningful.
    return { point, angleTowardStart: 0, angleTowardEnd: 0 };
  }

  const p1 = points[index];
  const p2 = points[index + 1];
  // The local tangent at the split point is this segment's
  // direction. The two rays a sprout departs on are that direction
  // and its exact reverse (splitting a curve at an interior point
  // does not create a new bend).
  const angleTowardEnd   = segmentAngle(p1, p2);
  const angleTowardStart = angleTowardEnd + Math.PI;

  return { point, angleTowardStart, angleTowardEnd };
}

/**
 * Splits a drawn curve into its two constituent arcs at the
 * arc-length midpoint — the point where a move's sprout sits. This
 * is what a self-loop's TWO engine edges (dot→sprout, sprout→dot)
 * actually look like geometrically: arcToStart is the curve from the
 * split point back to the path's start; arcToEnd is the curve from
 * the split point forward to the path's end. Each is a real, usable
 * polyline (≥ 2 points) suitable for building a face's boundary
 * polygon (see js/cornerGeometry.js's resolveMovePlacement).
 *
 * Shares findArcLengthMidpoint with arcLengthSplit — the split point
 * used for PLACEMENT (sprout position/angles) and the split point
 * used for GEOMETRY (these two arcs) can never disagree.
 *
 * @param {Array<{x:number,y:number}>} points — at least 2 points
 * @returns {{
 *   splitPoint: {x:number,y:number},
 *   arcToStart: Array<{x:number,y:number}>,
 *   arcToEnd: Array<{x:number,y:number}>
 * }}
 */
export function splitPathAtMidpoint(points) {
  if (!points || points.length < 2) {
    const p = (points && points[0]) || { x: 0, y: 0 };
    return { splitPoint: p, arcToStart: [p], arcToEnd: [p] };
  }

  const { index, point } = findArcLengthMidpoint(points);

  if (index === -1) {
    return { splitPoint: point, arcToStart: [point], arcToEnd: [point] };
  }

  // arcToEnd: split point, then forward through the remaining points.
  const arcToEnd = [point, ...points.slice(index + 1)];
  // arcToStart: split point, then backward through the preceding
  // points to the path's actual start — reversed so index 0 is the
  // split point and the last entry is the true start, matching
  // arcToEnd's "split point first" shape for a consistent caller API.
  const arcToStart = [point, ...points.slice(0, index + 1).reverse()];

  return { splitPoint: point, arcToStart, arcToEnd };
}
