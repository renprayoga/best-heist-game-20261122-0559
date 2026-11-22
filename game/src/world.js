// Halcyon Heist — the simulation: one thief, patrolling guards, sweeping
// cameras, loot to lift and a vault to crack, all on a tile map.
// No rendering here (render.js paints state) and no input here (main.js
// turns keys and clicks into the `input` object this steps with).
import {
  ALARM,
  CAMERA,
  COLS,
  CRACK,
  FIELD,
  GUARD,
  LASER,
  LEVELS,
  PLAYER,
  ROWS,
  SCORES,
  STEP,
  TILE,
  TOOLS,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_CRACK = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_COMPLETE = 8;
export const EVENT_ALARM = 16;
export const EVENT_SPOTTED = 32;
export const EVENT_LASER = 64;

const RAY_STEP = 8;
const CONE_RAYS = 24;

/** Tiles the thief can stand on. Crates and walls block; lasers do not. */
function walkable(ch) {
  return ch !== '#' && ch !== 'C';
}

/** Tiles that stop a line of sight. */
function opaque(ch) {
  return ch === '#' || ch === 'C';
}

/** Tiles that hide the thief (unless a watcher is very close). */
function hiding(ch) {
  return ch === 'B' || ch === 'S';
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Parse one level's ASCII map into tiles plus the things standing on it. */
function parseLevel(def) {
  const tiles = [];
  const loot = [];
  let player = null;
  let vault = null;
  let exit = null;
  const safes = [];
  for (let y = 0; y < ROWS; y += 1) {
    const row = def.map[y] ?? '';
    const tilesRow = [];
    for (let x = 0; x < COLS; x += 1) {
      const ch = row[x] ?? '#';
      tilesRow.push(ch);
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (ch === 'P') player = { x: cx, y: cy };
      else if (ch === 'V') vault = { tx: x, ty: y, x: cx, y: cy, cracked: false, progress: 0 };
      else if (ch === 'E') exit = { tx: x, ty: y, x: cx, y: cy };
      else if (ch === 'F') safes.push({ tx: x, ty: y, x: cx, y: cy, cracked: false, progress: 0 });
      else if (ch === 'G') loot.push({ kind: 'gold', tx: x, ty: y, x: cx, y: cy, taken: false });
      else if (ch === 'I') loot.push({ kind: 'intel', tx: x, ty: y, x: cx, y: cy, taken: false });
    }
    tiles.push(tilesRow);
  }
  return { tiles, loot, player, vault, exit, safes };
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    levelName: '',
    par: 0,
    vaultName: '',
    tiles: [],
    loot: [],
    safes: [],
    vault: null,
    exit: null,
    player: { x: 0, y: 0, dirX: 1, dirY: 0, sprinting: false, carrying: 0 },
    guards: [],
    cameras: [],
    smokes: [],
    alarm: 0,
    tripped: false,
    tripTimer: 0,
    time: 0,
    score: 0,
    lootValue: 0,
    intel: 0,
    intelTotal: 0,
    goldTaken: 0,
    goldTotal: 0,
    spotted: false, // currently seen by any watcher
    everSpotted: false,
    status: 'playing', // playing | caught | complete
    laserPhase: 0,
    laserLive: false,
    crackTarget: null, // 'vault' | safe object | null
    message: '',
    messageTimer: 0,
  };

  let noiseCooldown = 0;
  let laserCooldown = 0;

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
    return state.tiles[ty][tx];
  }

  function solidAtPixel(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    return !walkable(tileAt(tx, ty));
  }

  /** Segment sampling line-of-sight: true when nothing opaque is between. */
  function hasLOS(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1);
    const steps = Math.max(1, Math.ceil(d / RAY_STEP));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (opaque(tileAt(Math.floor((x0 + (x1 - x0) * t) / TILE), Math.floor((y0 + (y1 - y0) * t) / TILE)))) return false;
    }
    return true;
  }

  /** The watcher's cone as a polygon (for paint) and a see-test (for rules). */
  function conePoints(x, y, angle, range, halfAngle) {
    const points = [{ x, y }];
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const a = angle - halfAngle + (2 * halfAngle * i) / CONE_RAYS;
      let r = range;
      for (let d = RAY_STEP; d <= range; d += RAY_STEP) {
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (px < 0 || py < 0 || px >= FIELD.width || py >= FIELD.height || opaque(tileAt(Math.floor(px / TILE), Math.floor(py / TILE)))) {
          r = d;
          break;
        }
      }
      points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    return points;
  }

  function inSmoke(x, y) {
    for (const s of state.smokes) {
      if (dist(x, y, s.x, s.y) < s.radius) return true;
    }
    return false;
  }

  function playerHidden() {
    const tx = Math.floor(state.player.x / TILE);
    const ty = Math.floor(state.player.y / TILE);
    return hiding(tileAt(tx, ty)) || inSmoke(state.player.x, state.player.y);
  }

  /** Would watcher at (x,y) facing `angle` see a thief at (px,py)? */
  function watcherSees(x, y, angle, range, halfAngle, px, py, spotRange) {
    const d = dist(x, y, px, py);
    const hidden = playerHidden();
    const maxRange = hidden ? Math.min(range, GUARD.hiddenSpotRange) : range;
    if (d > maxRange) return false;
    if (Math.abs(angleDiff(angleTo(x, y, px, py), angle)) > halfAngle) return false;
    if (hidden && d > GUARD.hiddenSpotRange) return false;
    if (inSmoke(px, py) && d > GUARD.hiddenSpotRange) return false;
    return hasLOS(x, y, px, py);
  }

  function reset(levelIndex) {
    const def = LEVELS[levelIndex] ?? LEVELS[0];
    const parsed = parseLevel(def);
    state.levelIndex = LEVELS.indexOf(def);
    state.levelName = def.name;
    state.par = def.par;
    state.vaultName = def.vault;
    state.tiles = parsed.tiles;
    state.loot = parsed.loot;
    state.safes = parsed.safes;
    state.vault = parsed.vault;
    state.exit = parsed.exit;
    state.player = {
      x: parsed.player?.x ?? TILE * 1.5,
      y: parsed.player?.y ?? TILE * 1.5,
      dirX: 1,
      dirY: 0,
      sprinting: false,
      carrying: 0,
    };
    state.guards = (def.guards ?? []).map((g) => {
      const first = g.waypoints[0];
      return {
        waypoints: g.waypoints,
        wp: 1 % g.waypoints.length,
        x: first[0] * TILE + TILE / 2,
        y: first[1] * TILE + TILE / 2,
        angle: 0,
        speed: g.speed,
        mode: 'patrol', // patrol | suspicious | investigate | chase | return
        spot: 0,
        wait: 0,
        investigateX: 0,
        investigateY: 0,
        lastSeenX: 0,
        lastSeenY: 0,
        loseTimer: 0,
      };
    });
    state.cameras = (def.cameras ?? []).map((c) => ({
      x: c.x * TILE + TILE / 2,
      y: c.y * TILE + TILE / 2,
      base: c.base,
      sweep: c.sweep,
      range: c.range,
      angle: c.base,
      spot: 0,
      disabled: 0,
      phase: random() * Math.PI * 2,
    }));
    state.smokes = [];
    state.alarm = 0;
    state.tripped = false;
    state.tripTimer = 0;
    state.time = 0;
    state.score = 0;
    state.lootValue = 0;
    state.intel = 0;
    state.intelTotal = state.loot.filter((l) => l.kind === 'intel').length;
    state.goldTaken = 0;
    state.goldTotal = state.loot.filter((l) => l.kind === 'gold').length;
    state.spotted = false;
    state.everSpotted = false;
    state.status = 'playing';
    state.laserPhase = 0;
    state.laserLive = false;
    state.crackTarget = null;
    state.message = '';
    state.messageTimer = 0;
    state.smokeLeft = TOOLS.smokeCount;
    state.hackLeft = TOOLS.hackCount;
    noiseCooldown = 0;
    laserCooldown = 0;
  }

  /** Flood fill from the spawn: every objective must be reachable. */
  function validate() {
    const problems = [];
    const seen = new Set();
    const start = [Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)];
    const queue = [start];
    seen.add(start.join(','));
    while (queue.length > 0) {
      const [x, y] = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (!walkable(tileAt(nx, ny))) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    const check = (label, tx, ty) => {
      if (!seen.has(`${tx},${ty}`)) problems.push(`${label} at ${tx},${ty} unreachable`);
    };
    if (state.vault) check('vault', state.vault.tx, state.vault.ty);
    if (state.exit) check('exit', state.exit.tx, state.exit.ty);
    for (const s of state.safes) check('safe', s.tx, s.ty);
    for (const l of state.loot) check(l.kind, l.tx, l.ty);
    for (const g of state.guards) {
      for (const [wx, wy] of g.waypoints) check('guard waypoint', wx, wy);
    }
    if (!state.vault) problems.push('no vault on the map');
    if (!state.exit) problems.push('no exit on the map');
    return problems;
  }

  function moveCircle(entity, dx, dy, radius) {
    // Axis-separated so the thief slides along walls instead of sticking.
    const nx = entity.x + dx;
    if (
      !solidAtPixel(nx + Math.sign(dx) * radius, entity.y - radius + 2) &&
      !solidAtPixel(nx + Math.sign(dx) * radius, entity.y + radius - 2) &&
      !solidAtPixel(nx + Math.sign(dx) * radius, entity.y)
    ) {
      entity.x = clamp(nx, radius, FIELD.width - radius);
    }
    const ny = entity.y + dy;
    if (
      !solidAtPixel(entity.x - radius + 2, ny + Math.sign(dy) * radius) &&
      !solidAtPixel(entity.x + radius - 2, ny + Math.sign(dy) * radius) &&
      !solidAtPixel(entity.x, ny + Math.sign(dy) * radius)
    ) {
      entity.y = clamp(ny, radius, FIELD.height - radius);
    }
  }

  function alertGuards(x, y, reason) {
    for (const g of state.guards) {
      if (g.mode === 'chase') continue;
      if (dist(g.x, g.y, x, y) > CRACK.noiseRadius && reason === 'noise') continue;
      g.mode = 'suspicious';
      g.wait = GUARD.suspiciousTime;
      g.investigateX = x;
      g.investigateY = y;
    }
  }

  function stepGuard(g, dt, events) {
    const p = state.player;
    const sees = watcherSees(g.x, g.y, g.angle, GUARD.sightRange, GUARD.halfAngle, p.x, p.y, GUARD.sightRange);
    if (sees) {
      g.spot = Math.min(1, g.spot + dt / GUARD.spotTime);
      g.lastSeenX = p.x;
      g.lastSeenY = p.y;
      g.loseTimer = 0;
      state.spotted = true;
      state.everSpotted = true;
      if (g.spot >= 1 && g.mode !== 'chase') {
        g.mode = 'chase';
        return EVENT_SPOTTED;
      }
    } else {
      g.spot = Math.max(0, g.spot - dt / (GUARD.spotTime * 1.5));
      if (g.mode === 'chase') {
        g.loseTimer += dt;
        if (g.loseTimer > 2.5) {
          g.mode = 'investigate';
          g.investigateX = g.lastSeenX;
          g.investigateY = g.lastSeenY;
        }
      }
    }

    const faceToward = (x, y, rate) => {
      const target = angleTo(g.x, g.y, x, y);
      const diff = angleDiff(target, g.angle);
      const turn = clamp(diff, -rate * dt, rate * dt);
      g.angle += turn;
    };
    const walkToward = (x, y, speed) => {
      const d = dist(g.x, g.y, x, y);
      if (d < 4) return true;
      const vx = ((x - g.x) / d) * speed * dt;
      const vy = ((y - g.y) / d) * speed * dt;
      moveCircle(g, vx, vy, GUARD.radius);
      g.angle = angleTo(g.x, g.y, x, y);
      return d < speed * dt + 6;
    };

    if (g.mode === 'patrol') {
      const [wx, wy] = g.waypoints[g.wp];
      const tx = wx * TILE + TILE / 2;
      const ty = wy * TILE + TILE / 2;
      const px = g.x;
      const py = g.y;
      if (walkToward(tx, ty, g.speed)) {
        g.wp = (g.wp + 1) % g.waypoints.length;
        g.stuckTimer = 0;
      } else {
        // A patrol leg that runs into furniture would pin the guard there
        // forever; after 1.5 s of no progress, skip to the next waypoint.
        const moved = dist(g.x, g.y, px, py);
        g.stuckTimer = moved < g.speed * dt * 0.5 ? (g.stuckTimer ?? 0) + dt : 0;
        if (g.stuckTimer > 1.5) {
          g.wp = (g.wp + 1) % g.waypoints.length;
          g.stuckTimer = 0;
        }
      }
    } else if (g.mode === 'suspicious') {
      faceToward(g.investigateX, g.investigateY, 4.5);
      g.wait -= dt;
      if (g.wait <= 0) {
        g.mode = 'investigate';
      }
    } else if (g.mode === 'investigate') {
      if (walkToward(g.investigateX, g.investigateY, GUARD.investigateSpeed)) {
        g.wait += dt;
        if (g.wait > GUARD.investigateTime) {
          g.mode = 'return';
          g.wait = 0;
        }
      } else {
        g.wait = 0;
      }
      if (sees && g.spot > 0.4) g.mode = 'chase';
    } else if (g.mode === 'chase') {
      walkToward(g.lastSeenX, g.lastSeenY, GUARD.chaseSpeed);
      if (sees) {
        walkToward(p.x, p.y, GUARD.chaseSpeed);
      }
    } else if (g.mode === 'return') {
      // Walk back to the nearest waypoint, then resume the patrol.
      let best = 0;
      let bestD = Infinity;
      g.waypoints.forEach(([wx, wy], i) => {
        const d = dist(g.x, g.y, wx * TILE + TILE / 2, wy * TILE + TILE / 2);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const [wx, wy] = g.waypoints[best];
      if (walkToward(wx * TILE + TILE / 2, wy * TILE + TILE / 2, g.speed)) {
        g.wp = (best + 1) % g.waypoints.length;
        g.mode = 'patrol';
      }
    }

    // Caught: a guard that can see the thief up close grabs them.
    if (dist(g.x, g.y, p.x, p.y) < GUARD.radius + PLAYER.radius + 2 && hasLOS(g.x, g.y, p.x, p.y) && !inSmoke(p.x, p.y)) {
      state.status = 'caught';
      return EVENT_CAUGHT;
    }
    return events;
  }

  function stepCamera(c, dt) {
    if (c.disabled > 0) {
      c.disabled -= dt;
      return;
    }
    c.angle = c.base + Math.sin(state.time * c.sweep + c.phase) * c.range;
    const p = state.player;
    const sees = watcherSees(c.x, c.y, c.angle, CAMERA.sightRange, CAMERA.halfAngle, p.x, p.y, CAMERA.sightRange);
    if (sees) {
      c.spot = Math.min(1, c.spot + dt / CAMERA.spotTime);
      state.spotted = true;
      state.everSpotted = true;
    } else {
      c.spot = Math.max(0, c.spot - dt / (CAMERA.spotTime * 1.5));
    }
  }

  function step(dt, input) {
    if (state.status !== 'playing') return EVENT_NONE;
    let events = EVENT_NONE;
    state.time += dt;
    state.spotted = false;
    noiseCooldown = Math.max(0, noiseCooldown - dt);
    laserCooldown = Math.max(0, laserCooldown - dt);
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }

    // Lasers (level 3): live half the cycle, dark the other half.
    const def = LEVELS[state.levelIndex];
    if (def.lasers) {
      state.laserPhase = (state.time % (LASER.liveSeconds + LASER.darkSeconds));
      state.laserLive = state.laserPhase < LASER.liveSeconds;
    }

    const p = state.player;

    // --- tools ------------------------------------------------------------
    if (input.smoke && state.smokeLeft > 0) {
      state.smokes.push({ x: p.x, y: p.y, radius: TOOLS.smokeRadius, left: TOOLS.smokeSeconds });
      state.smokeLeft -= 1;
      state.message = 'Smoke out — they lost you.';
      state.messageTimer = 2;
      events |= EVENT_PICKUP;
    }
    if (input.hack && state.hackLeft > 0) {
      let best = null;
      let bestD = 420;
      for (const c of state.cameras) {
        const d = dist(p.x, p.y, c.x, c.y);
        if (d < bestD && c.disabled <= 0) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        best.disabled = CAMERA.hackDuration;
        state.hackLeft -= 1;
        state.message = 'Camera dark for 10 seconds.';
        state.messageTimer = 2;
        events |= EVENT_PICKUP;
      }
    }
    for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
      state.smokes[i].left -= dt;
      if (state.smokes[i].left <= 0) state.smokes.splice(i, 1);
    }

    // --- movement ---------------------------------------------------------
    let mx = 0;
    let my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (mx === 0 && my === 0 && input.clickTarget) {
      const dx = input.clickTarget.x - p.x;
      const dy = input.clickTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        mx = dx / d;
        my = dy / d;
      } else {
        input.clickTarget = null;
      }
    }
    const moving = mx !== 0 || my !== 0;
    if (moving) {
      const len = Math.hypot(mx, my) || 1;
      const slow = Math.min(PLAYER.maxCarrySlow, p.carrying * PLAYER.carrySlow);
      const speed = (input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) - slow;
      p.sprinting = Boolean(input.sprint);
      moveCircle(p, (mx / len) * speed * dt, (my / len) * speed * dt, PLAYER.radius);
      p.dirX = mx / len;
      p.dirY = my / len;
      if (input.sprint && noiseCooldown <= 0) {
        // Sprinting is loud: nearby guards turn toward the noise.
        alertGuards(p.x, p.y, 'noise');
        noiseCooldown = 0.8;
      }
    } else {
      p.sprinting = false;
    }

    // --- lasers -----------------------------------------------------------
    if (state.laserLive) {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      if (tileAt(tx, ty) === 'L' && laserCooldown <= 0) {
        state.alarm = Math.min(100, state.alarm + 30);
        laserCooldown = 1;
        state.message = 'Laser tripped!';
        state.messageTimer = 1.5;
        events |= EVENT_LASER;
      }
    }

    // --- loot -------------------------------------------------------------
    for (const l of state.loot) {
      if (l.taken) continue;
      if (dist(p.x, p.y, l.x, l.y) < 30) {
        l.taken = true;
        if (l.kind === 'gold') {
          state.score += SCORES.gold;
          state.lootValue += SCORES.gold;
          state.goldTaken += 1;
          p.carrying += 1;
          state.message = `Gold +$${SCORES.gold}`;
        } else {
          state.score += SCORES.intel;
          state.lootValue += SCORES.intel;
          state.intel += 1;
          state.message = `Intel +$${SCORES.intel}`;
        }
        state.messageTimer = 1.5;
        events |= EVENT_PICKUP;
      }
    }

    // --- cracking ---------------------------------------------------------
    state.crackTarget = null;
    const crackNear = (thing, seconds) => {
      if (!thing || thing.cracked) return false;
      return dist(p.x, p.y, thing.x, thing.y) < 62;
    };
    let target = null;
    let targetSeconds = 0;
    if (crackNear(state.vault, CRACK.vaultSeconds)) {
      target = state.vault;
      targetSeconds = CRACK.vaultSeconds;
    } else {
      for (const s of state.safes) {
        if (crackNear(s, CRACK.safeSeconds)) {
          target = s;
          targetSeconds = CRACK.safeSeconds;
          break;
        }
      }
    }
    if (target && input.crack) {
      state.crackTarget = target === state.vault ? 'vault' : target;
      target.progress += dt / targetSeconds;
      if (noiseCooldown <= 0) {
        alertGuards(p.x, p.y, 'noise');
        noiseCooldown = 0.8;
      }
      if (target.progress >= 1) {
        target.cracked = true;
        target.progress = 0;
        if (target === state.vault) {
          state.score += SCORES.vault;
          state.lootValue += SCORES.vault;
          state.message = `${state.vaultName} cracked! Get to the van!`;
          state.messageTimer = 3;
        } else {
          state.score += SCORES.safe;
          state.lootValue += SCORES.safe;
          state.message = `Safe cracked +$${SCORES.safe}`;
          state.messageTimer = 2;
        }
        events |= EVENT_CRACK;
      }
    } else if (target) {
      // Cracking cools off when you let go.
      target.progress = Math.max(0, target.progress - dt / (targetSeconds * 2));
    }

    // --- watchers ---------------------------------------------------------
    for (const g of state.guards) {
      events = stepGuard(g, dt, events) | events;
      if (state.status === 'caught') return events;
    }
    for (const c of state.cameras) stepCamera(c, dt);

    // --- alarm ------------------------------------------------------------
    const anySpot = state.guards.some((g) => g.spot > 0.15) || state.cameras.some((c) => c.spot > 0.15);
    if (state.spotted || anySpot) {
      state.alarm = Math.min(100, state.alarm + ALARM.risePerSecond * dt);
    } else if (!state.tripped) {
      state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
    }
    if (state.alarm >= 100 && !state.tripped) {
      state.tripped = true;
      state.tripTimer = ALARM.tripSeconds;
      for (const g of state.guards) {
        g.mode = 'chase';
        g.lastSeenX = p.x;
        g.lastSeenY = p.y;
      }
      state.message = 'ALARM! Every guard is hunting you!';
      state.messageTimer = 3;
      events |= EVENT_ALARM;
    }
    if (state.tripped) {
      state.tripTimer -= dt;
      state.alarm = Math.max(ALARM.standDownBelow, state.alarm - (ALARM.decayPerSecond * 0.4) * dt);
      if (state.tripTimer <= 0 || state.alarm <= ALARM.standDownBelow) {
        state.tripped = false;
        state.alarm = Math.min(state.alarm, ALARM.standDownBelow);
        for (const g of state.guards) {
          if (g.mode === 'chase') g.mode = 'return';
        }
      }
    }

    // --- exit -------------------------------------------------------------
    if (state.vault?.cracked && state.exit && dist(p.x, p.y, state.exit.x, state.exit.y) < 40) {
      const timeBonus = Math.max(0, Math.round((state.par - state.time) * SCORES.timePerSecond));
      const ghost = state.everSpotted ? 0 : SCORES.ghostBonus;
      state.score += timeBonus + ghost;
      state.status = 'complete';
      state.timeBonus = timeBonus;
      state.ghostBonus = ghost;
      state.stars = ghost > 0 ? 3 : timeBonus > 0 ? 2 : 1;
      return events | EVENT_COMPLETE;
    }
    return events;
  }

  reset(0);

  return {
    state,
    reset,
    step,
    validate,
    tileAt,
    hasLOS,
    conePoints,
    watcherSees,
    inSmoke,
    playerHidden,
    STEP,
  };
}
