# {repo}

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/{owner}/{repo}/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/{owner}/{repo}/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Shardstorm is an original neon arena-survival game for the desktop browser, written in
plain ES modules with no library and no build step. You pilot the last shard-ship against
a swarm that pours in for four minutes: dodge Motes, Darts, Splitters and Brutes, harvest
the shards they drop, and spend each level-up on one of three cards — new weapons (Seeker
Sparks, Orbit Blades, Pulse Nova, each with five levels) or cores that make the ship
faster, tougher and greedier. Kill streaks raise a combo multiplier; elites carry five
times the shards. At 3:20 the Hollow Star arrives, spitting star-bolts and spawning
Motes — break it to win, or fall and scatter. It plays with keyboard (WASD/arrows, Space
to dash, P to pause, M to mute) or mouse (hold to steer, click the cards), keeps its best
score, and makes every sound — effects and the synth score alike — in code with WebAudio.
Title, HUD, level-up choice, pause, victory and game-over screens are all in the game;
the screenshots in `screenshots/` are staged by the game's own autopilot flying the real
rules (`game/src/shots.js`).

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080
# or hand it in (what the grader runs):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
