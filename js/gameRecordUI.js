/* ================================================================
   gameRecordUI.js — Sprouts v0.8.6

   Responsibility
   ──────────────
   Browser-facing wiring for exporting/importing Game Records.
   Thin DOM layer only: reads/writes two textareas and two buttons.
   All actual logic is delegated elsewhere:
     • engine/gameRecord.js — pure export/import/replay
     • ui.js's loadImportedGame() — rebuilding the visible board

   Kept as a separate module rather than folded into ui.js, following
   the same reasoning that split drawInteraction.js out of ui.js at
   v0.7.1 — ui.js stays focused on orchestrating the active game;
   this file owns one small, separable concern and nothing else.

   v0.8.6 — this file now owns the live-Engine-mutation step
   ────────────────────────────────────────────────────────────
   engine/gameRecord.js's importGame() no longer touches the Engine
   singleton at all — it returns a plain replayed state object and
   nothing more. This file is the one place that decides whether a
   successfully-imported record actually becomes the live game: only
   after seeing result.ok === true does it call Engine.init(result.state)
   itself. A failed import was never applied to Engine in the first
   place, so there's nothing to undo.

   Depends on: engine/engine.js, engine/gameRecord.js, ui.js
   ================================================================ */

import Engine from './engine/engine.js';
import { exportGameToJSON, importGameFromJSON, ImportError } from './engine/gameRecord.js';
import { loadImportedGame } from './ui.js';

/**
 * Translates a coded import failure into player-facing text.
 * Deliberately local to this file, mirroring how ui.js's
 * VIOLATION_MESSAGES keeps engine-emitted codes out of the engine
 * itself — engine/gameRecord.js never produces English strings.
 *
 * @param {{ error: string, message?: string, moveIndex?: number }} result
 * @returns {string}
 */
function describeImportError(result) {
  switch (result.error) {
    case ImportError.INVALID_FORMAT_VERSION:
      return 'This record was saved with an unsupported format version.';
    case ImportError.INVALID_RECORD_SHAPE:
      return `Not a valid game record${result.message ? `: ${result.message}` : '.'}`;
    case ImportError.ILLEGAL_MOVE:
      return `Move ${result.moveIndex + 1} in this record is illegal — import stopped.`;
    default:
      return 'Could not import this game record.';
  }
}

/**
 * Wires up the export/import controls. Called once by app.js.
 */
export function init() {
  const exportBtn    = document.getElementById('export-btn');
  const exportArea   = document.getElementById('export-output');
  const importBtn    = document.getElementById('import-btn');
  const importArea   = document.getElementById('import-input');
  const importStatus = document.getElementById('import-status');

  if (!exportBtn || !exportArea || !importBtn || !importArea || !importStatus) {
    console.error('Sprouts: game record UI elements are missing.');
    return;
  }

  exportBtn.addEventListener('click', () => {
    const state = Engine.getState();
    exportArea.value = state ? exportGameToJSON(state) : '';
  });

  importBtn.addEventListener('click', () => {
    const result = importGameFromJSON(importArea.value);

    if (!result.ok) {
      importStatus.textContent = describeImportError(result);
      return;
    }

    // importGame() never touches Engine itself (v0.8.6) — this is
    // the explicit, caller-owned step that makes the successfully
    // replayed record the live game.
    importStatus.textContent = '';
    Engine.init(result.state);
    loadImportedGame(result.state);
  });
}
