// The screenshot scenes behind ?shot=start|play|alert|complete. Each one
// plays the real rules forward from a fresh world, steered by a simple
// autopilot (head for the vault, crack it, then run for the van; step aside
// when a cone is about to sweep over the next tile), so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { CAMERA, COLS, GUARD, PLAYER, ROWS, STEP, TILE } from './config.js';
import { EVENT_COMPLETE } from './world.js';
import { SCREEN_COMPLETE, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function dangerAt(world, x, y) {
  const state = world.state;
  let danger = 0;
  for (const g of state.guards) {
    const d = Math.hypot(g.x - x, g.y - y);
    if (d < GUARD.sightRange + 20 && world.watcherSees(g.x, g.y, g.angle, GUARD.sightRange, GUARD.halfAngle, x, y, GUARD.sightRange)) {
      danger += g.mode === 'chase' ? 100 : 10 + (1 - d / GUARD.sightRange) * 20;
    }
    // Close is only dangerous when the guard faces the tile (or is already
    // hunting): walking behind a guard's back is the whole game.
    const facing = Math.abs(((Math.atan2(y - g.y, x - g.x) - g.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < 70 && (g.mode === 'chase' || facing < 1.2)) danger += 30;
  }
  for (const c of state.cameras) {
    if (c.disabled > 0) continue;
    if (world.watcherSees(c.x, c.y, c.angle, CAMERA.sightRange, CAMERA.halfAngle, x, y, CAMERA.sightRange)) {
      danger += 25;
    }
  }
  return danger;
}

function tileWalkable(world, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const ch = world.tileAt(tx, ty);
  return ch !== '#' && ch !== 'C';
}

/**
 * Breadth-first search over walkable tiles: the list of tile centres on the
 * shortest route from (tx0,ty0) to (tx1,ty1), or null when unreachable.
 * The thief's straight-line steering gets stuck on the interior walls, so
 * the autopilot routes tile by tile instead.
 */
function bfsPath(world, tx0, ty0, tx1, ty1) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map();
  const queue = [[tx0, ty0]];
  prev.set(key(tx0, ty0), null);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x === tx1 && y === ty1) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const ch = world.tileAt(nx, ny);
      if (ch === '#' || ch === 'C') continue;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      prev.set(k, [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx1, ty1))) return null;
  const path = [];
  let cur = [tx1, ty1];
  for (;;) {
    path.unshift({ x: cur[0] * TILE + TILE / 2, y: cur[1] * TILE + TILE / 2 });
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) break;
    cur = p;
  }
  return path.slice(1); // drop the tile the thief already stands on
}

