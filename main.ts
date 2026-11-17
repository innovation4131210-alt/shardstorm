// Shardstorm — handover program for the best-game-01 entry.
//
// The game itself is the static site under game/ (open game/index.html in a
// desktop browser; it runs fully offline, no libraries, no network). This
// program is what the grader runs: it sanity-checks the entry, copies game/
// and screenshots/ into the output directory and writes dossier.json there
// with the vendored make.fun library, which is the summary the judge reads.
//
// Local run (MAKEFUN_OUTPUT_DIR stands in for the grader's /output):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with: node serve.ts  (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// --- Pre-flight checks -------------------------------------------------------
// Fail loudly here rather than hand the grader a broken entry: the game must
// have its entry page, and the screenshots must sit inside the scorer's caps
// (3 or 4 shots, each at most 256 KiB) before anything is copied.
const gameDir = join(repoDir, 'game');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: the entry has no game to hand in');
}

const shotsDir = join(repoDir, 'screenshots');
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const bytes = statSync(join(shotsDir, name)).size;
  if (bytes > 262144) throw new Error(`screenshot ${name} is ${bytes} bytes, over the 256 KiB cap`);
}

// --- Handover ----------------------------------------------------------------
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

// The caps below are the scorer's own (reference/gate.json): text_max_bytes
// shapes the dossier text; the rest refuse an entry the scorer would refuse
// (too many or too large screenshots, too many game files, an over-long path).
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(
  `shardstorm: handed in game/ and ${shotNames.length} screenshots; dossier.json is ${dossier.length} bytes`,
);
