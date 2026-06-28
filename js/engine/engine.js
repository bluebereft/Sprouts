import { applyMove } from './reducer.js';

let engineState = null;

function init(initialState) {
  engineState = {
    ...initialState,
    moves: initialState.moves || []
  };
}

function apply(move) {
  engineState = applyMove(engineState, move);
  return engineState;
}

function getState() {
  return engineState;
}

export default {
  init,
  apply,
  getState
};