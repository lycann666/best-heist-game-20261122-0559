// The screenshot scenes behind ?shot=start|play|alarm|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (head for the nearest loot along a grid path, wait out of a vision cone when the next step
// is watched, run for the entrance when chased), so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { findPath } from './pathfind.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 30;
const ALARM_LOOT_SECONDS = 14;
const ALARM_EXPOSE_SECONDS = 8;
const ALARM_FLEE_SECONDS = 2.5;
const END_LIMIT_SECONDS = 600;
const TWO_PI = Math.PI * 2;

function angleDifference(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** The watcher (guard or camera) whose cone holds the point, or null. Range and angle only. */
function watcherSeeing(state, x, y) {
  for (const guard of state.guards) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 235) continue;
    if (Math.abs(angleDifference(Math.atan2(dy, dx), guard.angle)) <= 0.62) return guard;
  }
  for (const camera of state.cameras) {
    const dx = x - camera.x;
    const dy = y - camera.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 265) continue;
    if (Math.abs(angleDifference(Math.atan2(dy, dx), camera.angle)) <= 0.42) return camera;
  }
  return null;
}

function nearestLoot(state) {
  let best = null;
  let bestDist = Infinity;
  for (const item of state.loot) {
    if (item.taken) continue;
    const dx = item.x - state.player.x;
    const dy = item.y - state.player.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }
  return best;
}

function distance(ax, ay, bx, by) {
  return Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
}

/** Per-scene steering memory: the current grid path, what it leads to, and cone waits. */
function createSteering() {
  return { path: [], pathTarget: null, replanIn: 0, waitSteps: 0 };
}

/** The nearest guard to a point, and its distance. */
function nearestGuard(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const guard of state.guards) {
    const dist = distance(x, y, guard.x, guard.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = guard;
    }
  }
  return { guard: best, dist: bestDist };
}

function awayFrom(player, watcher) {
  const dx = player.x - watcher.x;
  const dy = player.y - watcher.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / dist, y: dy / dist };
}

/**
 * Steer toward `target` along a grid path (replanned when the target moves or the path runs
 * out). Careful mode waits when the next step is watched or a guard is standing on it, backs
 * away when a guard closes in, and flees when already seen; reckless mode walks straight at
 * the target, as a hurried player does. When chased, the target is open floor away from the
 * nearest hunting guard.
 */
function steer(state, world, memory, target, careful) {
  const player = state.player;
  const chased = state.guards.some((guard) => guard.chasing) || state.lockdown > 0;
  let goal = target;
  if (chased) {
    const chaser = state.guards.find((guard) => guard.chasing) ?? state.guards[0];
    const away = awayFrom(player, chaser);
    goal = {
      x: Math.max(40, Math.min(FIELD.width - 40, player.x + away.x * 320)),
      y: Math.max(40, Math.min(FIELD.height - 40, player.y + away.y * 320)),
    };
  }
  memory.replanIn -= 1;
  const goalMoved = memory.pathTarget === null || distance(goal.x, goal.y, memory.pathTarget.x, memory.pathTarget.y) > 50;
  if (goalMoved || memory.replanIn <= 0 || memory.path.length === 0) {
    const path = findPath(state.solids, player, goal);
    memory.path = path === null ? [] : path;
    memory.pathTarget = { x: goal.x, y: goal.y };
    memory.replanIn = 45;
  }
  while (memory.path.length > 0 && distance(player.x, player.y, memory.path[0].x, memory.path[0].y) < 26) {
    memory.path.shift();
  }
  const waypoint = memory.path.length > 0 ? memory.path[0] : goal;
  const dx = waypoint.x - player.x;
  const dy = waypoint.y - player.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const toward = { x: dx / dist, y: dy / dist };
  if (!careful) return toward;
  if (chased) return toward;

  const watcher = watcherSeeing(state, player.x, player.y);
  if (watcher) return awayFrom(player, watcher);
  const near = nearestGuard(state, player.x, player.y);
  if (near.guard !== null && near.dist < 70) return awayFrom(player, near.guard);
  const waypointWatched = watcherSeeing(state, waypoint.x, waypoint.y) !== null;
  const waypointGuard = nearestGuard(state, waypoint.x, waypoint.y);
  if (waypointWatched || (waypointGuard.guard !== null && waypointGuard.dist < 70)) {
    // The next step is watched or a guard is standing on it: wait for the patrol to pass.
    memory.waitSteps += 1;
    if (memory.waitSteps > 300) {
      // Waited long enough: back away to make room, then try again.
      memory.waitSteps = 0;
      return awayFrom(player, waypointGuard.guard ?? { x: waypoint.x, y: waypoint.y });
    }
    return { x: 0, y: 0 };
  }
  memory.waitSteps = 0;
  return toward;
}

function lootTarget(state, world) {
  const loot = nearestLoot(state);
  if (loot) return { x: loot.x, y: loot.y };
  const exit = world.exit();
  return { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 };
}

/**
 * Set `world` to the named scene (start, play, alarm or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const memory = createSteering();
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      world.step(STEP, steer(state, world, memory, lootTarget(state, world), true), false);
      if (state.over || state.won) break;
    }
    return { screen: state.over ? SCREEN_OVER : state.won ? SCREEN_WIN : SCREEN_PLAY, best: state.score };
  }
  if (name === 'alarm') {
    // First steal something, then walk into the first camera's sweep until the alarm is
    // screaming and the guards give chase, then run for it.
    for (let index = 0; index < ALARM_LOOT_SECONDS / STEP; index += 1) {
      world.step(STEP, steer(state, world, memory, lootTarget(state, world), true), false);
      if (state.over || state.won) break;
    }
    const camera = state.cameras[0];
    // Shadow the first camera's sweep: the bait tracks the cone itself (offset sideways
    // so it is never behind a wall edge), so the thief stands in the spotlight and the
    // alarm climbs for the whole exposure.
    const baitMemory = createSteering();
    for (let index = 0; index < ALARM_EXPOSE_SECONDS / STEP; index += 1) {
      const bait = {
        x: camera.x + Math.cos(camera.angle) * 170 - 40,
        y: camera.y + Math.sin(camera.angle) * 170,
      };
      world.step(STEP, steer(state, world, baitMemory, bait, false), false);
      if (state.over) break;
    }
    for (let index = 0; index < ALARM_FLEE_SECONDS / STEP; index += 1) {
      world.step(STEP, steer(state, world, memory, lootTarget(state, world), true), false);
      if (state.over || state.won) break;
    }
    return { screen: state.over ? SCREEN_OVER : state.won ? SCREEN_WIN : SCREEN_PLAY, best: state.score };
  }
  if (name === 'end') {
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, steer(state, world, memory, lootTarget(state, world), false), false);
      if (events & EVENT_WIN) break;
      if (events & EVENT_OVER) break;
    }
    const over = state.over;
    return { screen: over ? SCREEN_OVER : state.won ? SCREEN_WIN : SCREEN_PLAY, best: state.score };
  }
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, { x: 0, y: 0 }, false, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
