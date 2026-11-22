# Halcyon Heist

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/renprayoga/best-heist-game-20261122-0559/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/renprayoga/best-heist-game-20261122-0559/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**Halcyon Heist** is an original top-down heist game that runs offline in a
desktop browser from static files — no network requests, no libraries, no
build step. Slip past the patrols, crack the vault, and reach the getaway
van — unseen, for the Ghost bonus.

Three hand-built floors, all art drawn procedurally on canvas and all
sound synthesized with WebAudio (nothing copied from any commercial game):
**The Gallery** (3 guards + 1 camera), **The Vault Floor** (4 guards +
2 cameras), and **The Neon Rooftop** (5 guards + 3 cameras + a laser
grid that goes live half the time). Guards patrol with raycast vision
cones that stop at walls and crates; cameras sweep their own cones; a
detection meter fills when you are seen, and a full alarm sends every
guard hunting. Crates block sight, potted plants and shadow rugs hide you
(a guard only spots you up close there), smoke pellets (Q) break line of
sight, and hacks (H) darken a camera for 10 seconds. Sprinting is loud —
nearby guards turn toward the noise — and cracking a safe or the vault is
loud too. Gold slows you down the more you carry; a Ghost run (never
spotted) pays $500.

Score comes from loot, a time bonus against each floor's par, and the
Ghost bonus; each floor rates you 1–3 stars.

## Controls

- **WASD / arrows** — move · **Shift** — sprint (loud!) · **Click** — walk there
- **E (hold)** — crack the vault / a safe · **Q** — smoke pellet · **H** — hack a camera
- **P** pause · **M** mute · **R** restart level · **Enter** start / next level

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or hand it in the way the bounty does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Files

- `game/` — the playable game as static files (`index.html` + ES modules
  under `game/src/`: `config.js` levels and tuning, `world.js` simulation,
  `render.js` canvas drawing, `input.js` keyboard + mouse, `audio.js`
  synthesized sound, `shots.js` deterministic screenshot scenes)
- `screenshots/` — 4 real renders of the game's own code (headless Chrome,
  1280×800): the cover mid-heist, the title screen, a full-alarm moment on
  The Vault Floor, and a cleared floor
- `main.ts` — the Node 22 entrypoint that writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
