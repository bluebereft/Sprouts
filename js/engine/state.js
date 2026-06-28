/* ================================================================
   state.js — Sprouts v0.4 (CLEAN UI STATE)

   Responsibility
   ──────────────
   ONLY stores UI interaction state:
   - dots (initial layout snapshot)
   - selection state (first / second dot)
   ================================================================ */

import { createDot } from '../models.js';

const State = (() => {

  // ── UI data ───────────────────────────────────────────────
  let dots = [];

  let firstSelectedDotId  = null;
  let secondSelectedDotId = null;

  // ── INIT ───────────────────────────────────────────────────
  function initDots(count, boardW, boardH) {
    dots = [];

    firstSelectedDotId = null;
    secondSelectedDotId = null;

    const midY    = boardH / 2;
    const margin   = boardW * 0.12;
    const usableW  = boardW - margin * 2;
    const step     = count > 1 ? usableW / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      dots.push(createDot(i, margin + i * step, midY));
    }
  }

  // ── DOTS ───────────────────────────────────────────────────
  function getDots() {
    return [...dots];
  }

  // ── SELECTION STATE ────────────────────────────────────────
  function getFirstSelectedDotId() {
    return firstSelectedDotId;
  }

  function getSecondSelectedDotId() {
    return secondSelectedDotId;
  }

  function selectFirst(id) {
    firstSelectedDotId = id;
    secondSelectedDotId = null;
  }

  function selectSecond(id) {
    secondSelectedDotId = id;
  }

  function clearFirst() {
    firstSelectedDotId = null;
    secondSelectedDotId = null;
  }

  function clearSecond() {
    secondSelectedDotId = null;
  }

  function promoteSecondToFirst() {
    firstSelectedDotId = secondSelectedDotId;
    secondSelectedDotId = null;
  }

  function clearSelections() {
    firstSelectedDotId = null;
    secondSelectedDotId = null;
  }

  // ── PUBLIC API ─────────────────────────────────────────────
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
    clearSelections
  };

})();

export default State;