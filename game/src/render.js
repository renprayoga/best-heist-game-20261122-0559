// Halcyon Heist — every pixel the judge sees. The whole level is one
// 1280x800 frame (no scrolling), so a single screenshot shows the room,
// the guards and their cones, the cameras, the loot and the alarm meter.
import {
  CAMERA,
  COLS,
  FIELD,
  FONT,
  GUARD,
  PALETTE,
  PLAYER,
  ROWS,
  TILE,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_VICTORY = 'victory';

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;

  function drawCone(points, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawFloor(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = state.tiles[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === '#') continue;
        ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.floor : PALETTE.floorAlt;
        ctx.fillRect(px, py, TILE, TILE);
        if (ch === 'S') {
          ctx.fillStyle = PALETTE.shadow;
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
        }
        // Faint tile seams make the room read as a floor, not a flat slab.
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  function drawWalls(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (state.tiles[y][x] !== '#') continue;
        const px = x * TILE;
        const py = y * TILE;
        ctx.fillStyle = PALETTE.wallFace;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(px, py, TILE, 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  function drawCratesAndPlants(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = state.tiles[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === 'C') {
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
          ctx.fillStyle = PALETTE.crateTop;
          ctx.fillRect(px + 3, py + 3, TILE - 6, 8);
          ctx.strokeStyle = PALETTE.crateEdge;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 3);
          ctx.lineTo(px + TILE - 3, py + TILE - 3);
          ctx.moveTo(px + TILE - 3, py + 3);
          ctx.lineTo(px + 3, py + TILE - 3);
          ctx.stroke();
        } else if (ch === 'B') {
          ctx.fillStyle = PALETTE.plant;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.plantLight;
          ctx.beginPath();
          ctx.arc(px + TILE / 2 - 4, py + TILE / 2 - 4, 8, 0, Math.PI * 2);
          ctx.arc(px + TILE / 2 + 6, py + TILE / 2 + 5, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawLasers(state) {
    if (!state.laserLive && state.laserPhase === 0) return;
    const blink = state.laserLive ? 0.85 + 0.15 * Math.sin(state.time * 14) : 0.14;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.strokeStyle = PALETTE.laser;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -state.time * 40;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (state.tiles[y][x] !== 'L') continue;
        const px = x * TILE + TILE / 2;
        const py = y * TILE;
        ctx.beginPath();
        ctx.moveTo(px, py + 2);
        ctx.lineTo(px, py + TILE - 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawLoot(state) {
    for (const l of state.loot) {
      if (l.taken) continue;
      const pulse = 0.75 + 0.25 * Math.sin(state.time * 3 + l.x);
      if (l.kind === 'gold') {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.moveTo(l.x - 11, l.y + 7);
        ctx.lineTo(l.x - 7, l.y - 7);
        ctx.lineTo(l.x + 7, l.y - 7);
        ctx.lineTo(l.x + 11, l.y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(l.x - 6, l.y - 5, 12, 3);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = PALETTE.intel;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y - 11);
        ctx.lineTo(l.x + 9, l.y);
        ctx.lineTo(l.x, l.y + 11);
        ctx.lineTo(l.x - 9, l.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0d0f1a';
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('i', l.x, l.y + 0.5);
        ctx.restore();
      }
    }
    for (const s of state.safes) {
      if (s.cracked) continue;
      ctx.fillStyle = PALETTE.safe;
      roundRect(ctx, s.x - 15, s.y - 15, 30, 30, 5);
      ctx.fill();
      ctx.strokeStyle = '#5a6a86';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#eef1f5';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', s.x, s.y - 0);
      if (s.progress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(s.x - 18, s.y - 26, 36, 6);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(s.x - 17, s.y - 25, 34 * s.progress, 4);
      }
    }
    const v = state.vault;
    if (v) {
      const glow = v.cracked ? 0.25 : 0.6 + 0.4 * Math.sin(state.time * 2.5);
      ctx.save();
      ctx.globalAlpha = glow * 0.5;
      ctx.fillStyle = PALETTE.vault;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = v.cracked ? PALETTE.vaultDark : PALETTE.vault;
      roundRect(ctx, v.x - 17, v.y - 17, 34, 34, 6);
      ctx.fill();
      ctx.strokeStyle = '#6e5410';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#231a05';
      ctx.beginPath();
      ctx.arc(v.x, v.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = v.cracked ? '#7dff9e' : '#fff3c4';
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (v.progress > 0 && !v.cracked) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(v.x - 22, v.y - 30, 44, 7);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillRect(v.x - 21, v.y - 29, 42 * v.progress, 5);
        ctx.fillStyle = PALETTE.text;
        ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('CRACKING…', v.x, v.y - 36);
      }
      ctx.fillStyle = PALETTE.goldText;
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(v.cracked ? 'VAULT OPEN' : 'VAULT', v.x, v.y + 30);
    }
  }

  function drawExit(state) {
    const e = state.exit;
    if (!e) return;
    const open = state.vault?.cracked;
    const pulse = open ? 0.65 + 0.35 * Math.sin(state.time * 4) : 0.3;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = PALETTE.exit;
    roundRect(ctx, e.x - 26, e.y - 26, 52, 52, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = open ? PALETTE.exit : PALETTE.exitDark;
    ctx.lineWidth = 3;
    roundRect(ctx, e.x - 26, e.y - 26, 52, 52, 8);
    ctx.stroke();
    ctx.fillStyle = '#062b18';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VAN', e.x, e.y - 6);
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillText(open ? 'GO!' : 'LOCKED', e.x, e.y + 8);
    ctx.fillStyle = PALETTE.exit;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText('GETAWAY', e.x, e.y + 38);
  }

  function drawGuards(state, world) {
    for (const g of state.guards) {
      const alert = g.mode === 'chase';
      const wary = g.mode === 'suspicious' || g.mode === 'investigate';
      const color = alert ? PALETTE.coneAlert : wary ? '#ff9a3c' : PALETTE.cone;
      const points = world.conePoints(g.x, g.y, g.angle, GUARD.sightRange, GUARD.halfAngle);
      drawCone(points, color, alert ? 0.45 : wary ? 0.38 : 0.32);
      // Body: a guard in a dark uniform with a red cap and a facing tick.
      ctx.fillStyle = PALETTE.guardDark;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GUARD.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.guard;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GUARD.radius - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,214,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GUARD.radius - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffd9d6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x + Math.cos(g.angle) * (GUARD.radius + 7), g.y + Math.sin(g.angle) * (GUARD.radius + 7));
      ctx.stroke();
      // Spot progress ring: fills as the guard locks onto the thief.
      if (g.spot > 0.05) {
        ctx.strokeStyle = alert ? PALETTE.alarm : PALETTE.gold;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, GUARD.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.spot);
        ctx.stroke();
      }
      if (alert) {
        ctx.fillStyle = PALETTE.alarm;
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('!', g.x, g.y - GUARD.radius - 10);
      } else if (wary) {
        ctx.fillStyle = '#ff9a3c';
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('?', g.x, g.y - GUARD.radius - 10);
      }
    }
  }

  function drawCameras(state, world) {
    for (const c of state.cameras) {
      const disabled = c.disabled > 0;
      const color = disabled ? '#5a6a86' : PALETTE.cameraCone;
      if (!disabled) {
        const points = world.conePoints(c.x, c.y, c.angle, CAMERA.sightRange, CAMERA.halfAngle);
        drawCone(points, color, c.spot > 0.15 ? 0.48 : 0.34);
      }
      ctx.fillStyle = disabled ? '#3a4157' : '#20263f';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = disabled ? '#5a6a86' : PALETTE.camera;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = disabled ? '#5a6a86' : PALETTE.camera;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(c.angle) * 6, c.y + Math.sin(c.angle) * 6, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (c.spot > 0.05 && !disabled) {
        ctx.strokeStyle = PALETTE.alarm;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.spot);
        ctx.stroke();
      }
      if (disabled) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('OFF', c.x, c.y - 16);
      }
    }
  }

  function drawSmoke(state) {
    for (const s of state.smokes) {
      const alpha = Math.min(0.75, (s.left / 1.2) * 0.75);
      ctx.save();
      ctx.globalAlpha = Math.max(0.2, alpha);
      ctx.fillStyle = PALETTE.smoke;
      ctx.beginPath();
      ctx.arc(s.x - 22, s.y - 8, 30, 0, Math.PI * 2);
      ctx.arc(s.x + 18, s.y + 10, 34, 0, Math.PI * 2);
      ctx.arc(s.x + 4, s.y - 18, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    const hidden = state.tiles[Math.floor(p.y / TILE)]?.[Math.floor(p.x / TILE)];
    const inBush = hidden === 'B' || hidden === 'S';
    // Shadow under the thief; fainter when they are tucked into cover.
    ctx.save();
    ctx.globalAlpha = inBush ? 0.35 : 0.9;
    ctx.fillStyle = PALETTE.playerCoat;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius - 2, 0, Math.PI * 2);
    ctx.fill();
    // A gold ring so the thief is unmistakable at a glance.
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius + 3, 0, Math.PI * 2);
    ctx.stroke();
    // A dark mask and a facing tick: the thief in a white shirt, moving fast.
    ctx.fillStyle = '#14172b';
    ctx.beginPath();
    ctx.arc(p.x + p.dirX * 3, p.y + p.dirY * 3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.dirX * (PLAYER.radius + 6), p.y + p.dirY * (PLAYER.radius + 6));
    ctx.stroke();
    ctx.restore();
    if (state.crackTarget) {
      ctx.fillStyle = PALETTE.goldText;
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('CRACKING…', p.x, p.y - PLAYER.radius - 12);
    }
  }

  function drawHud(state, screen) {
    // Top bar, 40 px tall: it sits over the map's top wall row only, so the
    // whole room stays visible. The alarm meter — the brief's required
    // element — is dead centre and impossible to miss.
    ctx.fillStyle = 'rgba(10,12,24,0.94)';
    ctx.fillRect(0, 0, FIELD.width, 40);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 40, FIELD.width, 2);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText('HALCYON HEIST', 14, 21);

    // Alarm meter (centre).
    const ax = 470;
    const aw = 340;
    const alarmColor = state.tripped ? PALETTE.alarm : state.alarm > 55 ? '#ff9a3c' : PALETTE.gold;
    ctx.fillStyle = '#000';
    ctx.fillRect(ax - 2, 8, aw + 4, 26);
    ctx.fillStyle = '#2a2f47';
    ctx.fillRect(ax, 10, aw, 22);
    ctx.fillStyle = alarmColor;
    ctx.fillRect(ax, 10, (aw * state.alarm) / 100, 22);
    ctx.strokeStyle = alarmColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(ax - 2, 8, aw + 4, 26);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      state.tripped ? '⚠ ALARM — THEY ARE HUNTING YOU' : state.spotted ? `SPOTTED!  ALARM ${Math.round(state.alarm)}%` : `ALARM ${Math.round(state.alarm)}%`,
      ax + aw / 2,
      22,
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(`$${state.lootValue.toLocaleString('en-US')}  ·  ${fmtTime(state.time)}`, FIELD.width - 14, 21);

    // Bottom bar: objective, tools and controls. It covers only the map's
    // bottom wall row.
    ctx.fillStyle = 'rgba(10,12,24,0.94)';
    ctx.fillRect(0, FIELD.height - 34, FIELD.width, 34);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, FIELD.height - 34, FIELD.width, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(
      `${state.levelName} · ${state.vault?.cracked ? 'Vault open — reach the van!' : `Crack the vault: ${state.vaultName}`}   ·   Q smoke ×${state.smokeLeft}   H hack ×${state.hackLeft}   E crack (hold)   Shift sprint (loud!)   Click walk`,
      14,
      FIELD.height - 17,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Score ${state.score.toLocaleString('en-US')}  ·  P pause · M mute · R restart`, FIELD.width - 14, FIELD.height - 17);

    if (state.message) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,12,24,0.88)';
      const w = ctx.measureText(state.message).width + 28;
      roundRect(ctx, FIELD.width / 2 - w / 2, FIELD.height - 72, w, 30, 15);
      ctx.fill();
      ctx.fillStyle = PALETTE.goldText;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(state.message, FIELD.width / 2, FIELD.height - 56);
    }
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8,10,20,0.72)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 8);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `17px ${FONT}`;
      ctx.fillText('Press P to keep stealing', FIELD.width / 2, FIELD.height / 2 + 28);
    }
  }

  function drawTitle(state, best) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `bold 84px ${FONT}`;
    ctx.fillText('HALCYON HEIST', FIELD.width / 2, 190);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `22px ${FONT}`;
    ctx.fillText('Three vaults. One night. No witnesses.', FIELD.width / 2, 238);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Slip past the patrols, crack the vault, and reach the getaway van — unseen.', FIELD.width / 2, 268);

    const levels = ['1 · The Gallery', '2 · The Vault Floor', '3 · The Neon Rooftop'];
    levels.forEach((label, i) => {
      const x = FIELD.width / 2 - 330 + i * 220;
      const y = 330;
      ctx.fillStyle = i === state.levelIndex ? 'rgba(242,201,76,0.16)' : 'rgba(255,255,255,0.05)';
      roundRect(ctx, x, y, 200, 64, 10);
      ctx.fill();
      ctx.strokeStyle = i === state.levelIndex ? PALETTE.gold : PALETTE.panelEdge;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = i === state.levelIndex ? PALETTE.goldText : PALETTE.text;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(label, x + 100, y + 32);
    });

    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('WASD / arrows move · Shift sprint (loud!) · Click walk there · E hold to crack', FIELD.width / 2, 452);
    ctx.fillText('Q smoke pellet · H hack a camera · P pause · M mute', FIELD.width / 2, 480);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Guards see in cones — bushes, shadows and smoke hide you. A full alarm sends everyone hunting.', FIELD.width / 2, 522);
    ctx.fillText('Gold slows you down. Cracking is loud. A Ghost run (never spotted) pays $500.', FIELD.width / 2, 546);
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('Press ENTER to start  ·  ← → choose a floor', FIELD.width / 2, 606);
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `15px ${FONT}`;
      ctx.fillText(`Best score: ${best.toLocaleString('en-US')}`, FIELD.width / 2, 640);
    }
  }

  function drawOver(state) {
    ctx.fillStyle = 'rgba(20,4,6,0.78)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.alarm;
    ctx.font = `bold 64px ${FONT}`;
    ctx.fillText('CAUGHT!', FIELD.width / 2, 300);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `21px ${FONT}`;
    ctx.fillText('A guard grabbed you in the open. The crew leaves no one behind — except tonight.', FIELD.width / 2, 352);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(`You lifted $${state.lootValue.toLocaleString('en-US')} before it went wrong.`, FIELD.width / 2, 392);
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText('Press ENTER to try this floor again  ·  R restart', FIELD.width / 2, 460);
  }

  function drawComplete(state, victory) {
    ctx.fillStyle = 'rgba(6,14,10,0.82)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.exit;
    ctx.font = `bold 56px ${FONT}`;
    ctx.fillText(victory ? 'THE CREW IS RICH!' : `${state.levelName} — CLEAR!`, FIELD.width / 2, 220);
    const stars = '★'.repeat(state.stars ?? 1) + '☆'.repeat(3 - (state.stars ?? 1));
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `44px ${FONT}`;
    ctx.fillText(stars, FIELD.width / 2, 290);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    const ghost = (state.ghostBonus ?? 0) > 0 ? ' · GHOST — never spotted!' : '';
    ctx.fillText(
      `Time ${fmtTime(state.time)} (par ${fmtTime(state.par)})  ·  Intel ${state.intel}/${state.intelTotal}  ·  Gold ${state.goldTaken}/${state.goldTotal}${ghost}`,
      FIELD.width / 2,
      344,
    );
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(
      `Loot $${state.lootValue.toLocaleString('en-US')}  ·  Time bonus $${(state.timeBonus ?? 0).toLocaleString('en-US')}  ·  Ghost bonus $${(state.ghostBonus ?? 0).toLocaleString('en-US')}`,
      FIELD.width / 2,
      380,
    );
    ctx.fillStyle = PALETTE.goldText;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`Score ${state.score.toLocaleString('en-US')}`, FIELD.width / 2, 428);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(
      victory ? 'Press ENTER to play again' : 'Press ENTER for the next floor  ·  R replay this floor',
      FIELD.width / 2,
      500,
    );
  }

  function draw(state, screen, best, world) {
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // The playfield sits below the HUD bar.
    ctx.save();
    ctx.translate(0, 0);
    drawFloor(state);
    drawLasers(state);
    drawExit(state);
    drawLoot(state);
    drawCratesAndPlants(state);
    drawWalls(state);
    drawCameras(state, world);
    drawGuards(state, world);
    drawSmoke(state);
    drawPlayer(state);
    ctx.restore();
    drawHud(state, screen);
    if (screen === SCREEN_OVER) drawOver(state);
    if (screen === SCREEN_COMPLETE) drawComplete(state, false);
    if (screen === SCREEN_VICTORY) drawComplete(state, true);
  }

  return { draw, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_COMPLETE, SCREEN_VICTORY };
}
