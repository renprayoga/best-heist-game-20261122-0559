// Halcyon Heist — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps (several in a slow frame, none in a
// fast one), and the renderer paints what is there. The game moves between
// six screens: title, play, paused, game over, level complete and victory.
//
// ?seed=N fixes the guard and camera phases. ?shot=start|play|alert|
// complete (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LEVELS, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_ALARM,
  EVENT_CAUGHT,
  EVENT_COMPLETE,
  EVENT_CRACK,
  EVENT_LASER,
  EVENT_PICKUP,
  EVENT_SPOTTED,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_HACK,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  ACTION_SMOKE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_COMPLETE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_VICTORY,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
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
    renderer.draw(world.state, scene.screen, scene.best, world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let levelIndex = 0;
  let crackSoundAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each pickup.
  function announce(message) {
    status.textContent = message;
  }

  function startLevel(index) {
    levelIndex = index;
    world.reset(index);
    accumulator = 0;
    screen = SCREEN_PLAY;
    input.clearPressed();
    announce(`Playing ${world.state.levelName}. Crack the vault, then reach the van.`);
  }

  function endLevel() {
    const state = world.state;
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    if (levelIndex + 1 >= LEVELS.length) {
      screen = SCREEN_VICTORY;
      announce(`You cleared every floor! Final score ${state.score}.`);
    } else {
      screen = SCREEN_COMPLETE;
      announce(`${state.levelName} clear! Score ${state.score}. Press Enter for the next floor.`);
    }
    audio.complete();
  }

  function gameOver() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.caught();
    announce(`Caught! Score ${world.state.score}. Best ${best}.`);
  }

  function onEvents(events) {
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRACK) audio.crackDone();
    if (events & EVENT_SPOTTED) audio.spotted();
    if (events & EVENT_ALARM) audio.startAlarm();
    if (events & EVENT_LASER) audio.spotted();
    if (events & EVENT_CAUGHT) gameOver();
    else if (events & EVENT_COMPLETE) endLevel();
  }

  function frame(now) {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    input.sync();

    if (input.consume(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (input.consume(ACTION_CONFIRM)) {
        audio.unlock();
        audio.click();
        startLevel(levelIndex);
      } else if (input.input.left) {
        levelIndex = (levelIndex + LEVELS.length - 1) % LEVELS.length;
        world.reset(levelIndex);
        input.input.left = false;
      } else if (input.input.right) {
        levelIndex = (levelIndex + 1) % LEVELS.length;
        world.reset(levelIndex);
        input.input.right = false;
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.consume(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (input.consume(ACTION_RESTART)) {
        startLevel(levelIndex);
      } else {
        audio.unlock();
        accumulator += dt;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const crackTarget = world.state.crackTarget;
          const events = world.step(STEP, input.input);
          if (world.state.crackTarget && performance.now() - crackSoundAt > 180) {
            crackSoundAt = performance.now();
            audio.crackTick();
          }
          if (crackTarget && !world.state.crackTarget) {
            // Cracking stopped: silence follows on its own.
          }
          onEvents(events);
          if (world.state.status !== 'playing') break;
        }
        if (world.state.tripped) audio.startAlarm();
        else audio.stopAlarm();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.consume(ACTION_PAUSE)) {
        screen = SCREEN_PLAY;
        last = performance.now();
        announce('Playing.');
      } else if (input.consume(ACTION_RESTART)) {
        startLevel(levelIndex);
      }
    } else if (screen === SCREEN_OVER) {
      if (input.consume(ACTION_CONFIRM) || input.consume(ACTION_RESTART)) {
        audio.click();
        startLevel(levelIndex);
      }
    } else if (screen === SCREEN_COMPLETE) {
      if (input.consume(ACTION_CONFIRM)) {
        audio.click();
        startLevel(levelIndex + 1);
      } else if (input.consume(ACTION_RESTART)) {
        startLevel(levelIndex);
      }
    } else if (screen === SCREEN_VICTORY) {
      if (input.consume(ACTION_CONFIRM) || input.consume(ACTION_RESTART)) {
        audio.click();
        startLevel(0);
      }
    }
    input.clearPressed();
    renderer.draw(world.state, screen, best, world);
    requestAnimationFrame(frame);
  }

  renderer.draw(world.state, screen, best, world);
  requestAnimationFrame(frame);
  // A tiny handle for headless play-tests (key drives, screenshots): it
  // only reads state, never changes the rules.
  window.__heist = { world, screen: () => screen, startLevel };
}

if (shot) runShot(shot);
else runGame();
