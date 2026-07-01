/* ================================================================
   app.js — Sprouts v0.7 (Module Entry Point)

   Responsibility
   ──────────────
   This is the single entry point for the application.
   It loads the UI module and starts the game after DOM ready.
   ================================================================ */

import { init as initUI } from './ui.js';

/**
 * Initializes the entire application.
 */
function init() {
  initUI();
  console.log('Sprouts initialized');
}

document.addEventListener('DOMContentLoaded', init);