/* ================================================================
   ui.js — Sprouts v0.9

   Responsibility
   ──────────────
   Orchestrates user interaction and coordinates all other modules.
     • Dot selection / deselection (click handler)
     • Status messages and turn indicator
     • Move commitment (engine + boardView + renderer sync)
     • Game start / reset
     • Debug move list

   Drawing mechanics (pointer sampling, path validation, gesture
   classification) are owned by drawInteraction.js — this file
   wires it up via callbacks and handles the results.

   v0.8 — engine-enforced legality
   ─────────────────────────────────
   Engine.apply(move) now returns { ok, state } or { ok, violations }
   instead of a raw state. commitMove() checks result.ok BEFORE any
   BoardView/Renderer mutation — a rejected move must leave no partial
   visual trace behind.

   The UI-layer lives guards (exhausted-dot selection, self-loop
   lives check) remain, but are no longer independent implementations
   of "what's legal" — they now call engine/rules.js's isExhausted()
   directly, so there is exactly one definition of exhaustion in the
   codebase. These guards exist purely for responsiveness (stopping
   the player before they draw a whole curve, rather than after);
   Engine.apply's internal validateMove() call is the actual source
   of truth and would reject the same move regardless.

   Violation codes from the engine are translated to player-facing
   text only here, via VIOLATION_MESSAGES — the engine never emits
   English strings.

   UI is the only module that reads HTML elements directly.
   All human-readable strings live here.

   Depends on: selectionState.js, boardView.js, renderer.js,
               drawInteraction.js, engine/, constants.js
   ================================================================ */

import { createMove } from './engine/move.js';
import { playerForMove, isExhausted, RuleError } from './engine/rules.js';
import { getRegionForDot, buildInitialTopology } from './engine/regions.js';
import Engine from './engine/engine.js';
import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import Renderer, { pathMidpoint } from './renderer.js';
import * as DrawInteraction from './drawInteraction.js';

// Local mapping from engine violation codes to player-facing text.
// This is deliberately the UI's job — the engine only emits codes,
// never prose, so bots/replay/tests never need to parse English.
const VIOLATION_MESSAGES = {
  [RuleError.DOT_NOT_FOUND]:      'That dot no longer exists.',
  [RuleError.INSUFFICIENT_LIVES]: 'Not enough lives for that move.',
  [RuleError.DIFFERENT_REGIONS]:  'Those dots are not in the same region.',
};

