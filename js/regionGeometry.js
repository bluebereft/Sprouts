/* ================================================================
   regionGeometry.js — Sprouts v1.0 (PR 10)

   Responsibility
   ────────────────
   Pure planar geometry for enclosure ("who ended up inside the
   loop?"). Given a drawn closed-ish curve and a set of points (the
   screen positions of candidate occupant dots), decides which points
   the curve encloses. This is the geometric raw material for a
   split move's placement π (spec §7.2): occupants inside the loop go
   to the interior side, occupants outside go to the exterior side.

   Knows nothing about Sprouts, darts, σ, faces, or engine state —
   same discipline as pathGeometry.js / crossingDetection.js. The
   translation from "inside/outside the drawn loop" to the engine's
   side indices (1 / 2) and the exteriorSide value is NOT done here;
   that bridging lives in cornerGeometry.js (which can see engine
   state). This file answers only the pure question "is this point
   inside that polygon?".

   Depends on: nothing.
   ================================================================ */

/**
 * Signed winding number of a point relative to a closed polygon
 * (implicitly closed — last point connects back to first, same as
 * pointInPolygon). Unlike pointInPolygon's even-odd test, the SIGN
 * distinguishes which way the boundary was traced: positive for a
 * counterclockwise-traced boundary (standard math y-up convention;
 * in this project's y-down screen coordinates that corresponds to
 * a visually clockwise curve), negative for the reverse, zero for
 * genuinely outside — regardless of self-intersection.
 *
 * Needed specifically where pointInPolygon cannot discriminate: two
 * reconstructed face polygons that trace the SAME physical curve in
 * opposite directions (a self-loop with no other boundary structure
 * to differentiate its two sides — see js/cornerGeometry.js's
 * resolveEndpointCorner, PR 10c) give pointInPolygon the identical
 * answer for either one, but opposite-signed winding numbers.
 *
 * @param {{x:number,y:number}} point
 * @param {Array<{x:number,y:number}>} polygon — at least 2 points
 * @returns {number} the winding number (typically -1, 0, or 1 for a
 *   simple closed curve; sign is what matters for this project's use)
 */
export function windingNumber(point, polygon) {
  if (!polygon || polygon.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const a1 = Math.atan2(p1.y - point.y, p1.x - point.x);
    const a2 = Math.atan2(p2.y - point.y, p2.x - point.x);
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    total += delta;
  }
  return total / (2 * Math.PI);
}

/**
 * Standard even-odd (ray-casting) point-in-polygon test. The polygon
 * is the ordered vertex list `polygon` (an array of {x, y}); the
 * curve is treated as implicitly closed (last point connects back to
 * the first), which matches a Sprouts self-loop whose drawn path
 * starts and ends at the same dot.
 *
 * Returns true if `point` is strictly inside. Points exactly on an
 * edge are not guaranteed either way (a boundary case that does not
 * arise for dot centres, which never lie on a drawn curve — a curve
 * touching another dot would have been rejected as a crossing).
 *
 * @param {{x:number,y:number}} point
 * @param {Array<{x:number,y:number}>} polygon — at least 3 points
 * @returns {boolean}
 */
export function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    // Does the horizontal ray from (x,y) cross edge (i,j)?
    const intersects =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Partitions a set of identified points into those enclosed by the
 * loop and those outside it.
 *
 * @param {Array<{x:number,y:number}>} loopPath — the drawn self-loop
 *   curve (implicitly closed)
 * @param {Array<{id:number, point:{x:number,y:number}}>} candidates
 * @returns {{ inside: number[], outside: number[] }} arrays of ids
 */
export function partitionByEnclosure(loopPath, candidates) {
  const inside = [];
  const outside = [];
  for (const { id, point } of candidates) {
    if (pointInPolygon(point, loopPath)) inside.push(id);
    else outside.push(id);
  }
  return { inside, outside };
}

/**
 * Signed area of a closed polyline (shoelace formula). Positive or
 * negative depending on winding direction; magnitude is the enclosed
 * area. Used to sanity-check that a "loop" actually encloses nonzero
 * area before trusting an enclosure decision.
 *
 * @param {Array<{x:number,y:number}>} polygon
 * @returns {number}
 */
export function signedArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
  }
  return sum / 2;
}
