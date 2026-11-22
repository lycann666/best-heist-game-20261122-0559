// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, game over and win. Clicking the floor sets a
// move target; WASD or the arrow keys steer directly; holding Shift sneaks.
//
// ?seed=N fixes the level's random details. ?shot=start|play|alarm|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_CAUGHT, EVENT_LEVEL, EVENT_LOCKDOWN, EVENT_LOOT, EVENT_OVER, EVENT_SPOTTED, EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import { findPath } from './pathfind.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long the level banner shows at the start of each heist. */
const BANNER_SECONDS = 3;

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
    renderer.draw(world.state, scene.screen, scene.best, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => renderer.toField(clientX, clientY));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let banner = null;
  let bannerTimer = 0;
  let clickPath = [];
  let clickGoal = null;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function showBanner() {
    banner = { title: world.state.levelName, sub: world.state.levelIntro };
    bannerTimer = BANNER_SECONDS;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    showBanner();
    announce(`Playing. ${world.state.levelName}.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Clean getaway. Final score ${world.state.score}. Best ${best}.`
      : `Busted. Score ${world.state.score}. Best ${best}.`);
  }

  function clickIsOnPanel() {
    // The title / over / win panels cover the middle of the screen: any click there confirms.
    return screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN;
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (click !== null) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      audio.click();
      startGame();
      return;
    }
    if (click !== null && clickIsOnPanel()) {
      audio.unlock();
      audio.click();
      startGame();
      return;
    }
    if (click !== null && screen === SCREEN_PLAY) {
      // A click on the floor walks the thief there, around the walls.
      const path = findPath(world.state.solids, world.state.player, click);
      clickPath = path === null ? [] : path;
      clickGoal = click;
      input.clearMoveTarget();
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (click !== null && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen's backdrop: guards patrol, nothing scores.
      world.step(STEP, { x: 0, y: 0 }, false, true);
      return;
    }
    const keys = input.keyDirection();
    let move = keys;
    if (keys.x !== 0 || keys.y !== 0) {
      clickPath = [];
      clickGoal = null;
    } else if (clickPath.length > 0) {
      const waypoint = clickPath[0];
      const dx = waypoint.x - world.state.player.x;
      const dy = waypoint.y - world.state.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) clickPath.shift();
      else move = { x: dx / dist, y: dy / dist };
    } else if (clickGoal !== null) {
      const dx = clickGoal.x - world.state.player.x;
      const dy = clickGoal.y - world.state.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 10) clickGoal = null;
      else move = { x: dx / dist, y: dy / dist };
    }
    const events = world.step(STEP, move, input.sneakHeld());
    if (events & EVENT_LOOT) {
      audio.pickup(world.state.lootValue);
      announce(`Loot taken. ${world.state.lootTaken} of ${world.state.lootTotal}.`);
    }
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('A guard spotted you!');
    }
    if (events & EVENT_LOCKDOWN) {
      audio.spotted();
      announce('Lockdown! Every guard is hunting you.');
    }
    if (events & EVENT_CAUGHT) {
      audio.caught();
      announce(world.state.lives > 0 ? `Caught! ${world.state.lives} ${world.state.lives === 1 ? 'life' : 'lives'} left.` : 'Busted.');
    }
    if (events & EVENT_LEVEL) {
      audio.levelClear();
      showBanner();
      announce(`Heist clear. ${world.state.levelName}.`);
    }
    if (events & EVENT_WIN) {
      audio.win();
      endGame(true);
    } else if (events & EVENT_OVER) {
      endGame(false);
    }
    audio.alarmPulse(STEP, world.state.alarm);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (bannerTimer > 0) {
      bannerTimer -= 1 / 60;
      if (bannerTimer <= 0) banner = null;
    }
    renderer.draw(world.state, screen, best, screen === SCREEN_PLAY ? banner : null);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('The Meridian Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