const UI = (() => {

  // ── Cached element references (set in init) ────────────────────
  let statusEl         = null;
  let moveListEl       = null;
  let turnIndicatorEl  = null;
  let boardEl          = null;

  // ── Status helpers ─────────────────────────────────────────────

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function updateTurnIndicator(player) {
    if (!turnIndicatorEl) return;
    turnIndicatorEl.dataset.player = player;
    turnIndicatorEl.textContent = `Player ${player + 1}'s turn`;
  }

  function flashReject() {
    if (!boardEl) return;
    boardEl.classList.remove('board--rejected');
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

  function bothEndpointsSelected() {
    return SelectionState.getFirstSelectedDotId()  !== null
        && SelectionState.getSecondSelectedDotId() !== null;
  }

  function syncDrawMode() {
    const ready = bothEndpointsSelected();
    if (boardEl) boardEl.classList.toggle('board--drawing', ready);
  }

  // ── Dot tap handler (selection / deselection) ───────────────────

  /**
   * Handles a tap on a dot — selects/deselects endpoints, or begins
   * a self-loop. Called by DrawInteraction's onTap callback, not by
   * a native browser 'click' event — see drawInteraction.js header
   * comment for why click was abandoned as an event source.
   *
   * @param {number} clickedId
   */
  function handleDotTap(clickedId) {
    const prevFirst  = SelectionState.getFirstSelectedDotId();
    const prevSecond = SelectionState.getSecondSelectedDotId();

    // Lives guard — only for NEW selections, not deselects.
    // Calls engine/rules.js's isExhausted() rather than checking
    // dot.lives inline, so there is exactly one definition of
    // exhaustion in the codebase. This is an interaction shortcut,
    // not a legality check — Engine.apply enforces the real rule.
    const isAlreadySelected = clickedId === prevFirst || clickedId === prevSecond;
    if (!isAlreadySelected) {
      const engineState = Engine.getState();
      if (engineState) {
        const dot = engineState.dots.find(d => d.id === clickedId);
        if (dot && isExhausted(dot)) return;
      }
    }

    const bothWereSelected = prevFirst !== null && prevSecond !== null;

    if (bothWereSelected) {
      if (clickedId === prevFirst) {
        if (prevFirst === prevSecond) {
          SelectionState.clearFirst();
          setStatus('Select first endpoint.');
        } else {
          SelectionState.clearFirst();
          SelectionState.selectFirst(prevSecond);
          setStatus('Select second endpoint.');
        }
      } else if (clickedId === prevSecond) {
        SelectionState.clearSecond();
        setStatus('Select second endpoint.');
      } else {
        return;
      }

    } else if (prevFirst === null) {
      SelectionState.selectFirst(clickedId);
      setStatus('Select second endpoint.');

    } else if (clickedId === prevFirst) {
      // Same dot again → self-loop attempt.
      // Rather than duplicating the "a loop needs 2 lives" threshold
      // inline, construct the candidate move and ask Engine.validate
      // directly — this is the same check Engine.apply will run when
      // the move is actually drawn, so there is exactly one
      // definition of self-loop legality anywhere in the codebase.
      // This is an interaction shortcut (avoids letting the player
      // draw a whole curve before finding out it's illegal), not a
      // second, independent implementation of the rule.
      const engineState = Engine.getState();
      const regionId = getRegionForDot(engineState, clickedId);
      const candidateMove = createMove(clickedId, clickedId, regionId);
      const validation = Engine.validate(candidateMove);

      if (!validation.ok) {
        // Unlike a drawing-geometry rejection (crossing, self-
        // intersection), this is not retryable — the dot's lives
        // won't change if the player taps it again. Clear the
        // selection immediately rather than leaving the dot selected
        // with no way to back out; a second tap would otherwise just
        // re-enter this same branch and repeat the same rejection.
        SelectionState.clearFirst();
        const message = validation.violations
          .map(v => VIOLATION_MESSAGES[v.rule] ?? 'Illegal move.')
          .join(' ');
        setStatus(`${message} Select first endpoint.`);
        Renderer.updateSelection(
          { first: prevFirst, second: prevSecond },
          { first: null, second: null }
        );
        syncDrawMode();
        return;
      }
      SelectionState.selectSecond(clickedId);
      setStatus('Draw a loop from this dot, or tap it again to deselect.');

    } else {
      SelectionState.selectSecond(clickedId);
      setStatus('Draw a curve between the dots, or tap one to deselect it.');
    }

    Renderer.updateSelection(
      { first: prevFirst, second: prevSecond },
      { first: SelectionState.getFirstSelectedDotId(),
        second: SelectionState.getSecondSelectedDotId() }
    );

    syncDrawMode();
  }

  // ── Move commit ────────────────────────────────────────────────

  /**
   * Called by drawInteraction.js when a valid path is accepted.
   * Applies the move to the engine and syncs all visual state.
   *
   * Engine.apply now returns { ok, state } or { ok, violations }
   * instead of a raw state. The ok check happens BEFORE any
   * BoardView/Renderer mutation — a rejected move (e.g. the drawn
   * curve reached the dot, but the engine rejects it for a reason
   * the UI-layer shortcut didn't catch) must leave no partial visual
   * trace, exactly like a drawing-geometry rejection.
   */
  function commitMove(path, a, b) {
    const prevFirst  = a;
    const prevSecond = b;

    const engineStateBefore = Engine.getState();
    const regionId     = getRegionForDot(engineStateBefore, a);
    const moveIndex    = engineStateBefore.moves.length;
    const actingPlayer = playerForMove(moveIndex, engineStateBefore.startingPlayer ?? 0);

    const move = createMove(a, b, regionId);
    const result = Engine.apply(move);

    if (!result.ok) {
      const message = result.violations
        .map(v => VIOLATION_MESSAGES[v.rule] ?? 'Illegal move.')
        .join(' ');
      handleDrawReject(message);
      return;   // nothing else runs — BoardView/Renderer stay untouched
    }

    const engineState = result.state;

    BoardView.setEdgePath(moveIndex, path);

    const newDot    = engineState.dots[engineState.dots.length - 1];
    const sproutPos = pathMidpoint(path);
    BoardView.setDotPosition(newDot.id, sproutPos.x, sproutPos.y);

    Renderer.addDot(newDot, engineState.dots.length - 1, actingPlayer);

    // Clear selection before syncDotStates so exhausted class applies.
    SelectionState.clearSelections();
    Renderer.updateSelection(
      { first: prevFirst, second: prevSecond },
      { first: null, second: null }
    );

    Renderer.syncDotStates(engineState);
    Renderer.renderEdges(engineState);

    updateTurnIndicator(engineState.currentPlayer);
    syncDrawMode();
    setStatus('Select first endpoint.');
    renderMoveList();
  }

  /**
   * Called by drawInteraction.js when a drawn path fails validation.
   */
  function handleDrawReject(message) {
    flashReject();
    setStatus(message);
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
      dots:            SelectionState.getDots().map(({ id, lives }) => ({ id, lives })),
      edges:           [],
      nextDotId:       count,
      moves:           [],
      currentPlayer:   0,
      initialDotCount: count,
      startingPlayer:  0,
      ...buildInitialTopology(count),
    });

    DrawInteraction.reset();
    board.classList.remove('board--drawing', 'board--rejected');

    updateTurnIndicator(0);
    syncDrawMode();
    setStatus('Select first endpoint.');
    renderMoveList();
  }

  // ── Loading an imported game ────────────────────────────────────

  /**
   * Rebuilds the board to display a game reconstructed by
   * engine/gameRecord.js's importGame(). Called by gameRecordUI.js
   * after a successful import.
   *
   * Game Records deliberately do not store drawn curve geometry —
   * only topology is recorded (see design.md "Persistence"). So this
   * function invents PLACEHOLDER geometry for the imported game:
   * initial dots use the same even-row layout as a fresh game via
   * SelectionState.initDots(); each sprout dot is placed at the
   * straight-line midpoint of the two dots its originating move
   * connected, computed in move order so a later sprout can
   * reference an earlier sprout's now-known position.
   *
   * Edges are drawn as straight lines entirely via Renderer.
   * renderEdges()'s existing "no recorded path" fallback —
   * BoardView.getEdgePath() returns null for every imported move,
   * since no path was ever captured for it, and that fallback was
   * already built (defensively, at v0.7) for exactly this case. No
   * new edge-drawing logic was needed here.
   *
   * @param {object} engineState — state returned by a successful importGame()
   */
  function loadImportedGame(engineState) {
    const boardW = parseFloat(boardEl.getAttribute('width'));
    const boardH = parseFloat(boardEl.getAttribute('height'));
    const initialDotCount = engineState.initialDotCount;

    SelectionState.initDots(initialDotCount, boardW, boardH);
    BoardView.reset();
    SelectionState.getDots().forEach(dot => {
      BoardView.setDotPosition(dot.id, dot.x, dot.y);
    });

    Renderer.initBoard(boardEl);

    // Place each sprout at the straight-line midpoint of its move's
    // two endpoints, strictly in move order, so a move referencing
    // an earlier sprout can read that sprout's already-set position.
    engineState.moves.forEach((move, index) => {
      const sprout = engineState.dots[initialDotCount + index];
      if (!sprout) return; // defensive; should not happen for a valid record

      const posA = BoardView.getDotPosition(move.startDotId);
      const posB = BoardView.getDotPosition(move.endDotId);
      const midX = (posA.x + posB.x) / 2;
      const midY = (posA.y + posB.y) / 2;
      BoardView.setDotPosition(sprout.id, midX, midY);

      const player = playerForMove(index, engineState.startingPlayer ?? 0);
      Renderer.addDot(sprout, initialDotCount + index, player);
    });

    Renderer.syncDotStates(engineState);
    Renderer.renderEdges(engineState);

    DrawInteraction.reset();
    boardEl.classList.remove('board--drawing', 'board--rejected');
    SelectionState.clearSelections();
    Renderer.updateSelection(
      { first: null, second: null },
      { first: null, second: null }
    );

    updateTurnIndicator(engineState.currentPlayer);
    syncDrawMode();
    setStatus('Game imported. Select first endpoint.');
    renderMoveList();
  }

  // ── Init ───────────────────────────────────────────────────────

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

    // DrawInteraction owns all pointer interpretation on the board —
    // both taps (dot selection, via onTap) and drags (curve drawing,
    // via onMoveDrawn/onReject). No native 'click' listener is used
    // for game logic — see drawInteraction.js header for why.
    DrawInteraction.init(board, {
      onMoveDrawn: commitMove,
      onReject:    handleDrawReject,
      onTap:       handleDotTap,
    });

    startGame(select, board);
  }

  return { init, loadImportedGame };

})();

export function init() {
  return UI.init();
}

export function loadImportedGame(engineState) {
  return UI.loadImportedGame(engineState);
}
