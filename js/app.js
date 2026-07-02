/* ================================================================
   app.js — Sprouts v0.8.5 (Module Entry Point)

   Responsibility
   ──────────────
   This is the single entry point for the application.
   It loads the UI and Game Record UI modules and starts the game
   after DOM ready.
   ================================================================ */

import { init as initUI } from './ui.js';
import { init as initGameRecordUI } from './gameRecordUI.js';

/**
 * Initializes the entire application.
 */
function init() {
  initUI();
  initGameRecordUI();
  console.log('Sprouts initialized');
}

document.addEventListener('DOMContentLoaded', init);