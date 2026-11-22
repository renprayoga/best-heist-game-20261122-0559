// Keyboard + mouse for Halcyon Heist. Keys are held state; the one-shot
// actions (smoke, hack, pause, mute, restart, confirm) are edge-triggered
// through `pressed`, which main.js drains once per frame.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_SMOKE = 'smoke';
export const ACTION_HACK = 'hack';

const KEYMAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'crack',
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  KeyQ: ACTION_SMOKE,
  KeyH: ACTION_HACK,
};

export function createInput(canvas) {
  const held = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    crack: false,
  };
  const pressed = new Set();
  /** Click-to-move target in logical (1280x800) coordinates, or null. */
  const input = { ...held, clickTarget: null, pressed };

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 800,
    };
  }

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (!action) return;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    if (action in held) held[action] = true;
    else pressed.add(action);
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action && action in held) held[action] = false;
  }

  function onClick(event) {
    input.clickTarget = toLogical(event);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onClick);

  // Keep `input` in sync with `held` every read: main.js reads these fields.
  const sync = () => {
    input.up = held.up;
    input.down = held.down;
    input.left = held.left;
    input.right = held.right;
    input.sprint = held.sprint;
    input.crack = held.crack;
    input.smoke = pressed.has(ACTION_SMOKE);
    input.hack = pressed.has(ACTION_HACK);
  };

  return {
    input,
    sync,
    consume(action) {
      const had = pressed.has(action);
      if (had) pressed.delete(action);
      return had;
    },
    clearPressed() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onClick);
    },
  };
}
