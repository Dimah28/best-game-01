# best-game-01

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Dimah28/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Dimah28/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Tidekeeper** — a tower defence on a living reef. Tide creatures march along a sand
channel from the open sea; you are the Keeper. Build Coral Shooters, Frost Kelp and
Cannon Anemones on the reef, upgrade them, spend gold wisely, and hold the reef for
15 waves. Boss Leviathans ride waves 5, 10 and 15. Leaks cost lives — lose all 20
and the reef falls.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network request — plain static
files (Node 22 serves `game/`).

## How to play

- **Build** — click a reef tile, or press `1` / `2` / `3` to pick a tower, then click
  a tile. Coral Shooter (◉ 50) fires fast darts, Frost Kelp (◉ 75) chills and slows,
  Cannon Anemone (◉ 120) lobs splash shells.
- **Upgrade / sell** — click one of your towers to see its stats, upgrade it with
  `U` (up to level 3) or sell it with `X` for a 70% refund.
- **Waves** — press `W` or Space to call the next wave early and bank bonus gold.
  Kills pay bounties, clearing a wave pays a bonus. Survive all 15 waves to win.
- **Pause / mute** — `P` pauses, `M` mutes the generative WebAudio sound effects.
- Best score is kept in your browser (localStorage).

## Shots

`shots.json` stages four deterministic scenes (`?shot=start|play|boss|win&seed=1`):
the title screen, a mid-game fight, the wave-5 Leviathan, and the victory screen.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
