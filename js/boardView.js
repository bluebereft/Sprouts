/* ================================================================
   boardView.js — Sprouts v0.6.1

   Responsibility
   ──────────────
   The browser's visual representation of the current game.

   The engine owns mathematical game state (dots, edges, moves,
   lives). It knows nothing about screens. boardView holds the
   additional information the browser needs to draw the game:

     • The screen position of every dot  (Map<dotId, {x, y}>)
     • The SVG path of every edge        (Map<moveIndex, pathString>)

   boardView is a browser-only concept. It does not exist in
   command-line, bot, or AI contexts. Multiple clients playing the
   same game would each maintain their own boardView.

   Player ownership is NOT stored here. Which player made a given
   move is derivable from the move index via engine/rules.js
   (playerForMove). Storing it here would duplicate game knowledge
   that the engine already encodes implicitly through currentPlayer
   and the ordered move history.

   How it grows with the project
   ──────────────────────────────
   v0.6.1  dot positions only (set from initial layout + moves)
   v0.7    edge paths added (set from player-drawn curves)
   v0.9    replay cursor; positions populated from saved path data
   AI      boardView not instantiated (engine runs headlessly)

   Renderer reads from boardView for all spatial data.
   The engine never receives or returns coordinates.
   ================================================================ */

const BoardView = (() => {

  // Map<dotId: number, {x: number, y: number}>
  // Screen position of each dot. Set on game start for initial dots,
  // and after each move for the newly created sprout dot.
  let dotPositions = new Map();

  // Map<moveIndex: number, svgPath: string>
  // The SVG path string representing the drawn curve for each move.
  // Populated in v0.7 when path drawing is introduced.
  let edgePaths = new Map();

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Clears all visual state. Call at the start of every game.
   */
  function reset() {
    dotPositions = new Map();
    edgePaths    = new Map();
  }

  // ── Dot positions ──────────────────────────────────────────────

  /**
   * Records the screen position of a dot.
   *
   * @param {number} dotId
   * @param {number} x
   * @param {number} y
   */
  function setDotPosition(dotId, x, y) {
    dotPositions.set(dotId, { x, y });
  }

  /**
   * Returns the screen position of a dot, or null if not registered.
   *
   * @param {number} dotId
   * @returns {{ x: number, y: number } | null}
   */
  function getDotPosition(dotId) {
    return dotPositions.get(dotId) ?? null;
  }

  // ── Edge paths ─────────────────────────────────────────────────

  /**
   * Records the SVG path string for a move's drawn curve.
   * Called by ui.js after the player completes a path (v0.7+).
   *
   * @param {number} moveIndex — 0-based index into Engine.getState().moves
   * @param {string} svgPath   — SVG path data string, e.g. "M 100 200 C ..."
   */
  function setEdgePath(moveIndex, svgPath) {
    edgePaths.set(moveIndex, svgPath);
  }

  /**
   * Returns the SVG path string for a move, or null if not set.
   *
   * @param {number} moveIndex
   * @returns {string | null}
   */
  function getEdgePath(moveIndex) {
    return edgePaths.get(moveIndex) ?? null;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    reset,
    setDotPosition,
    getDotPosition,
    setEdgePath,
    getEdgePath,
  };

})();

export default BoardView;
