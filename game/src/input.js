// Keyboard and pointer input. Held keys give a steering direction; one-shot presses (start,
// pause, sneak is held) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. A mouse click on the floor sets a move
// target the thief walks to; clicking a button is reported to the caller instead.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SNEAK = 4;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let sneak = false;
  let actions = 0;
  let clickTarget = null;
  let clickPoint = null;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (SNEAK.has(event.code)) sneak = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    sneak = false;
  });

  target.addEventListener('pointerdown', (event) => {
    const field = toField(event.clientX, event.clientY);
    clickPoint = field;
    clickTarget = field;
  });

  return {
    /** The steering direction from held keys: {x, y} with each component -1, 0 or 1. */
    keyDirection() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    sneakHeld() {
      return sneak;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click point in field coordinates (or null), cleared after reading. */
    takeClick() {
      const point = clickPoint;
      clickPoint = null;
      return point;
    },
    /** The current click-to-move target in field coordinates, or null. */
    moveTarget() {
      return clickTarget;
    },
    clearMoveTarget() {
      clickTarget = null;
    },
  };
}
