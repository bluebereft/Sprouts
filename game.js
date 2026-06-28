/* ================================================================
   game.js — Sprouts v0.1
   
   Architecture
   ─────────────
   This file is divided into three clearly labelled sections:
   
     STATE    — the single source of truth for game data.
               Future: add connections, move history, whose turn it is.
   
     RENDERER — pure drawing functions that read STATE and write SVG.
               Future: draw curves, highlight active dots, animate moves.
   
     UI       — wires up HTML controls and calls into STATE / RENDERER.
               Future: handle canvas clicks, show scores, undo button.
   
   Nothing in RENDERER touches the DOM outside the SVG board.
   Nothing in STATE knows about SVG or HTML.
   UI is the only layer that reads HTML elements directly.
   ================================================================ */


/* ================================================================
   STATE
   ─────
   Holds the current game data.
   In v0.1 this is just an array of dot objects.
   
   Each dot: { id: number, x: number, y: number, lives: number }
   
   "lives" = remaining available connections (always 3 for a fresh dot
   in standard Sprouts). Stored now so the engine can use it later.
   ================================================================ */

const State = (() => {

  // The list of dots currently on the board.
  let dots = [];

  /**
   * Replaces the dot list with a fresh set of evenly spaced dots.
   * 
   * @param {number} count  — how many dots to create (2–6)
   * @param {number} boardW — SVG board width  in px
   * @param {number} boardH — SVG board height in px
   */
  function initDots(count, boardW, boardH) {
    dots = [];

    // We place all dots in a horizontal row through the vertical midpoint.
    const midY    = boardH / 2;

    // Leave a margin on each side so dots don't hug the edge.
    const margin  = boardW * 0.12;
    const usableW = boardW - margin * 2;

    // Spacing between dots. When count === 1 there's no gap, but the
    // dropdown starts at 2 so this edge case won't appear in practice.
    const step = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push({
        id:    i,                          // unique identifier
        x:     margin + i * step,         // horizontal position
        y:     midY,                       // vertical centre of board
        lives: 3,                          // standard Sprouts rule
      });
    }
  }

  /** Returns a shallow copy of the dots array (safe to iterate). */
  function getDots() {
    return [...dots];
  }

  // Expose public interface only — internals stay private.
  return { initDots, getDots };

})();


/* ================================================================
   RENDERER
   ────────
   Reads from State and draws into the SVG board element.
   Never reads from HTML controls.
   All SVG elements are created with createElementNS to keep them
   valid SVG (plain createElement won't work for SVG namespaces).
   ================================================================ */

const Renderer = (() => {

  // The SVG namespace required for createElementNS.
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Dot radius in SVG user units (pixels at 1:1 scale).
  const DOT_RADIUS = 8;

  /**
   * Removes all child elements from the board SVG.
   * Call this before drawing a new game state.
   * 
   * @param {SVGElement} board — the <svg> board element
   */
  function clearBoard(board) {
    // Remove children one at a time to avoid issues with live NodeLists.
    while (board.firstChild) {
      board.removeChild(board.firstChild);
    }
  }

  /**
   * Draws one dot as an SVG <circle>.
   * 
   * The CSS class "dot" applies fill, stroke, and the appear animation.
   * The CSS custom property --dot-index staggers each dot's animation.
   * 
   * @param {SVGElement} board — the <svg> board element
   * @param {object}     dot   — a dot object from State.getDots()
   * @param {number}     index — position in the dots array (for stagger)
   */
  function drawDot(board, dot, index) {
    const circle = document.createElementNS(SVG_NS, 'circle');

    circle.setAttribute('cx', dot.x);
    circle.setAttribute('cy', dot.y);
    circle.setAttribute('r',  DOT_RADIUS);
    circle.setAttribute('class', 'dot');

    // Pass the index to CSS so each dot's animation is slightly delayed.
    circle.style.setProperty('--dot-index', index);

    // Store the dot id on the element for future click handling.
    circle.dataset.dotId = dot.id;

    board.appendChild(circle);
  }

  /**
   * Draws all dots from State onto the board.
   * Clears the board first, then renders each dot.
   * 
   * @param {SVGElement} board — the <svg> board element
   */
  function render(board) {
    clearBoard(board);

    const dots = State.getDots();

    dots.forEach((dot, index) => {
      drawDot(board, dot, index);
    });
  }

  return { render };

})();


/* ================================================================
   UI
   ──
   Binds HTML controls to State + Renderer.
   This is the entry point that runs once the page has loaded.
   ================================================================ */

const UI = (() => {

  /**
   * Reads the current dropdown value and starts a new game:
   * 1. Updates State with fresh dots.
   * 2. Tells Renderer to redraw.
   * 
   * @param {HTMLSelectElement} select — the dot-count dropdown
   * @param {SVGElement}        board  — the <svg> board element
   */
  function startGame(select, board) {
    const count  = parseInt(select.value, 10);

    // Read the board's actual rendered dimensions from its attributes.
    // We use the attribute values (not clientWidth) so the logic works
    // even before the element is painted, and stays consistent with the
    // SVG coordinate system set by viewBox.
    const boardW = parseFloat(board.getAttribute('width'));
    const boardH = parseFloat(board.getAttribute('height'));

    // 1. Update state.
    State.initDots(count, boardW, boardH);

    // 2. Redraw board.
    Renderer.render(board);
  }

  /**
   * Runs once the DOM is ready.
   * Grabs element references and attaches event listeners.
   */
  function init() {
    const startBtn = document.getElementById('start-btn');
    const select   = document.getElementById('dot-count');
    const board    = document.getElementById('board');

    // Guard: bail early if any expected element is missing.
    if (!startBtn || !select || !board) {
      console.error('Sprouts: could not find required DOM elements.');
      return;
    }

    // Wire up the Start Game button.
    startBtn.addEventListener('click', () => {
      startGame(select, board);
    });

    // Optional: start a default game immediately so the board isn't empty.
    // Comment this line out if you prefer a blank board on first load.
    startGame(select, board);
  }

  return { init };

})();


/* ================================================================
   Bootstrap
   ─────────
   Wait for the DOM to be fully parsed before running UI.init().
   game.js is loaded at the bottom of <body>, so the DOM is already
   ready by the time this script executes — but using DOMContentLoaded
   makes it safe to move the <script> tag to the <head> in the future.
   ================================================================ */

document.addEventListener('DOMContentLoaded', UI.init);