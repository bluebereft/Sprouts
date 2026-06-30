/* ================================================================
   ui.js — Sprouts v0.7

   Responsibility
   ──────────────
   Own every interaction between the user and the application:
     • Reading values from the dropdown.
     • Responding to the Start Game button.
     • Handling clicks on the SVG board (dot selection).
     • Handling pointer drag on the SVG board (curve drawing).
     • Writing status messages to the #status element.
     • Updating the debug move list below the board.
     • Updating the turn indicator after each move.

   UI is the only module that reads HTML elements directly.
   All human-readable strings live here.

   Endpoint selection (v0.7.1 — reworked)
   ───────────────────────────────────────
   State tracks two independent endpoint slots: first and second.

   Click logic for selecting/deselecting dots:
     • Nothing selected, click a dot       → select as first.
     • First selected, click first again   → select first dot as
                                              second too (self-loop).
     • First selected, click a different dot → select as second.
     • Both selected (loop or not), click the first dot
                                            → deselect first.
                                              If it was a loop
                                              (first === second),
                                              clears both. Otherwise
                                              the second dot becomes
                                              the sole selection.
     • Both selected, click the second dot → symmetric to the above.
     • Both selected, click anything else  → ignored (the pointer
                                              handlers own drawing
                                              gestures at this point).

   v0.7.2 drawing flow (movement-based gesture detection)
   ─────────────────────────────────────────────────────
   A previous version tried to distinguish "tap to deselect a dot"
   from "press-and-drag to draw" by checking the pointerdown target:
   if it landed on a currently-selected dot, the gesture was assumed
   to be a deselect tap and sampling never started. This was wrong —
   starting a draw by pressing down directly on one of the two
   selected dots is the natural way to begin drawing (e.g. press on
   dot 1, drag to dot 2), and that gesture was being swallowed
   entirely, leaving only an accidental deselect via the trailing
   click event.

   The fix: sampling always starts on pointerdown, regardless of
   target. The tap-vs-drag decision is deferred to pointerup, based
   on how far the pointer actually moved:

     pointerdown (both endpoints selected)
       → always start sampling raw points; remember which endpoint
         the gesture started nearest to

     pointermove
       → append point, show live draft path

     pointerup
       → if total movement is below DRAG_THRESHOLD: this was a tap,
         not a drag. Discard the sample silently and let the
         separate 'click' event (fired by the browser immediately
         after) handle selection/deselection via handleBoardClick,
         exactly as it does when both endpoints are NOT yet selected.
       → otherwise: this was a real draw attempt. Run the full
         simplify → validate → commit-or-reject flow.

   Depends on: selectionState.js, boardView.js, renderer.js, engine/,
               pathSimplify.js, crossingDetection.js
   ================================================================ */

import { createMove } from './engine/move.js';
import { playerForMove } from './engine/rules.js';
import { getRegionForDot } from './engine/regions.js';
import Engine from './engine/engine.js';
import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import Renderer, { pathMidpoint } from './renderer.js';
import { simplifyPath } from './pathSimplify.js';
import { crossesAny, pathSelfIntersects, trimNearPoints } from './crossingDetection.js';

