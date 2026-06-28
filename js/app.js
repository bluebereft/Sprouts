/* ================================================================
   app.js — Sprouts v0.2.3
   
   Responsibility
   ──────────────
   Application entry point. The only job of this file is to start
   the application once the DOM is ready.
   
   app.js does not contain game logic, rendering, or UI wiring.
   All of that lives in the modules it depends on. This file exists
   so there is one unambiguous place to look for "where does it all
   begin?" and so that the startup call is not buried inside a module
   that has other responsibilities.
   
   Load order: last — after models.js, state.js, renderer.js, ui.js.
   ================================================================ */

document.addEventListener('DOMContentLoaded', UI.init);