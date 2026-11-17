// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. Screens: title (with a living attract run
// behind it), play, the level-up choice, paused, game over and victory.
//
// ?seed=N fixes the run's random pattern. ?shot=title|play|levelup|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVT_BIG_EXPLOSION, EVT_BOSS, EVT_DASH, EVT_EXPLOSION, EVT_HURT, EVT_LEVELUP,
  EVT_LOSE, EVT_NOVA, EVT_PICKUP, EVT_SHOOT, EVT_WIN, createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, cardRects } from './render.js';
import { createAudio } from './audio.js';
import { dealCards } from './player.js';
import { autopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const state = world.state;
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer.toField);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best, { world, cards: scene.cards, pointer: { x: -1, y: -1, inside: false } });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let cards = null;
  let accumulator = 0;
  let last = performance.now();
  let lastShotSound = 0;
  state.attract = true;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    state.attract = false;
    cards = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Survive the swarm; break the Hollow Star.');
  }

  function finishRun() {
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    screen = state.won ? SCREEN_WIN : SCREEN_OVER;
    announce(state.won ? `Victory. Score ${state.score}.` : `Game over. Score ${state.score}. Best ${best}.`);
  }

  function playEvents(events) {
    const now = performance.now();
    if (events & EVT_SHOOT && now - lastShotSound > 75) {
      audio.shoot();
      lastShotSound = now;
    }
    if (events & EVT_NOVA) audio.nova();
    if (events & EVT_BIG_EXPLOSION) audio.explosion(true);
    else if (events & EVT_EXPLOSION) audio.explosion(false);
    if (events & EVT_PICKUP) audio.pickup(state.pickupStreak);
    if (events & EVT_DASH) audio.dash();
    if (events & EVT_HURT) audio.hurt();
    if (events & EVT_LEVELUP) audio.levelUp();
    if (events & EVT_BOSS) audio.alarm();
    if (events & EVT_WIN) audio.win();
    if (events & EVT_LOSE) audio.lose();
  }

  function chooseCard(index) {
    if (!cards || !cards[index]) return;
    cards[index].apply(state);
    state.pendingLevels -= 1;
    if (state.pendingLevels > 0) {
      cards = dealCards(state);
      announce(`Level ${state.player.level}. Choose another upgrade.`);
    } else {
      cards = null;
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_LEVELUP) {
      for (let i = 0; i < 3; i += 1) {
        if (actions & input.cardAction(i)) chooseCard(i);
      }
      if (click && cards) {
        const rects = cardRects();
        for (let i = 0; i < 3; i += 1) {
          const rect = rects[i];
          if (click.x >= rect.x && click.x <= rect.x + rect.width && click.y >= rect.y && click.y <= rect.y + rect.height) chooseCard(i);
        }
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (screen === SCREEN_PAUSED && actions & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function stepOnce() {
    if (screen === SCREEN_TITLE) {
      const { move, dash } = autopilot(state);
      playEvents(world.step(STEP, move, dash));
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (state.hitStop > 0) {
      state.hitStop -= STEP;
      return;
    }
    const events = world.step(STEP, input.direction(), input.dashHeld());
    playEvents(events);
    if (state.over) finishRun();
    else if (state.pendingLevels > 0 && screen === SCREEN_PLAY) {
      cards = dealCards(state);
      screen = SCREEN_LEVELUP;
      announce(`Level ${state.player.level}. Choose an upgrade: press 1, 2 or 3, or click a card.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        stepOnce();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, best, { world, cards, pointer: input.pointer });
  }

  // Leaving the tab pauses a running game rather than letting the swarm feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Shardstorm. Click or press Enter to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
