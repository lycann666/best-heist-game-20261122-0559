// The game's rules and state, with no drawing and no browser in it: the thief, the patrolling
// guards and their vision cones, the sweeping cameras, the loot, the alarm meter and the
// three heists. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound. Nothing here allocates
// after createWorld returns, except the short-lived particle and floater lists.
import { ALARM, CAMERA, FIELD, GUARD, LEVELS, LEVEL_TIME_BONUS, LIVES, LOOT, PLAYER } from './config.js';

export const EVENT_LOOT = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_LOCKDOWN = 64;
export const EVENT_ALARM = 128;

const TWO_PI = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when the segment a->b crosses the rectangle r (walls and cases block sight). */
function segmentHitsRect(ax, ay, bx, by, r) {
  const dx = bx - ax;
  const dy = by - ay;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (ax < r.x || ax > r.x + r.w) return false;
  } else {
    let t1 = (r.x - ax) / dx;
    let t2 = (r.x + r.w - ax) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (ay < r.y || ay > r.y + r.h) return false;
  } else {
    let t1 = (r.y - ay) / dy;
    let t2 = (r.y + r.h - ay) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

function angleDifference(a, b) {
  let d = (a - b) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/** A circle (the thief or a guard) pushed out of every solid rectangle it overlaps. */
function resolveCircleSolids(circle, solids) {
  for (let index = 0; index < solids.length; index += 1) {
    const r = solids[index];
    const nearestX = clamp(circle.x, r.x, r.x + r.w);
    const nearestY = clamp(circle.y, r.y, r.y + r.h);
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= circle.radius * circle.radius) continue;
    if (distSq === 0) {
      // Centre inside the rectangle: push out along the shallowest side.
      const left = circle.x - r.x;
      const right = r.x + r.w - circle.x;
      const top = circle.y - r.y;
      const bottom = r.y + r.h - circle.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) circle.x = r.x - circle.radius;
      else if (min === right) circle.x = r.x + r.w + circle.radius;
      else if (min === top) circle.y = r.y - circle.radius;
      else circle.y = r.y + r.h + circle.radius;
    } else {
      const dist = Math.sqrt(distSq);
      circle.x = nearestX + (dx / dist) * circle.radius;
      circle.y = nearestY + (dy / dist) * circle.radius;
    }
  }
  circle.x = clamp(circle.x, circle.radius, FIELD.width - circle.radius);
  circle.y = clamp(circle.y, circle.radius, FIELD.height - circle.radius);
}

