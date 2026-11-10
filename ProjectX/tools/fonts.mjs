// Downloads the two game fonts once (latin subset) so the installed apps work fully offline.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts'); mkdirSync(out, { recursive: true });
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const css = execSync(`curl -sS -A "${ua}" "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Saira+Condensed:wght@600;800&display=swap"`, { encoding: 'utf8' });
let n = 0, res = '';
for (const m of css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[^}]*\})/g)) {
  if (m[1] !== 'latin') continue;
  const url = m[2].match(/url\((https:[^)]+)\)/)[1], file = `f${n++}.woff2`;
  execSync(`curl -sS -o "${join(out, file)}" "${url}"`); res += m[2].replace(url, file) + '\n';
}
writeFileSync(join(out, 'fonts.css'), res); console.log('fonts', n);
