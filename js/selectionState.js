/* ================================================================
   selectionState.js — Sprouts v0.5

   Responsibility
   ──────────────
   Stores UI interaction state only.

   This module tracks which dots the player has selected as the
   first and second endpoints of a move in progress. It also holds
   the initial dot layout so the renderer can position circles on
   game start.

   This is NOT engine state. It contains no game rules and knows
   nothing about edges, legality, or move history. Those live in
   engine/engine.js and engine/reducer.js.

   Moved from engine/state.js → js/selectionState.js (v0.5) to
   make clear that this belongs to the UI layer, not the engine.
   ================================================================ */

import { createDot } from './models.js';

const SelectionState = (() => {

  // ── Private data ───────────────────────────────────────────────

  // Initial dot layout snapshot, used by the renderer on game start
  // and passed to Engine.init() to seed the engine with positions.
  let dots = [];

  // The two endpoint slots for the move currently being constructed.
  // null means that slot is empty.
  let firstSelectedDotId  = null;
  let secondSelectedDotId = null;

  // ── Initialisation ─────────────────────────────────────────────

  /**
   * Computes the initial dot positions and resets selection.
   * Called once per game start, before Engine.init().
   *
   * @param {number} count  — number of starting dots (2–6)
   * @param {number} boardW — SVG board width in user units
   * @param {number} boardH — SVG board height in user units
   */
  function initDots(count, boardW, boardH) {
    dots                = [];
    firstSelectedDotId  = null;
    secondSelectedDotId = null;

    const midY   = boardH / 2;
    const margin  = boardW * 0.12;
    const usableW = boardW - margin * 2;
    const step    = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push(createDot(i, margin + i * step, midY));
    }
  }

  // ── Dot access ─────────────────────────────────────────────────

  /**
   * Returns the initial dot layout as a shallow copy.
   * Used by the renderer during initBoard() and by ui.js to seed
   * the engine with starting positions.
   *
   * @returns {Array<{id, x, y, lives}>}
   */
  function getDots() {
    return [...dots];
  }

  // ── Selection ──────────────────────────────────────────────────

  /** @returns {number|null} */
  function getFirstSelectedDotId()  { return firstSelectedDotId;  }

  /** @returns {number|null} */
  function getSecondSelectedDotId() { return secondSelectedDotId; }

  /**
   * Sets the first endpoint and clears the second.
   * Changing the first invalidates any prior second choice.
   * @param {number} id
   */
  function selectFirst(id) {
    firstSelectedDotId  = id;
    secondSelectedDotId = null;
  }

  /** Sets the second endpoint. First must already be set. */
  function selectSecond(id) { secondSelectedDotId = id; }

  /**
   * Clears the first endpoint (and implicitly the second).
   * A second without a first is meaningless.
   */
  function clearFirst() {
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
  }

  /** Clears only the second endpoint, leaving the first intact. */
  function clearSecond() { secondSelectedDotId = null; }

  /**
   * Promotes the second endpoint to first position.
   * Used when the player deselects the first dot while a second
   * is already chosen — the second becomes the new first.
   */
  function promoteSecondToFirst() {
    firstSelectedDotId  = secondSelectedDotId;
    secondSelectedDotId = null;
  }

  /** Clears both endpoint slots. Called after a move is committed. */
  function clearSelections() {
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    initDots,
    getDots,
    getFirstSelectedDotId,
    getSecondSelectedDotId,
    selectFirst,
    selectSecond,
    clearFirst,
    clearSecond,
    promoteSecondToFirst,
    clearSelections,
  };

})();

export default SelectionState;