export function createWorld(random) {
  const player = {
    x: 0, y: 0, radius: PLAYER.radius, angle: -Math.PI / 2,
    sneaking: false, moving: false, caughtFlash: 0,
  };
  const guards = [];
  const cameras = [];
  const loot = [];
  const particles = [];
  const floaters = [];
  const state = {
    player, guards, cameras, loot, particles, floaters,
    levelIndex: 0, levelName: '', levelIntro: '',
    score: 0, lives: LIVES, alarm: 0, lockdown: 0,
    lootTaken: 0, lootTotal: 0, lootValue: 0, levelLootValue: 0,
    elapsed: 0, levelTime: 0, exitOpen: false, won: false, over: false,
    spotted: false, seenByCamera: false, solids: [], exit: null, walls: [], cases: [],
  };

  let solids = [];
  let exit = { x: 0, y: 0, w: 0, h: 0 };
  let start = { x: 0, y: 0 };

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.levelName = level.name;
    state.levelIntro = level.intro;
    state.levelTime = 0;
    state.exitOpen = false;
    start = level.start;
    exit = level.exit;
    state.exit = exit;
    player.x = start.x;
    player.y = start.y;
    player.angle = -Math.PI / 2;
    player.sneaking = false;
    player.caughtFlash = 0;

    solids = [];
    for (const wall of level.walls) solids.push(wall);
    for (const c of level.cases) solids.push(c);
    state.solids = solids;
    state.walls = level.walls;
    state.cases = level.cases;

    guards.length = 0;
    for (const g of level.guards) {
      guards.push({
        x: g.waypoints[0].x, y: g.waypoints[0].y, radius: GUARD.radius,
        waypoints: g.waypoints, waypoint: 1, pause: 0,
        speed: g.speed, angle: 0, suspicion: 0, chasing: false,
        chaseTimer: 0, state: 'patrol',
      });
    }
    cameras.length = 0;
    for (const c of level.cameras) {
      cameras.push({
        x: c.x, y: c.y, baseAngle: c.baseAngle, sweep: c.sweep,
        speed: c.speed, phase: random() * TWO_PI, angle: c.baseAngle,
      });
    }
    loot.length = 0;
    for (const item of level.loot) {
      loot.push({ x: item.x, y: item.y, kind: item.kind, name: item.name, value: item.value, taken: false, glint: random() * TWO_PI });
    }
    state.lootTotal = loot.length;
    state.lootTaken = 0;
    state.levelLootValue = 0;
    state.alarm = 0;
    state.lockdown = 0;
    state.spotted = false;
    state.seenByCamera = false;
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.elapsed = 0;
    state.won = false;
    state.over = false;
    state.lootValue = 0;
    particles.length = 0;
    floaters.length = 0;
    loadLevel(0);
  }

  function hasLineOfSight(ax, ay, bx, by) {
    for (let index = 0; index < solids.length; index += 1) {
      if (segmentHitsRect(ax, ay, bx, by, solids[index])) return false;
    }
    return true;
  }

  /** Is the thief inside this watcher's cone (range, angle, line of sight)? */
  function seesThief(x, y, angle, range, halfAngle) {
    const dx = player.x - x;
    const dy = player.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > range) return 0;
    const target = Math.atan2(dy, dx);
    if (Math.abs(angleDifference(target, angle)) > halfAngle) return 0;
    if (!hasLineOfSight(x, y, player.x, player.y)) return 0;
    // Closer and standing still in the open is easier to spot; sneaking hides.
    const closeness = 1 - (dist / range) * 0.55;
    return closeness * (player.sneaking ? PLAYER.sneakStealth : 1);
  }

  function burst(x, y, colour, count) {
    for (let index = 0; index < count; index += 1) {
      if (particles.length > 120) return;
      const angle = random() * TWO_PI;
      const speed = 40 + random() * 130;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.5 + random() * 0.4, age: 0, colour, size: 2 + random() * 3,
      });
    }
  }

  function addFloater(x, y, text, colour) {
    if (floaters.length > 12) floaters.shift();
    floaters.push({ x, y, text, colour, age: 0, life: 1.4 });
  }

  function respawnAfterCaught() {
    player.x = start.x;
    player.y = start.y;
    player.angle = -Math.PI / 2;
    player.caughtFlash = 1.2;
    state.alarm = Math.min(state.alarm, 55);
    state.lockdown = 0;
    for (const guard of guards) {
      guard.x = guard.waypoints[0].x;
      guard.y = guard.waypoints[0].y;
      guard.waypoint = 1;
      guard.pause = 0;
      guard.suspicion = 0;
      guard.chasing = false;
      guard.chaseTimer = 0;
      guard.state = 'patrol';
    }
  }

  /**
   * One fixed step. `move` is {x, y} (a unit-ish direction, 0 when still) and `sneak`
   * whether the thief creeps. With `harmless` set (the title screen's backdrop) the guards
   * patrol and the cameras sweep, but nothing is spotted, stolen or caught.
   * Returns what happened as EVENT_* bit flags.
   */
  function step(dt, move, sneak, harmless = false) {
    let events = 0;
    if (state.over || state.won) return events;
    state.elapsed += dt;
    state.levelTime += dt;
    if (player.caughtFlash > 0) player.caughtFlash = Math.max(0, player.caughtFlash - dt);

    // --- the thief moves ---
    const speed = sneak ? PLAYER.sneakSpeed : PLAYER.speed;
    player.sneaking = sneak;
    player.moving = move.x !== 0 || move.y !== 0;
    if (player.moving) {
      const len = Math.sqrt(move.x * move.x + move.y * move.y) || 1;
      player.x += (move.x / len) * speed * dt;
      player.y += (move.y / len) * speed * dt;
      player.angle = Math.atan2(move.y, move.x);
      resolveCircleSolids(player, solids);
    }

    // --- cameras sweep ---
    for (const camera of cameras) {
      camera.angle = camera.baseAngle + Math.sin(state.elapsed * camera.speed + camera.phase) * camera.sweep;
    }

    // --- guards patrol, suspect, chase ---
    let anySuspicious = false;
    let anyChasing = false;
    for (const guard of guards) {
      const seen = harmless ? 0 : seesThief(guard.x, guard.y, guard.angle, GUARD.viewRange, GUARD.viewHalfAngle);
      if (seen > 0) {
        guard.suspicion = clamp(guard.suspicion + GUARD.suspicionRate * seen * dt, 0, 1);
      } else {
        guard.suspicion = clamp(guard.suspicion - GUARD.suspicionDecay * dt, 0, 1);
      }
      if (guard.suspicion >= 1 && !guard.chasing) {
        guard.chasing = true;
        guard.chaseTimer = GUARD.chaseMemory;
        guard.state = 'chase';
        events |= EVENT_SPOTTED;
      }
      if (guard.chasing) {
        anyChasing = true;
        if (seen > 0) guard.chaseTimer = GUARD.chaseMemory;
        else guard.chaseTimer -= dt;
        if (guard.chaseTimer <= 0) {
          guard.chasing = false;
          guard.state = 'patrol';
        }
      } else if (guard.suspicion > 0.25) {
        anySuspicious = true;
        guard.state = 'suspicious';
        // A suspicious guard turns toward the thief and edges closer.
        const target = Math.atan2(player.y - guard.y, player.x - guard.x);
        guard.angle += clamp(angleDifference(target, guard.angle), -2.4 * dt, 2.4 * dt);
      } else {
        guard.state = 'patrol';
      }

      if (guard.chasing || state.lockdown > 0) {
        const dx = player.x - guard.x;
        const dy = player.y - guard.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        guard.angle = Math.atan2(dy, dx);
        guard.x += (dx / dist) * GUARD.chaseSpeed * dt;
        guard.y += (dy / dist) * GUARD.chaseSpeed * dt;
        resolveCircleSolids(guard, solids);
      } else if (guard.state === 'patrol') {
        if (guard.pause > 0) {
          guard.pause -= dt;
        } else {
          const target = guard.waypoints[guard.waypoint];
          const dx = target.x - guard.x;
          const dy = target.y - guard.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 6) {
            guard.waypoint = (guard.waypoint + 1) % guard.waypoints.length;
            guard.pause = GUARD.waypointPause;
          } else {
            guard.angle = Math.atan2(dy, dx);
            guard.x += (dx / dist) * guard.speed * dt;
            guard.y += (dy / dist) * guard.speed * dt;
            resolveCircleSolids(guard, solids);
          }
        }
      }
      if (guard.suspicion > 0.25) anySuspicious = true;
    }

    // --- cameras raise the alarm directly ---
    let cameraSees = false;
    for (const camera of cameras) {
      if (!harmless && seesThief(camera.x, camera.y, camera.angle, CAMERA.viewRange, CAMERA.viewHalfAngle) > 0) {
        cameraSees = true;
        break;
      }
    }
    state.seenByCamera = cameraSees;
    state.spotted = anySuspicious || anyChasing || cameraSees;

    // --- the alarm meter ---
    const wasLockdown = state.lockdown > 0;
    if (!harmless) {
      if (state.lockdown > 0) {
        state.lockdown -= dt;
        state.alarm = 100;
        if (state.lockdown <= 0) state.alarm = ALARM.lockdownFallTo;
      } else if (cameraSees) {
        state.alarm = clamp(state.alarm + CAMERA.alarmRate * dt, 0, 100);
      } else if (anyChasing) {
        state.alarm = clamp(state.alarm + ALARM.chaseRate * dt, 0, 100);
      } else if (anySuspicious) {
        state.alarm = clamp(state.alarm + ALARM.guardRate * dt, 0, 100);
      } else {
        state.alarm = clamp(state.alarm - ALARM.decay * dt, 0, 100);
      }
      if (state.alarm >= 100 && !wasLockdown) {
        state.lockdown = ALARM.lockdownSeconds;
        events |= EVENT_LOCKDOWN;
      }
      if (cameraSees || anySuspicious || anyChasing) events |= EVENT_ALARM;
    }

    // --- loot ---
    for (const item of loot) {
      if (item.taken || harmless) continue;
      item.glint += dt * 2;
      if (distance(player.x, player.y, item.x, item.y) < LOOT.grabRadius) {
        item.taken = true;
        state.lootTaken += 1;
        state.lootValue += item.value;
        state.levelLootValue += item.value;
        state.score += item.value;
        burst(item.x, item.y, '#f2c94c', 18);
        addFloater(item.x, item.y - 18, `+$${item.value.toLocaleString('en-US')}`, '#f2c94c');
        events |= EVENT_LOOT;
        if (state.lootTaken === state.lootTotal) {
          state.exitOpen = true;
          addFloater(exit.x, exit.y - 10, 'EXIT OPEN — GO!', '#2fbf71');
        }
      }
    }

    // --- caught? ---
    if (!harmless && player.caughtFlash === 0) {
      for (const guard of guards) {
        if (distance(player.x, player.y, guard.x, guard.y) < player.radius + guard.radius - 2) {
          state.lives -= 1;
          events |= EVENT_CAUGHT;
          burst(player.x, player.y, '#e5534b', 22);
          if (state.lives <= 0) {
            state.over = true;
            events |= EVENT_OVER;
          } else {
            respawnAfterCaught();
          }
          break;
        }
      }
    }

    // --- exit: only open once every loot is pocketed ---
    if (!harmless && state.exitOpen && !state.over) {
      const inside = player.x > exit.x - 6 && player.x < exit.x + exit.w + 6 &&
        player.y > exit.y - 6 && player.y < exit.y + exit.h + 6;
      if (inside) {
        const timeBonus = Math.max(0, Math.round((LEVEL_TIME_BONUS - state.levelTime * 1000) / 100));
        state.score += timeBonus;
        if (state.levelIndex + 1 < LEVELS.length) {
          loadLevel(state.levelIndex + 1);
          events |= EVENT_LEVEL;
        } else {
          state.won = true;
          state.score += 5000;
          events |= EVENT_WIN;
        }
      }
    }

    // --- particles and floaters ---
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const p = particles[index];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.age >= p.life) particles.splice(index, 1);
    }
    for (let index = floaters.length - 1; index >= 0; index -= 1) {
      const f = floaters[index];
      f.age += dt;
      f.y -= 26 * dt;
      if (f.age >= f.life) floaters.splice(index, 1);
    }

    return events;
  }

  reset();
  return { state, reset, step, loadLevel, exit: () => exit, start: () => start };
}
