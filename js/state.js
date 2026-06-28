/* ================================================================
   state.js — Sprouts v0.2.3
   
   Responsibility
   ──────────────
   Store and manage the application's current game data.
   This is the single source of truth.
   
   State never touches the DOM, SVG, or HTML controls.
   It exposes a narrow API so that callers (UI, Renderer) can read
   and mutate state only through well-named, intentional functions.
   Future game logic — validating moves, checking win conditions —
   belongs here alongside the data it reasons about.
   
   Depends on: models.js (createDot)
   Load order: after models.js.
   ================================================================ */

const State = (() => {

  // ── Private data ───────────────────────────────────────────────

  // The list of Dot objects currently on the board.
  // Use getDots() to read; never mutate the array directly from outside.
  let dots = [];

  // The id of the currently selected dot, or null when nothing is selected.
  // Use getSelectedDotId(), selectDot(), clearSelection() to interact.
  let selectedDotId = null;

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Replaces the dot list with a fresh set of evenly spaced dots and
   * clears any existing selection. Call this at the start of each game.
   *
   * Layout: dots are placed in a horizontal row through the vertical
   * midpoint of the board, with equal margins on each side.
   *
   * @param {number} count  — how many dots to create (2–6)
   * @param {number} boardW — SVG board width  in user units
   * @param {number} boardH — SVG board height in user units
   */
  function initDots(count, boardW, boardH) {
    dots          = [];
    selectedDotId = null;

    const midY    = boardH / 2;
    const margin  = boardW * 0.12;
    const usableW = boardW - margin * 2;
    // When count is 1 there is no gap; the dropdown starts at 2 in
    // practice, but step: 0 keeps the single-dot case well-defined.
    const step    = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push(createDot(i, margin + i * step, midY));
    }
  }

  /**
   * Returns a shallow copy of the dots array.
   * Callers may iterate freely without risk of mutating internal state.
   *
   * @returns {Array<{id, x, y, lives}>}
   */
  function getDots() {
    return [...dots];
  }

  /**
   * Returns the id of the currently selected dot, or null.
   *
   * @returns {number|null}
   */
  function getSelectedDotId() {
    return selectedDotId;
  }

  /**
   * Marks a dot as selected.
   * Call when a dot is clicked and either nothing was previously selected
   * or a different dot was selected.
   *
   * @param {number} id
   */
  function selectDot(id) {
    selectedDotId = id;
  }

  /**
   * Clears the current selection so no dot is highlighted.
   * Call when the already-selected dot is clicked again.
   */
  function clearSelection() {
    selectedDotId = null;
  }

  return { initDots, getDots, getSelectedDotId, selectDot, clearSelection };

})();