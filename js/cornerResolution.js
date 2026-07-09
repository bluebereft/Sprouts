/* ================================================================
   cornerResolution.js — Sprouts Browser Layer (v0.9.2 — PR 4)

   Responsibility
   ──────────────
   Pure geometry: given the angles of a vertex's EXISTING departing
   edges (in σ order — i.e. existingAngles[i] is the angle of the
   dart currently at rotations[v][i]) and the angle of a newly drawn
   curve's departure, determines which corner (gap in the rotation)
   the new curve occupies — spec §7.1, using the indexing convention
   pinned in js/engine/move.js's file header.

   Scope decision (PR 4 design review): this module contains ONLY
   the pure angle→index algorithm, fully testable under Node with
   synthetic angle data. It does NOT extract real angles from
   boardView.js's dot positions/edge paths — that bridging work is
   js/cornerGeometry.js's job (PR 9, v1.0), which wires this module's
   output into ui.js's commitMove.
   This was a deliberate scope cut, not an oversight — see the PR 4
   design notes in docs/migration-plan.md.

   Depends on: nothing. Pure function of angles (radians).
   ================================================================ */

/**
 * Normalizes an angle (radians) into [0, 2π).
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle(angle) {
  const twoPi = 2 * Math.PI;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/**
 * Resolves which corner (gap in the rotation) a new departure angle
 * falls into, relative to a vertex's existing departure angles,
 * listed in σ order.
 *
 * Returns a corner index i meaning "insert immediately after the
 * dart currently at position i" — matching js/engine/move.js's
 * pinned corner-indexing convention exactly, so the result can be
 * passed straight through as a Move's startCorner/endCorner.
 *
 * Degree-0 vertices (existingAngles = []) have exactly one trivial
 * corner: index 0, per spec §10.3.
 *
 * @param {number[]} existingAngles — angles (radians) of the
 *   vertex's existing departing edges, in σ (rotation) order
 * @param {number} newAngle — angle (radians) of the new departure
 * @returns {number} corner index
 */
export function resolveCornerIndex(existingAngles, newAngle) {
  const d = existingAngles.length;
  if (d === 0) return 0;

  const nAngle = normalizeAngle(newAngle);

  for (let i = 0; i < d; i++) {
    const a = normalizeAngle(existingAngles[i]);
    const b = normalizeAngle(existingAngles[(i + 1) % d]);
    // For d === 1, a === b: the single existing dart's gap spans the
    // full circle, so arcSpan must be 2π, not 0 — normalizeAngle(b-a)
    // would otherwise collapse to 0 and mask every new angle.
    const arcSpan = (d === 1) ? 2 * Math.PI : normalizeAngle(b - a);
    const offset = normalizeAngle(nAngle - a);

    if (offset > 0 && offset < arcSpan) {
      return i;
    }
  }

  // Every new angle should land strictly inside exactly one gap for
  // distinct existing angles. If none matched (e.g. an exact
  // coincidence with an existing angle — degenerate input, shouldn't
  // occur for real drawn curves), fall back to the last gap
  // deterministically rather than throwing.
  return d - 1;
}
