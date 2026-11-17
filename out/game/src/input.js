// Keyboard and mouse, read as game-shaped facts: a movement vector, a pointer in field
// coordinates, and one-shot actions (confirm, dash, pause, mute, card picks) the screens consume.

export const ACTION_CONFIRM = 1;
export const ACTION_DASH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CARD_1 = 16;
export const ACTION_CARD_2 = 32;
export const ACTION_CARD_3 = 64;

const CARD_ACTIONS = [ACTION_CARD_1, ACTION_CARD_2, ACTION_CARD_3];

export function createInput(canvas, toField) {
  const keys = new Set();
  const pointer = { x: 0, y: 0, down: false, inside: false };
  let actions = 0;
  let clickedAt = null;

  function press(code) {
    if (code === 'Enter' || code === 'Space') actions |= ACTION_CONFIRM;
    if (code === 'ShiftLeft' || code === 'ShiftRight') actions |= ACTION_DASH;
    if (code === 'KeyP' || code === 'Escape') actions |= ACTION_PAUSE;
    if (code === 'KeyM') actions |= ACTION_MUTE;
    if (code === 'Digit1') actions |= ACTION_CARD_1;
    if (code === 'Digit2') actions |= ACTION_CARD_2;
    if (code === 'Digit3') actions |= ACTION_CARD_3;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    press(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  function updatePointer(event) {
    const point = toField(event.clientX, event.clientY);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.inside = true;
  }

  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    pointer.down = true;
    clickedAt = { x: pointer.x, y: pointer.y };
    actions |= ACTION_CONFIRM;
    canvas.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    pointer.down = false;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });

  return {
    pointer,
    /** The held movement direction as a unit vector (keyboard first, pointer steering second). */
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x === 0 && y === 0 && pointer.down) {
        return { x: pointer.x, y: pointer.y, towardPointer: true };
      }
      const length = Math.hypot(x, y);
      if (length === 0) return { x: 0, y: 0, towardPointer: false };
      return { x: x / length, y: y / length, towardPointer: false };
    },
    dashHeld() {
      return keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    /** The actions pressed since the last call; reading them spends them. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The field point of the latest click, or null; reading it spends it. */
    takeClick() {
      const click = clickedAt;
      clickedAt = null;
      return click;
    },
    cardAction(index) {
      return CARD_ACTIONS[index];
    },
  };
}
