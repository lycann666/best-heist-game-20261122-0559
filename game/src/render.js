// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Canvas
// art only: tiled marble floor, carpet, gold-trimmed walls, glass display cases, glowing loot,
// guards with vision cones, sweeping cameras, and a HUD with the alarm meter. Text that holds
// a number is rebuilt only when the number changes, so a frame allocates nothing.
import { FIELD, FONT, GUARD, LIVES, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TILE = 80;
const TWO_PI = Math.PI * 2;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel('SCORE $');
  const lootLabel = cachedLabel('LOOT ');
  const levelLabel = cachedLabel('');
  const timeLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST $');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight = '') {
    const key = size + weight;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`.trim());
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function cone(x, y, angle, range, halfAngle, fill, edge) {
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, angle - halfAngle, angle + halfAngle);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = edge;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function drawFloor() {
    for (let ty = 0; ty < FIELD.height / TILE; ty += 1) {
      for (let tx = 0; tx < FIELD.width / TILE; tx += 1) {
        context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += TILE) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
      context.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += TILE) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
      context.stroke();
    }
    // The red carpet down the middle corridor.
    context.fillStyle = PALETTE.carpet;
    context.fillRect(0, 330, FIELD.width, 60);
    context.fillStyle = PALETTE.carpetTrim;
    context.fillRect(0, 330, FIELD.width, 3);
    context.fillRect(0, 387, FIELD.width, 3);
  }

  function drawWalls(state) {
    // Outer border.
    context.fillStyle = PALETTE.wall;
    context.fillRect(0, 0, FIELD.width, 14);
    context.fillRect(0, FIELD.height - 14, FIELD.width, 14);
    context.fillRect(0, 0, 14, FIELD.height);
    context.fillRect(FIELD.width - 14, 0, 14, FIELD.height);
    context.fillStyle = PALETTE.wallTrim;
    context.fillRect(0, 14, FIELD.width, 2);
    context.fillRect(0, FIELD.height - 16, FIELD.width, 2);
    context.fillRect(14, 0, 2, FIELD.height);
    context.fillRect(FIELD.width - 16, 0, 2, FIELD.height);
    for (const wall of state.walls) {
      context.fillStyle = PALETTE.wall;
      context.fillRect(wall.x, wall.y, wall.w, wall.h);
      context.fillStyle = PALETTE.wallTop;
      context.fillRect(wall.x, wall.y, wall.w, 4);
      context.fillStyle = PALETTE.wallTrim;
      context.fillRect(wall.x, wall.y + wall.h - 2, wall.w, 2);
    }
    for (const c of state.cases) {
      context.fillStyle = PALETTE.pedestal;
      context.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
      context.fillStyle = PALETTE.caseGlass;
      context.fillRect(c.x, c.y, c.w, c.h);
      context.strokeStyle = PALETTE.caseFrame;
      context.lineWidth = 3;
      context.strokeRect(c.x, c.y, c.w, c.h);
    }
  }

  function drawExit(state) {
    const exit = state.exit;
    const open = state.exitOpen;
    context.save();
    context.shadowColor = open ? '#2fbf71' : '#e5534b';
    context.shadowBlur = open ? 22 : 6;
    context.fillStyle = open ? PALETTE.exitOpen : PALETTE.exitClosed;
    context.fillRect(exit.x, exit.y, exit.w, exit.h);
    context.restore();
    context.strokeStyle = open ? '#a9f0c6' : '#7a828f';
    context.lineWidth = 2;
    context.strokeRect(exit.x, exit.y, exit.w, exit.h);
    context.save();
    context.translate(exit.x + exit.w / 2, exit.y + exit.h / 2);
    if (exit.w < exit.h) context.rotate(-Math.PI / 2);
    text(open ? 'EXIT' : 'LOCKED', 0, 5, 13, open ? '#eafff1' : '#c8cdd8', 'center', '700');
    context.restore();
  }

  function drawLoot(state) {
    for (const item of state.loot) {
      if (item.taken) continue;
      const pulse = 0.55 + 0.45 * Math.sin(item.glint);
      context.save();
      context.shadowColor = '#f2c94c';
      context.shadowBlur = 14 + 10 * pulse;
      if (item.kind === 'painting') {
        context.fillStyle = '#8a6d2b';
        context.fillRect(item.x - 22, item.y - 16, 44, 32);
        context.fillStyle = '#274b63';
        context.fillRect(item.x - 18, item.y - 12, 36, 24);
        context.fillStyle = '#e8d27a';
        context.beginPath();
        context.arc(item.x - 6, item.y - 2, 6, 0, TWO_PI);
        context.fill();
      } else if (item.kind === 'gem') {
        context.fillStyle = '#6fe3ff';
        context.beginPath();
        context.moveTo(item.x, item.y - 16);
        context.lineTo(item.x + 13, item.y);
        context.lineTo(item.x, item.y + 16);
        context.lineTo(item.x - 13, item.y);
        context.closePath();
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.75)';
        context.beginPath();
        context.moveTo(item.x, item.y - 16);
        context.lineTo(item.x + 13, item.y);
        context.lineTo(item.x, item.y);
        context.closePath();
        context.fill();
      } else if (item.kind === 'vase') {
        context.fillStyle = '#7fb069';
        context.beginPath();
        context.moveTo(item.x - 6, item.y - 16);
        context.quadraticCurveTo(item.x - 15, item.y, item.x - 7, item.y + 14);
        context.lineTo(item.x + 7, item.y + 14);
        context.quadraticCurveTo(item.x + 15, item.y, item.x + 6, item.y - 16);
        context.closePath();
        context.fill();
        context.fillStyle = '#c9a227';
        context.fillRect(item.x - 8, item.y - 18, 16, 4);
      } else if (item.kind === 'bars') {
        context.fillStyle = '#c9a227';
        context.fillRect(item.x - 16, item.y + 2, 32, 9);
        context.fillStyle = '#f2c94c';
        context.fillRect(item.x - 12, item.y - 7, 24, 9);
        context.fillStyle = '#ffe27a';
        context.fillRect(item.x - 6, item.y - 15, 12, 9);
      } else {
        // crown
        context.fillStyle = '#f2c94c';
        context.beginPath();
        context.moveTo(item.x - 16, item.y + 10);
        context.lineTo(item.x - 16, item.y - 6);
        context.lineTo(item.x - 8, item.y + 2);
        context.lineTo(item.x, item.y - 12);
        context.lineTo(item.x + 8, item.y + 2);
        context.lineTo(item.x + 16, item.y - 6);
        context.lineTo(item.x + 16, item.y + 10);
        context.closePath();
        context.fill();
        context.fillStyle = '#e5534b';
        context.beginPath();
        context.arc(item.x, item.y + 2, 3, 0, TWO_PI);
        context.fill();
      }
      context.restore();
      // Value tag under the loot.
      context.font = `700 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillStyle = 'rgba(10, 12, 18, 0.75)';
      const tag = `$${item.value.toLocaleString('en-US')}`;
      const tagWidth = context.measureText(tag).width + 10;
      context.fillRect(item.x - tagWidth / 2, item.y + 20, tagWidth, 18);
      context.fillStyle = PALETTE.gold;
      context.fillText(tag, item.x, item.y + 33);
    }
  }

  function drawCameras(state) {
    for (const camera of state.cameras) {
      const alerted = state.seenByCamera;
      cone(camera.x, camera.y, camera.angle, 265, 0.42,
        alerted ? PALETTE.coneAlert : PALETTE.cameraCone,
        alerted ? PALETTE.coneAlertEdge : PALETTE.cameraConeEdge);
      context.fillStyle = PALETTE.cameraBody;
      context.beginPath();
      context.arc(camera.x, camera.y, 9, 0, TWO_PI);
      context.fill();
      context.fillStyle = alerted ? '#e5534b' : '#6fe3ff';
      context.beginPath();
      context.arc(camera.x + Math.cos(camera.angle) * 5, camera.y + Math.sin(camera.angle) * 5, 3.5, 0, TWO_PI);
      context.fill();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const alerted = guard.chasing || guard.suspicion > 0.25;
      const fill = guard.chasing ? PALETTE.coneAlert : alerted ? 'rgba(242, 150, 76, 0.18)' : PALETTE.coneCalm;
      const edge = guard.chasing ? PALETTE.coneAlertEdge : alerted ? 'rgba(242, 150, 76, 0.4)' : PALETTE.coneEdge;
      cone(guard.x, guard.y, guard.angle, GUARD.viewRange, GUARD.viewHalfAngle, fill, edge);
      // Body: navy guard with cap, facing his patrol direction.
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.beginPath();
      context.ellipse(guard.x + 3, guard.y + 5, 15, 8, 0, 0, TWO_PI);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, guard.radius, 0, TWO_PI);
      context.fill();
      context.strokeStyle = '#dfe6f2';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(guard.x, guard.y, guard.radius, 0, TWO_PI);
      context.stroke();
      context.fillStyle = PALETTE.guardCap;
      context.beginPath();
      context.arc(guard.x, guard.y, 9, 0, TWO_PI);
      context.fill();
      context.strokeStyle = '#dfe6f2';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.angle) * 20, guard.y + Math.sin(guard.angle) * 20);
      context.stroke();
      // Suspicion ring above the guard.
      if (guard.suspicion > 0.02) {
        context.strokeStyle = 'rgba(238, 241, 245, 0.25)';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(guard.x, guard.y, 22, -Math.PI / 2, Math.PI * 1.5);
        context.stroke();
        context.strokeStyle = guard.chasing ? '#e5534b' : '#f2c94c';
        context.beginPath();
        context.arc(guard.x, guard.y, 22, -Math.PI / 2, -Math.PI / 2 + guard.suspicion * TWO_PI);
        context.stroke();
      }
      if (guard.chasing) {
        text('!', guard.x, guard.y - 28, 26, '#e5534b', 'center', '800');
      } else if (guard.suspicion > 0.25) {
        text('?', guard.x, guard.y - 28, 24, '#f2c94c', 'center', '800');
      }
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    const blink = player.caughtFlash > 0 && Math.floor(player.caughtFlash * 10) % 2 === 0;
    if (blink) return;
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.beginPath();
    context.ellipse(player.x + 2, player.y + 5, 14, 7, 0, 0, TWO_PI);
    context.fill();
    if (player.sneaking) {
      context.strokeStyle = 'rgba(242, 201, 76, 0.6)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 6, 0, TWO_PI);
      context.stroke();
    }
    // Hooded thief: dark cloak, hood and a gold mask slit, ringed in gold so the
    // thief always reads against the dark floor.
    context.strokeStyle = PALETTE.goldDark;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, player.radius + 2, 0, TWO_PI);
    context.stroke();
    context.fillStyle = PALETTE.thief;
    context.beginPath();
    context.arc(player.x, player.y, player.radius, 0, TWO_PI);
    context.fill();
    context.fillStyle = PALETTE.thiefHood;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16);
    context.lineTo(player.x + Math.cos(player.angle + 2.5) * 12, player.y + Math.sin(player.angle + 2.5) * 12);
    context.lineTo(player.x + Math.cos(player.angle - 2.5) * 12, player.y + Math.sin(player.angle - 2.5) * 12);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.thiefMask;
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 6, player.y + Math.sin(player.angle) * 6, 5.5, 0, TWO_PI);
    context.fill();
    context.fillStyle = '#fff6cf';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 6 - 1.5, player.y + Math.sin(player.angle) * 6 - 1.5, 1.8, 0, TWO_PI);
    context.fill();
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, 1 - p.age / p.life);
      context.fillStyle = p.colour;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, TWO_PI);
      context.fill();
    }
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
    for (const f of state.floaters) {
      context.globalAlpha = Math.max(0, 1 - f.age / f.life);
      text(f.text, f.x, f.y, 18, f.colour, 'center', '700');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, screen) {
    // Top-left: loot and score.
    context.fillStyle = 'rgba(10, 12, 18, 0.72)';
    context.fillRect(10, 10, 250, 62);
    context.strokeStyle = 'rgba(201, 162, 39, 0.5)';
    context.lineWidth = 1;
    context.strokeRect(10, 10, 250, 62);
    text(lootLabel(`${state.lootTaken}/${state.lootTotal}  ·  $${state.levelLootValue.toLocaleString('en-US')}`), 22, 34, 20, PALETTE.gold, 'left', '700');
    text(scoreLabel(state.score.toLocaleString('en-US')), 22, 60, 17, PALETTE.text, 'left');
    text(`LIVES ${'●'.repeat(state.lives)}${'○'.repeat(Math.max(0, LIVES - state.lives))}`, 268, 34, 16, state.lives === 1 ? '#e5534b' : PALETTE.text, 'left');
    text(state.levelName, 268, 60, 15, PALETTE.muted, 'left');

    // Top-centre: the alarm meter — always visible, the heist's heartbeat.
    const meterX = FIELD.width / 2 - 170;
    const meterY = 12;
    const meterW = 340;
    const meterH = 24;
    const alarm = state.alarm;
    const lockdown = state.lockdown > 0;
    context.fillStyle = 'rgba(10, 12, 18, 0.72)';
    context.fillRect(meterX - 8, meterY - 4, meterW + 16, meterH + 30);
    context.strokeStyle = lockdown ? '#e5534b' : 'rgba(201, 162, 39, 0.5)';
    context.strokeRect(meterX - 8, meterY - 4, meterW + 16, meterH + 30);
    const alarmColour = lockdown || alarm >= 70 ? PALETTE.alarmHigh : alarm >= 35 ? PALETTE.alarmMid : PALETTE.alarmLow;
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(meterX, meterY, meterW, meterH);
    context.fillStyle = alarmColour;
    context.fillRect(meterX, meterY, (meterW * alarm) / 100, meterH);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    for (let tick = 1; tick < 4; tick += 1) context.fillRect(meterX + (meterW * tick) / 4 - 1, meterY, 2, meterH);
    const alarmText = lockdown ? 'LOCKDOWN!' : `ALARM ${Math.round(alarm)}%`;
    text(alarmText, FIELD.width / 2, meterY + meterH + 18, 14, lockdown ? '#ff6b61' : PALETTE.text, 'center', '800');
    if (state.spotted && screen === SCREEN_PLAY) {
      text('SPOTTED — BREAK LINE OF SIGHT!', FIELD.width / 2, meterY + meterH + 40, 13, '#ff8a80', 'center', '700');
    }

    // Top-right: level and time.
    context.fillStyle = 'rgba(10, 12, 18, 0.72)';
    context.fillRect(FIELD.width - 190, 10, 180, 62);
    context.strokeStyle = 'rgba(201, 162, 39, 0.5)';
    context.strokeRect(FIELD.width - 190, 10, 180, 62);
    text(levelLabel(`HEIST ${state.levelIndex + 1} / 3`), FIELD.width - 100, 34, 17, PALETTE.text, 'center', '700');
    const minutes = Math.floor(state.levelTime / 60);
    const seconds = Math.floor(state.levelTime % 60);
    text(timeLabel(`${minutes}:${String(seconds).padStart(2, '0')}`), FIELD.width - 100, 60, 17, PALETTE.muted, 'center');
  }

  function drawBanner(banner) {
    if (!banner) return;
    context.fillStyle = 'rgba(10, 12, 18, 0.78)';
    context.fillRect(0, 96, FIELD.width, 84);
    context.fillStyle = PALETTE.panelBorder;
    context.fillRect(0, 96, FIELD.width, 2);
    context.fillRect(0, 178, FIELD.width, 2);
    text(banner.title, FIELD.width / 2, 138, 34, PALETTE.gold, 'center', '800');
    text(banner.sub, FIELD.width / 2, 168, 18, PALETTE.text, 'center');
  }

  function drawVignette(state) {
    // Red pulse at the screen edges while the alarm runs hot.
    if (state.alarm < 55 && state.lockdown <= 0) return;
    const strength = state.lockdown > 0 ? 0.5 : (state.alarm - 55) / 90;
    const pulse = 0.7 + 0.3 * Math.sin(state.elapsed * 6);
    const gradient = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.78,
    );
    gradient.addColorStop(0, 'rgba(229, 83, 75, 0)');
    gradient.addColorStop(1, `rgba(229, 83, 75, ${(strength * pulse).toFixed(3)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 66, 44, accent || PALETTE.text, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 112 + index * 32, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 20, PALETTE.gold, 'center');
  }

  /** Paint one frame: the room, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, banner) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor();
    drawExit(state);
    drawWalls(state);
    drawLoot(state);
    drawCameras(state);
    drawGuards(state);
    drawPlayer(state);
    drawParticles(state);
    drawVignette(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('THE MERIDIAN VAULT', [
        'A top-down stealth heist. Lift every treasure,',
        'dodge the guards\u2019 vision cones and the cameras,',
        'watch the alarm meter — then slip out the green door.',
        '',
        'Move: WASD / arrows or click the floor  ·  Sneak: hold Shift',
        best > 0 ? bestLabel(best.toLocaleString('en-US')) : 'No heist yet — the vault awaits.',
      ], 'Click or press Space to start', PALETTE.gold);
      return;
    }
    drawHud(state, screen);
    drawBanner(banner);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards are waiting. The vault is not going anywhere.'], 'Press P or click to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('BUSTED!', [
        `The guards caught you on heist ${state.levelIndex + 1}.`,
        `Loot kept: $${state.lootValue.toLocaleString('en-US')}  ·  Score ${state.score.toLocaleString('en-US')}`,
        bestLabel(best.toLocaleString('en-US')),
      ], 'Press Space or click to try again', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      drawPanel('CLEAN GETAWAY!', [
        'All three heists complete. The Meridian Vault is empty.',
        `Final score ${state.score.toLocaleString('en-US')}  ·  Loot $${state.lootValue.toLocaleString('en-US')}`,
        bestLabel(best.toLocaleString('en-US')),
      ], 'Press Space or click to play again', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Client (mouse) coordinates to playfield coordinates, or null when outside. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dx = (clientX - rect.left) * view.ratio;
      const dy = (clientY - rect.top) * view.ratio;
      const fieldX = (dx - view.x) / view.scale;
      const fieldY = (dy - view.y) / view.scale;
      if (fieldX < 0 || fieldY < 0 || fieldX > FIELD.width || fieldY > FIELD.height) return null;
      return { x: fieldX, y: fieldY };
    },
  };
}
