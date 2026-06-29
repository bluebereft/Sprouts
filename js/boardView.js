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
     • The player who made each move     (Map<moveIndex, player>)
     • The player who created each dot   (Map<dotId, player>)

   Player is 0 or 1. Initial dots have no player (null) — they are
   neutral territory. Dots and edges created by a move inherit the
   player who made that move, for colouring purposes only.

   boardView is a browser-only concept. It does not exist in
   command-line, bot, or AI contexts. Multiple clients playing the
   same game would each maintain their own boardView.

   How it grows with the project
   ──────────────────────────────
   v0.5  dot positions only (set from initial layout)
   v0.4  edge paths added (set from player-drawn curves)
   v0.9  replay cursor; positions populated from saved path data
   AI    boardView not instantiated (engine runs headlessly)

   Renderer reads from boardView for all spatial data.
   The engine never receives or returns coordinates.
   ================================================================ */

const BoardView = (() => {

  // Map<dotId: number, {x: number, y: number}>
  let dotPositions = new Map();

  // Map<moveIndex: number, svgPath: string>
  let edgePaths = new Map();

  // Map<moveIndex: number, player: 0|1>
  // Which player made each move. Used to colour edges.
  let movePlayers = new Map();

  // Map<dotId: number, player: 0|1|null>
  // Which player created each dot. null for initial dots (neutral).
  let dotPlayers = new Map();

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Clears all visual state. Call at the start of every game.
   */
  function reset() {
    dotPositions = new Map();
    edgePaths    = new Map();
    movePlayers  = new Map();
    dotPlayers   = new Map();
  }

  // ── Dot positions ──────────────────────────────────────────────

  /**
   * Records the screen position of a dot.
   * Called on game start for each initial dot, and after each move
   * for the newly created sprout dot.
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
   * Called by ui.js after the player completes a path (v0.4+).
   *
   * @param {number} moveIndex — 0-based index into Engine.getState().moves
   * @param {string} svgPath   — SVG path data string, e.g. "M 100 200 C ..."
   */
  function setEdgePath(moveIndex, svgPath) {
    edgePaths.set(moveIndex, svgPath);
  }

  /**
   * Returns the SVG path string for a move, or null if not set.
   * Returns null for moves where path drawing is not yet implemented.
   *
   * @param {number} moveIndex
   * @returns {string | null}
   */
  function getEdgePath(moveIndex) {
    return edgePaths.get(moveIndex) ?? null;
  }

  // ── Player tracking ────────────────────────────────────────────

  /**
   * Records which player made a move.
   * Called by ui.js immediately before Engine.apply().
   *
   * @param {number} moveIndex — 0-based index of the move
   * @param {0|1}    player
   */
  function setMovePlayer(moveIndex, player) {
    movePlayers.set(moveIndex, player);
  }

  /**
   * Returns the player who made a move, or null.
   * @param {number} moveIndex
   * @returns {0|1|null}
   */
  function getMovePlayer(moveIndex) {
    return movePlayers.get(moveIndex) ?? null;
  }

  /**
   * Records which player created a dot.
   * Pass null for initial dots (they are neutral).
   *
   * @param {number}   dotId
   * @param {0|1|null} player
   */
  function setDotPlayer(dotId, player) {
    dotPlayers.set(dotId, player);
  }

  /**
   * Returns the player who created a dot, or null for initial dots.
   * @param {number} dotId
   * @returns {0|1|null}
   */
  function getDotPlayer(dotId) {
    return dotPlayers.get(dotId) ?? null;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    reset,
    setDotPosition,
    getDotPosition,
    setEdgePath,
    getEdgePath,
    setMovePlayer,
    getMovePlayer,
    setDotPlayer,
    getDotPlayer,
  };

})();

export default BoardView;
