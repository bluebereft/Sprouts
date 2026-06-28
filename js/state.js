/* ================================================================
   state.js — Sprouts v0.3.0
   
   Responsibility
   ──────────────
   Store and manage the application's current game data.
   This is the single source of truth.
   
   State never touches the DOM, SVG, or HTML controls.
   It exposes a narrow API so that callers (UI, Renderer) can read
   and mutate state only through well-named, intentional functions.
   Future game logic — validating moves, checking win conditions —
   belongs here alongside the data it reasons about.
   
   v0.3.0 changes
   ──────────────
   The single selectedDotId is replaced by two independent selections:
     firstSelectedDotId  — the first endpoint the player clicked.
     secondSelectedDotId — the second endpoint the player clicked.
   
   A moves array is added to record completed Move objects.
   
   Depends on: models.js (createDot, createMove)
   Load order: after models.js.
   ================================================================ */

const State = (() => {

  // ── Private data ───────────────────────────────────────────────

  // Dot objects currently on the board.
  let dots = [];

  // Id of the first endpoint selected by the player, or null.
  let firstSelectedDotId  = null;

  // Id of the second endpoint selected by the player, or null.
  // secondSelectedDotId is only set after firstSelectedDotId is set.
  let secondSelectedDotId = null;

  // Completed Move objects, in the order they were created.
  let moves = [];

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Replaces the dot list with a fresh set of evenly spaced dots,
   * clears both selections, and clears the move history.
   * Call this at the start of each game.
   *
   * @param {number} count  — how many dots to create (2–6)
   * @param {number} boardW — SVG board width  in user units
   * @param {number} boardH — SVG board height in user units
   */
  function initDots(count, boardW, boardH) {
    dots                = [];
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
    moves               = [];

    const midY    = boardH / 2;
    const margin  = boardW * 0.12;
    const usableW = boardW - margin * 2;
    const step    = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push(createDot(i, margin + i * step, midY));
    }
  }

  /**
   * Returns a shallow copy of the dots array.
   * @returns {Array<{id, x, y, lives}>}
   */
  function getDots() {
    return [...dots];
  }

  /**
   * Returns the id of the first selected dot, or null.
   * @returns {number|null}
   */
  function getFirstSelectedDotId() {
    return firstSelectedDotId;
  }

  /**
   * Returns the id of the second selected dot, or null.
   * @returns {number|null}
   */
  function getSecondSelectedDotId() {
    return secondSelectedDotId;
  }

  /**
   * Sets the first endpoint. Clears the second endpoint if one was set,
   * since changing the first invalidates any prior second choice.
   * @param {number} id
   */
  function selectFirst(id) {
    firstSelectedDotId  = id;
    secondSelectedDotId = null;   // first changed → second is stale
  }

  /**
   * Sets the second endpoint.
   * Only call this after firstSelectedDotId is already set.
   * @param {number} id
   */
  function selectSecond(id) {
    secondSelectedDotId = id;
  }

  /**
   * Clears only the first selection, and by implication the second
   * (a second without a first is meaningless).
   */
  function clearFirst() {
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
  }

  /**
   * Clears only the second selection, leaving the first intact.
   */
  function clearSecond() {
    secondSelectedDotId = null;
  }

  /**
   * Clears both selections. Convenience wrapper used on game reset.
   */
  function clearSelections() {
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
  }

  /**
   * Returns a shallow copy of the moves array.
   * @returns {Array<{startDotId, endDotId}>}
   */
  function getMoves() {
    return [...moves];
  }

  /**
   * Creates a Move from the two currently selected dots and appends
   * it to the move history. Both selections are then cleared.
   *
   * Callers should guard that both selections are non-null before
   * calling this — State does not enforce that here so that the rule
   * can live in the appropriate place (UI for now, engine later).
   */
  function commitMove() {
    moves.push(createMove(firstSelectedDotId, secondSelectedDotId));
    firstSelectedDotId  = null;
    secondSelectedDotId = null;
  }

  return {
    initDots,
    getDots,
    getFirstSelectedDotId,
    getSecondSelectedDotId,
    selectFirst,
    selectSecond,
    clearFirst,
    clearSecond,
    clearSelections,
    getMoves,
    commitMove,
  };

})();