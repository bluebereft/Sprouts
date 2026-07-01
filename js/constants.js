/* ================================================================
   constants.js — Sprouts v0.7

   Shared constants used across multiple modules. Centralised here
   so that values derived from the same underlying concept (e.g.
   "how big is a dot on screen") are defined once, not scattered
   as independent magic numbers across renderer.js and ui.js.

   Depends on: nothing. Imported by renderer.js, drawInteraction.js.
   ================================================================ */

/**
 * Radius of a dot circle in SVG user units.
 * The single source of truth for dot size — renderer.js reads this
 * for drawing, and drawInteraction.js derives its thresholds from it.
 */
export const DOT_RADIUS = 8;

/**
 * How close the pointer must be to an endpoint dot (in SVG user
 * units) for a drawn curve to count as "reaching" that dot.
 * Deliberately generous — freehand drawing is imprecise.
 */
export const DOT_CAPTURE_RADIUS = 20;

/**
 * Radius around every dot center within which crossing checks are
 * skipped. Slightly larger than DOT_RADIUS so that any apparent
 * crossing that occurs entirely inside a dot's visible circle is
 * ignored — it's just two edges converging on the same shared point.
 * See crossingDetection.js trimNearPoints().
 */
export const DOT_EXCLUSION_RADIUS = DOT_RADIUS + 4;