const UI = (() => {

  // ── Cached element references (set in init) ────────────────────
  let statusEl         = null;
  let moveListEl       = null;
  let turnIndicatorEl  = null;
  let boardEl          = null;

  // ── Draw-in-progress state (local to this module; not game state) ─
  // Raw pointer-sampled points for the curve currently being drawn.
  // Reset to null when not drawing. This is transient interaction
  // state, the same category as SelectionState, just not promoted
  // to its own module since nothing else needs to read it.
  let drawingPoints = null;

  // Which dot id the current draw gesture started nearest to.
  // Set in handlePointerDown, read in handlePointerUp to determine
  // which endpoint the path should be checked as ending at, and to
  // normalise the committed path's direction (always start→end by
  // dot id order in the Move, regardless of which dot the player
  // physically started drawing from).
  let drawStartDotId = null;

  // Minimum total pointer movement (SVG user units) required for a
  // gesture to count as a draw rather than a tap. Below this, the
  // gesture is silently discarded and the browser's trailing 'click'
  // event is left to handle dot selection/deselection instead.
  const DRAG_THRESHOLD = 6;

  // Minimum distance (SVG user units) the released pointer must be
  // from the second dot's position for the draw to be accepted as
  // "reaching" that dot. Generous enough for imprecise freehand input.
  const DOT_CAPTURE_RADIUS = 20;

  // Minimum number of distinct raw points before a draw is even
  // considered for commit, to filter out accidental clicks/taps.
  const MIN_DRAW_POINTS = 3;

  // Radius (SVG user units) around every dot center within which
  // crossing checks are skipped. Matches the renderer's visible dot
  // radius (DOT_RADIUS in renderer.js) plus a small margin, since
  // any apparent "crossing" entirely inside a dot's visible circle
  // is not something the player can see or reasonably avoid — every
  // edge touching that dot necessarily passes through this area.
  // See crossingDetection.js trimNearPoints() for how this is used.
  const DOT_EXCLUSION_RADIUS = 12;

  // ── Status helpers ─────────────────────────────────────────────

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function updateTurnIndicator(player) {
    if (!turnIndicatorEl) return;
    turnIndicatorEl.dataset.player = player;
    turnIndicatorEl.textContent = `Player ${player + 1}'s turn`;
  }

  /**
   * Briefly flashes the board red to signal a rejected draw.
   * Removes the class after the animation completes so it can
   * be re-triggered on a subsequent rejection.
   */
  function flashReject() {
    if (!boardEl) return;
    boardEl.classList.remove('board--rejected');
    // Force reflow so the animation restarts if triggered again
    // in quick succession.
    void boardEl.offsetWidth;
    boardEl.classList.add('board--rejected');
  }

  // ── Move list (debug view) ─────────────────────────────────────

  function renderMoveList() {
    const moves = Engine.getState().moves ?? [];

    if (moves.length === 0) {
      moveListEl.innerHTML = '<p class="move-list__empty">No moves yet.</p>';
      return;
    }

    const items = moves.map((move, index) => {
      const from = move.startDotId + 1;
      const to   = move.endDotId   + 1;
      return `<li class="move-list__item">${index + 1}. Dot ${from} → Dot ${to}</li>`;
    });

    moveListEl.innerHTML = `<ol class="move-list__ol">${items.join('')}</ol>`;
  }

  // ── Draw-mode helpers ──────────────────────────────────────────

  /**
   * True when both endpoint slots are filled and the board should
   * accept pointer drawing instead of dot-selection clicks.
   */
  function bothEndpointsSelected() {
    return SelectionState.getFirstSelectedDotId()  !== null
        && SelectionState.getSecondSelectedDotId() !== null;
  }

  /**
   * Updates the board's CSS class and status text to reflect whether
   * we are currently in draw mode. Called after every selection
   * change and after every move commit/reject.
   */
  function syncDrawMode() {
    const ready = bothEndpointsSelected();
    if (boardEl) boardEl.classList.toggle('board--drawing', ready);
  }

  /**
   * Converts a pointer event's client coordinates into SVG user-space
   * coordinates, accounting for the board's current scale (the SVG
   * scales responsively via CSS, so client pixels and SVG user units
   * are not 1:1 except at native size).
   *
   * @param {PointerEvent} event
   * @returns {{x:number, y:number}}
   */
  function toSvgPoint(event) {
    const pt = boardEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = boardEl.getScreenCTM();
    if (!ctm) return { x: event.offsetX, y: event.offsetY };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  // ── Board click handler (dot selection) ─────────────────────────

  /**
   * Central handler for clicks on dots — selects/deselects endpoints.
   *
   * Once both endpoints are selected, clicks are still handled here
   * for the two specific dots currently selected (to allow stepping
   * back out of draw mode) — see the v0.7.1 selection logic in the
   * file header comment. Clicks on any other element while both
   * endpoints are selected are ignored, since the pointer-drawing
   * handlers own the board at that point.
   *
   * Captures both selection slots before mutating State so that
   * Renderer.updateSelection() receives an accurate before/after diff.
   */
  function handleBoardClick(event) {
    const dotIdAttr = event.target.dataset.dotId;
    if (dotIdAttr === undefined) return;   // clicked empty board space

    const clickedId = parseInt(dotIdAttr, 10);

    const prevFirst  = SelectionState.getFirstSelectedDotId();
    const prevSecond = SelectionState.getSecondSelectedDotId();

    // ── Lives guard ───────────────────────────────────────────────
    // Only applies when selecting a NEW dot. A dot already selected
    // (first or second) must remain clickable so it can be deselected
    // even if its lives somehow reached 0 mid-selection (defensive;
    // not currently reachable in normal play).
    const isAlreadySelected = clickedId === prevFirst || clickedId === prevSecond;
    if (!isAlreadySelected) {
      const engineState = Engine.getState();
      if (engineState) {
        const dot = engineState.dots.find(d => d.id === clickedId);
        if (dot && dot.lives === 0) return;
      }
    }

    const bothWereSelected = prevFirst !== null && prevSecond !== null;

    if (bothWereSelected) {
      // ── Stepping back out of a completed selection ────────────
      if (clickedId === prevFirst) {
        if (prevFirst === prevSecond) {
          // Self-loop fully selected — clicking it again clears both.
          SelectionState.clearFirst();
          setStatus('Select first endpoint.');
        } else {
          // Drop the first dot; the second becomes the sole selection.
          SelectionState.clearFirst();
          SelectionState.selectFirst(prevSecond);
          setStatus('Select second endpoint.');
        }
      } else if (clickedId === prevSecond) {
        // Drop the second dot; the first remains the sole selection.
        SelectionState.clearSecond();
        setStatus('Select second endpoint.');
      } else {
        return; // both selected, clicked something else — ignore
      }

    } else if (prevFirst === null) {
      // ── Nothing selected yet ───────────────────────────────────
      SelectionState.selectFirst(clickedId);
      setStatus('Select second endpoint.');

    } else if (clickedId === prevFirst) {
      // ── Click the only-selected dot again → self-loop ──────────
      SelectionState.selectSecond(clickedId);
      setStatus('Both endpoints selected. Draw a loop from this dot.');

    } else {
      // ── A different dot → normal second endpoint ───────────────
      SelectionState.selectSecond(clickedId);
      setStatus('Both endpoints selected. Draw a curve between them.');
    }

    Renderer.updateSelection(
      { first: prevFirst, second: prevSecond },
      { first: SelectionState.getFirstSelectedDotId(), second: SelectionState.getSecondSelectedDotId() }
    );

    syncDrawMode();
  }

  // ── Pointer drawing handlers (v0.7) ─────────────────────────────

  /**
   * Starts a new draw gesture. Only proceeds if both endpoints are
   * already selected — otherwise this is a no-op and clicks fall
   * through to handleBoardClick's normal dot-selection behaviour.
   *
   * Always begins sampling regardless of where the pointerdown
   * landed — including directly on one of the two selected dots,
   * which is the natural way to start drawing toward the other dot.
   * Whether this turns out to be a real draw or just a tap (intended
   * as a deselect click) is decided later, in handlePointerUp, based
   * on how far the pointer actually moved — see DRAG_THRESHOLD.
   *
   * Determines which of the two selected dots the gesture started
   * nearest to, so handlePointerUp can check the path's end against
   * the OTHER dot — this is what allows drawing from either endpoint,
   * not just the first-selected one.
   *
   * @param {PointerEvent} event
   */
  function handlePointerDown(event) {
    if (!bothEndpointsSelected()) return;

    const startPoint = toSvgPoint(event);
    drawingPoints = [startPoint];

    const a = SelectionState.getFirstSelectedDotId();
    const b = SelectionState.getSecondSelectedDotId();
    const posA = BoardView.getDotPosition(a);
    const posB = BoardView.getDotPosition(b);

    const distToA = Math.hypot(startPoint.x - posA.x, startPoint.y - posA.y);
    const distToB = Math.hypot(startPoint.x - posB.x, startPoint.y - posB.y);

    // Self-loop: a === b, so it doesn't matter which "start" we pick.
    drawStartDotId = (distToA <= distToB) ? a : b;

    boardEl.setPointerCapture(event.pointerId);
  }

  /**
   * Appends the current pointer position to the in-progress path and
   * updates the live preview. No validation happens here — validation
   * is entirely retrospective, on pointerup (see design.md).
   *
   * @param {PointerEvent} event
   */
  function handlePointerMove(event) {
    if (!drawingPoints) return;
    drawingPoints.push(toSvgPoint(event));
    Renderer.showDraftPath(drawingPoints);
  }

  /**
   * Computes the total straight-line distance from the first to the
   * last point of a raw pointer path. Used as a cheap proxy for "did
   * the pointer actually move" to distinguish a tap from a drag.
   * Deliberately NOT total path length (sum of every segment) since
   * a tremor-y tap-in-place could accumulate noisy length without
   * the pointer ever travelling meaningfully far from its start.
   *
   * @param {Array<{x:number, y:number}>} points
   * @returns {number}
   */
  function netMovement(points) {
    if (!points || points.length < 2) return 0;
    const first = points[0];
    const last  = points[points.length - 1];
    return Math.hypot(last.x - first.x, last.y - first.y);
  }

  /**
   * Finishes a draw gesture: simplifies the raw points, validates the
   * result, and either commits a move or rejects with a message.
   *
   * First decides whether this was actually a drag at all — if the
   * pointer barely moved (a tap, most likely intended to select or
   * deselect a dot), the sample is discarded silently and the
   * browser's trailing 'click' event is left to call
   * handleBoardClick instead. This is what allows pressing down
   * directly on a currently-selected dot to correctly start a draw
   * toward the other dot, while a genuine tap on that same dot still
   * deselects it as expected.
   *
   * Checks the path's end against whichever dot the gesture did NOT
   * start from (drawStartDotId), so drawing is supported starting
   * from either selected endpoint.
   *
   * Rejection never clears the endpoint selection — only the failed
   * curve attempt is discarded, so the player can immediately redraw
   * without re-selecting dots.
   *
   * @param {PointerEvent} event
   */
  function handlePointerUp(event) {
    if (!drawingPoints) return;

    const rawPoints = drawingPoints;
    const startDotId = drawStartDotId;
    drawingPoints  = null;
    drawStartDotId = null;
    Renderer.clearDraftPath();

    // ── Tap vs. drag ─────────────────────────────────────────
    // Below threshold: not a draw attempt at all. Discard silently
    // and let the upcoming 'click' event handle selection state.
    if (netMovement(rawPoints) < DRAG_THRESHOLD) {
      return;
    }

    if (rawPoints.length < MIN_DRAW_POINTS) {
      rejectDraw('Too short — try drawing a longer curve.');
      return;
    }

    const simplified = simplifyPath(rawPoints, 2);

    const a = SelectionState.getFirstSelectedDotId();
    const b = SelectionState.getSecondSelectedDotId();

    // The dot we did NOT start from is the one the curve must reach.
    const endDotId = (startDotId === a) ? b : a;
    const posEnd = BoardView.getDotPosition(endDotId);

    const lastPoint = simplified[simplified.length - 1];
    const distanceToEnd = Math.hypot(lastPoint.x - posEnd.x, lastPoint.y - posEnd.y);
    if (distanceToEnd > DOT_CAPTURE_RADIUS) {
      rejectDraw('Curve must reach the other dot — try again.');
      return;
    }

    if (pathSelfIntersects(simplified)) {
      rejectDraw('That curve crosses itself — try again.');
      return;
    }

    // Trim both the candidate path and every existing edge path
    // around all dot centers before checking for crossings. Without
    // this, two edges that legitimately share a dot would often
    // register a false-positive crossing from their final segments
    // converging inside that dot's visible (but geometrically
    // ordinary) circular area — see crossingDetection.js for detail.
    const allDotPositions = collectAllDotPositions();
    const trimmedCandidate = trimNearPoints(simplified, allDotPositions, DOT_EXCLUSION_RADIUS);

    const existingPaths = collectExistingEdgePaths().map(
      path => trimNearPoints(path, allDotPositions, DOT_EXCLUSION_RADIUS)
    );

    if (crossesAny(trimmedCandidate, existingPaths)) {
      rejectDraw('That line crosses another — try again.');
      return;
    }

    // Normalise direction: the committed path always runs from
    // startDotId (= a) to endDotId (= b) regardless of which dot the
    // player physically started drawing from, so Move's startDotId/
    // endDotId semantics stay consistent with the stored path.
    const orientedPath = (startDotId === a) ? simplified : [...simplified].reverse();

    commitMove(orientedPath, a, b);
  }

  /**
   * Gathers the current screen position of every dot on the board
   * (initial dots and every sprout created so far), for use as
   * exclusion points when trimming paths before crossing checks.
   *
   * @returns {Array<{x:number, y:number}>}
   */
  function collectAllDotPositions() {
    const engineState = Engine.getState();
    if (!engineState || !Array.isArray(engineState.dots)) return [];
    return engineState.dots
      .map(dot => BoardView.getDotPosition(dot.id))
      .filter(pos => pos !== null);
  }

  /**
   * Gathers every committed edge path currently in BoardView, for
   * crossing detection against a freshly-drawn candidate path.
   *
   * @returns {Array<Array<{x:number, y:number}>>}
   */
  function collectExistingEdgePaths() {
    const moves = Engine.getState().moves ?? [];
    const paths = [];
    for (let i = 0; i < moves.length; i++) {
      const path = BoardView.getEdgePath(i);
      if (path) paths.push(path);
    }
    return paths;
  }

  /**
   * Handles a rejected draw: visual flash, status message, endpoint
   * selection left untouched so the player can redraw immediately.
   *
   * @param {string} message
   */
  function rejectDraw(message) {
    flashReject();
    setStatus(message);
  }

  // ── Move commit (v0.7) ───────────────────────────────────────────

  /**
   * Commits a validated drawn path as a Move, applies it to the
   * engine, and updates all UI/visual state to reflect the result.
   *
   * @param {Array<{x:number, y:number}>} path — simplified, validated
   * @param {number} a — first endpoint dot id
   * @param {number} b — second endpoint dot id
   */
  function commitMove(path, a, b) {
    const prevFirst  = a;
    const prevSecond = b;

    // ── 1. Derive region and acting player ──────────────────
    // getRegionForDot is a v0.7 stub (always 0); the call site is
    // already correct for when v0.9 makes it real.
    const engineStateBefore = Engine.getState();
    const regionId      = getRegionForDot(engineStateBefore, a);
    const moveIndex      = engineStateBefore.moves.length;
    const actingPlayer  = playerForMove(moveIndex);

    // ── 2. Create move and apply engine transition ───────────
    const move = createMove(a, b, regionId);
    const engineState = Engine.apply(move);

    // ── 3. Record the validated path in BoardView ────────────
    // Stored before computing the sprout position so BoardView is
    // immediately consistent if anything reads it mid-update.
    BoardView.setEdgePath(moveIndex, path);

    // ── 4. Place the new sprout at the curve's arc-length midpoint
    const newDot = engineState.dots[engineState.dots.length - 1];
    const sproutPos = pathMidpoint(path);
    BoardView.setDotPosition(newDot.id, sproutPos.x, sproutPos.y);

    // ── 5. Draw the new dot ───────────────────────────────────
    Renderer.addDot(newDot, engineState.dots.length - 1, actingPlayer);

    // ── 6. Clear selection state and visuals ──────────────────
    // Must happen before syncDotStates() — see v0.6.1 fix notes:
    // dotClass() checks SelectionState, and if the endpoints are
    // still marked selected when syncDotStates() runs, the selected
    // class wins over the exhausted class incorrectly.
    SelectionState.clearSelections();
    Renderer.updateSelection(
      { first: prevFirst, second: prevSecond },
      { first: null, second: null }
    );

    // ── 7. Sync exhausted states and redraw all edges ─────────
    Renderer.syncDotStates(engineState);
    Renderer.renderEdges(engineState);

    // ── 8. Update turn indicator, status, draw mode, move list ─
    updateTurnIndicator(engineState.currentPlayer);
    syncDrawMode();
    setStatus('Select first endpoint.');
    renderMoveList();
  }

  // ── Game start ─────────────────────────────────────────────────

  function startGame(select, board) {
    const count  = parseInt(select.value, 10);
    const boardW = parseFloat(board.getAttribute('width'));
    const boardH = parseFloat(board.getAttribute('height'));

    SelectionState.initDots(count, boardW, boardH);

    BoardView.reset();
    SelectionState.getDots().forEach(dot => {
      BoardView.setDotPosition(dot.id, dot.x, dot.y);
    });

    Renderer.initBoard(board);

    Engine.init({
      dots:          SelectionState.getDots().map(({ id, lives }) => ({ id, lives })),
      edges:         [],
      nextDotId:     count,
      moves:         [],
      currentPlayer: 0,
    });

    drawingPoints = null;
    board.classList.remove('board--drawing', 'board--rejected');

    updateTurnIndicator(0);
    syncDrawMode();
    setStatus('Select first endpoint.');
    renderMoveList();
  }

  // ── Init ───────────────────────────────────────────────────────

  /**
   * Wires up all event listeners. Called once by app.js on startup.
   */
  function init() {
    const startBtn = document.getElementById('start-btn');
    const select   = document.getElementById('dot-count');
    const board    = document.getElementById('board');
    statusEl        = document.getElementById('status');
    moveListEl      = document.getElementById('move-list');
    turnIndicatorEl = document.getElementById('turn-indicator');
    boardEl         = board;

    if (!startBtn || !select || !board || !statusEl || !moveListEl || !turnIndicatorEl) {
      console.error('Sprouts: required DOM elements are missing.');
      return;
    }

    startBtn.addEventListener('click', () => startGame(select, board));

    // Dot selection (click) and curve drawing (pointer drag) share
    // the same board element. handleBoardClick handles clicks on any
    // dot at any time (selecting, deselecting, or stepping back out
    // of a completed two-endpoint selection). The pointer handlers
    // only begin sampling when both endpoints are selected AND the
    // pointerdown did not land on either selected dot — see the
    // guard at the top of handlePointerDown.
    board.addEventListener('click', handleBoardClick);
    board.addEventListener('pointerdown', handlePointerDown);
    board.addEventListener('pointermove', handlePointerMove);
    board.addEventListener('pointerup',   handlePointerUp);
    board.addEventListener('pointerleave', handlePointerUp);

    startGame(select, board);
  }

  return {
    init
  };

})();

export function init() {
  return UI.init();
}
