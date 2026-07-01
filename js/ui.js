/* ================================================================
   ui.js — Sprouts v0.7.1

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

   UI is the only module that reads HTML elements directly.
   All human-readable strings live here.

   Depends on: selectionState.js, boardView.js, renderer.js,
               drawInteraction.js, engine/, constants.js
   ================================================================ */

import { createMove } from './engine/move.js';
import { playerForMove } from './engine/rules.js';
import { getRegionForDot } from './engine/regions.js';
import Engine from './engine/engine.js';
import SelectionState from './selectionState.js';
import BoardView from './boardView.js';
import Renderer, { pathMidpoint } from './renderer.js';
import * as DrawInteraction from './drawInteraction.js';

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
    // <= 0 rather than === 0: see renderer.js syncDotStates for why
    // lives can currently go negative (no engine legality yet, v0.8).
    const isAlreadySelected = clickedId === prevFirst || clickedId === prevSecond;
    if (!isAlreadySelected) {
      const engineState = Engine.getState();
      if (engineState) {
        const dot = engineState.dots.find(d => d.id === clickedId);
        if (dot && dot.lives <= 0) return;
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
      // A loop consumes 2 lives (both ends of the curve land on the
      // same dot), unlike a normal connection which consumes 1. The
      // dot must have at least 2 lives for this to be a legal loop —
      // checked here in the UI as a courtesy; the engine will enforce
      // this properly at v0.8. Without this check, a dot with only 1
      // life could be selected for a loop, the engine would apply it
      // anyway (no legality checking yet), and lives would go negative.
      const engineState = Engine.getState();
      const dot = engineState?.dots.find(d => d.id === clickedId);
      if (dot && dot.lives < 2) {
        // Unlike a drawing-geometry rejection (crossing, self-
        // intersection), this is not retryable — the dot's lives
        // won't change if the player taps it again. Clear the
        // selection immediately rather than leaving the dot selected
        // with no way to back out; a second tap would otherwise just
        // re-enter this same branch and repeat the same rejection.
        SelectionState.clearFirst();
        setStatus('Not enough lives for a loop. Select first endpoint.');
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
   */
  function commitMove(path, a, b) {
    const prevFirst  = a;
    const prevSecond = b;

    const engineStateBefore = Engine.getState();
    const regionId     = getRegionForDot(engineStateBefore, a);
    const moveIndex    = engineStateBefore.moves.length;
    const actingPlayer = playerForMove(moveIndex);

    const move = createMove(a, b, regionId);
    const engineState = Engine.apply(move);

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
      dots:          SelectionState.getDots().map(({ id, lives }) => ({ id, lives })),
      edges:         [],
      nextDotId:     count,
      moves:         [],
      currentPlayer: 0,
    });

    DrawInteraction.reset();
    board.classList.remove('board--drawing', 'board--rejected');

    updateTurnIndicator(0);
    syncDrawMode();
    setStatus('Select first endpoint.');
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

  return { init };

})();

export function init() {
  return UI.init();
}
