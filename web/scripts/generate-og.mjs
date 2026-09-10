import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const out = resolve('public/og.png');
const svg = resolve('.og.svg');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#081018"/>
  <text x="128" y="250" fill="#3AD6EC" font-family="monospace" font-size="76" font-weight="700">screenproof</text>
  <text x="128" y="326" fill="#EAF6FA" font-family="monospace" font-size="25">Browser-only App Store screenshot and app-preview inspector.</text>
  <text x="128" y="370" fill="#8AA3AE" font-family="monospace" font-size="25">Runs locally, never uploads your files.</text>
  <text x="128" y="490" fill="#5FD38A" font-family="monospace" font-size="24">✓ LOCAL-FIRST  ·  READY TO PROOF</text>
</svg>`);
execFileSync('convert', ['-font', '/System/Library/Fonts/Menlo.ttc', svg, '-background', '#081018', '-resize', '1200x630!', out], { stdio: 'inherit' });
rmSync(svg);
console.log(`Generated ${out}`);