/** One autopilot decision: the input the thief should hold this step. */
function autopilot(world, mode = 'cautious') {
  const state = world.state;
  const p = state.player;
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    crack: false,
    smoke: false,
    hack: false,
    clickTarget: null,
  };
  // Bold mode never stops to crack: it touches the vault, then runs for
  // the van straight through the cones — that is what the alert scene wants.
  const touchedVault =
    state.vault?.cracked ||
    (mode === 'bold' && state.vault && Math.hypot(state.vault.x - p.x, state.vault.y - p.y) < 58);
  const target = touchedVault ? state.exit : state.vault;
  if (!target) return input;
  const dTarget = Math.hypot(target.x - p.x, target.y - p.y);
  if (mode === 'cautious' && !state.vault.cracked && dTarget < 58) {
    // Cracking is loud and takes three seconds standing still: only start
    // it when no guard is close enough to walk in on the job.
    const guardNear = state.guards.some((g) => Math.hypot(g.x - state.vault.x, g.y - state.vault.y) < 200);
    if (guardNear) return input;
    input.crack = true;
    return input;
  }
  if (state.vault.cracked && dTarget < 36) return input;
  // When the alarm is tripped, run for the van and ignore the cones.
  if (state.tripped) {
    input.sprint = true;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.abs(dx) > 8) input[dx > 0 ? 'right' : 'left'] = true;
    if (Math.abs(dy) > 8) input[dy > 0 ? 'down' : 'up'] = true;
    return input;
  }
  const setDir = (dx, dy) => {
    if (dx > 0) input.right = true;
    if (dx < 0) input.left = true;
    if (dy > 0) input.down = true;
    if (dy < 0) input.up = true;
  };
  // Spotted: break line of sight first — run away from the watcher that
  // sees the thief, sprinting, until the cone loses them. (Bold mode walks
  // straight through the cones instead: that is what the alert scene wants.)
  if (mode === 'cautious' && state.spotted) {
    let wx = 0;
    let wy = 0;
    let found = false;
    for (const g of state.guards) {
      if (g.spot > 0.2) {
        wx = g.x;
        wy = g.y;
        found = true;
        break;
      }
    }
    if (!found) {
      for (const c of state.cameras) {
        if (c.spot > 0.2) {
          wx = c.x;
          wy = c.y;
          found = true;
          break;
        }
      }
    }
    if (found) {
      const dx = p.x - wx;
      const dy = p.y - wy;
      const len = Math.hypot(dx, dy) || 1;
      input.sprint = true;
      setDir(dx / len, dy / len);
      return input;
    }
  }
  // Steer toward the first route node that is still ahead of the thief
  // (not the one under their feet: steering at a point a few pixels away
  // makes the thief jitter back and forth instead of walking on).
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  const ttx = Math.floor(target.x / TILE);
  const tty = Math.floor(target.y / TILE);
  const path = bfsPath(world, tx, ty, ttx, tty);
  let steer = target;
  if (path && path.length > 0) {
    steer = path[path.length - 1];
    for (const node of path) {
      if (Math.hypot(node.x - p.x, node.y - p.y) > 30) {
        steer = node;
        break;
      }
    }
  }
  const dSteer = Math.hypot(steer.x - p.x, steer.y - p.y);
  if (mode === 'bold') {
    // Greedy: straight at the route node, danger be damned.
    if (Math.abs(steer.x - p.x) > 8) input[steer.x > p.x ? 'right' : 'left'] = true;
    if (Math.abs(steer.y - p.y) > 8) input[steer.y > p.y ? 'down' : 'up'] = true;
    return input;
  }
  // Otherwise: among directions safe enough to stand in, take the one that
  // makes the most progress toward the route node; when nothing is safe,
  // take the least dangerous direction that still moves toward it. Close to
  // the vault the thief commits instead of dithering.
  const commit = dTarget < 160 ? 8 : 3;
  let best = null;
  let bestSafe = -Infinity;
  let bestRisky = -Infinity;
  let bestRiskyDir = null;
  let bestRiskyDanger = 0;
  for (const [dx, dy] of DIRS) {
    // A short lookahead (0.12 s): a longer one lands inside the wall next
    // to the thief and wrongly rules out the only way forward.
    const nx = p.x + dx * PLAYER.walkSpeed * 0.12;
    const ny = p.y + dy * PLAYER.walkSpeed * 0.12;
    if (!tileWalkable(world, nx, ny)) continue;
    const danger = dangerAt(world, nx, ny);
    const progress = ((steer.x - p.x) * dx + (steer.y - p.y) * dy) / (dSteer || 1);
    if (danger < 8 && progress * commit > bestSafe) {
      bestSafe = progress * commit;
      best = [dx, dy];
    }
    const risky = progress * commit - danger;
    if (progress > 0.2 && risky > bestRisky) {
      bestRisky = risky;
      bestRiskyDir = [dx, dy];
      bestRiskyDanger = danger;
    }
  }
  // A safe direction only counts when it actually moves toward the goal;
  // otherwise the thief shuffles sideways forever instead of taking the
  // risky-but-necessary step through a patrol lane. When even the risky
  // step runs through a live cone, the thief waits for the patrol to pass
  // instead of walking into the guard.
  if (best !== null && bestSafe > 0.5) {
    setDir(best[0], best[1]);
    return input;
  }
  if (bestRiskyDir && bestRiskyDanger <= 20) {
    setDir(bestRiskyDir[0], bestRiskyDir[1]);
  }
  return input;
}

function runFor(world, seconds, stopWhen, mode = 'cautious') {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, autopilot(world, mode));
    if (stopWhen && stopWhen(world, events)) return { stopped: true, steps: i };
    if (world.state.status !== 'playing') return { stopped: true, steps: i };
  }
  return { stopped: false, steps };
}

/**
 * Set `world` to the named scene and return the screen to draw over it
 * and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'start') {
    world.reset(0);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'alert') {
    world.reset(1);
    // Bold mode walks straight through the cones, so the alarm climbs fast;
    // freeze the moment it is properly raised, before anyone grabs the thief.
    const result = runFor(world, 90, (w) => w.state.alarm >= 65, 'bold');
    window.__shotNote = `alert: alarm ${Math.round(world.state.alarm)}% status ${world.state.status} after ${result.steps} steps`;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'complete') {
    world.reset(0);
    const result = runFor(world, 400, (w, events) => Boolean(events & EVENT_COMPLETE));
    window.__shotNote = `complete: status ${world.state.status} after ${result.steps} steps, score ${world.state.score}`;
    if (world.state.status === 'complete') {
      return { screen: SCREEN_COMPLETE, best: world.state.score };
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // play: the cover — crack the vault, then freeze a few seconds into the
  // run for the van, cones sweeping and the alarm meter showing.
  world.reset(0);
  runFor(world, 120, (w) => w.state.vault?.cracked);
  runFor(world, 4, null);
  window.__shotNote = `play: vault cracked=${world.state.vault?.cracked} alarm=${Math.round(world.state.alarm)}% time=${world.state.time.toFixed(1)}`;
  return { screen: SCREEN_PLAY, best: 0 };
}
