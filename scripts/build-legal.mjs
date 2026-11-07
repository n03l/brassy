// Runs after `vite build`. Makes the deployed site satisfy the AGPL and the third-party licences:
//   dist/LICENSE.txt                the AGPL text
//   dist/THIRD-PARTY-NOTICES.txt    licences of everything bundled into the site
//   dist/brassy-source.zip          Corresponding Source of this app (what the About page links to)
// No dependencies: a tiny zip writer + node:zlib.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('Run vite build first');

/* ---------- licence text ---------- */
writeFileSync(join(dist, 'LICENSE.txt'), readFileSync(join(root, 'LICENSE')));

/* ---------- third-party notices ---------- */
// Packages whose code or assets end up in dist/ (app bundle, service worker, fonts, SoundFont).
const bundled = [
  'react', 'react-dom', 'scheduler', 'idb', '@coderline/alphatab', '@fontsource/baloo-2', '@fontsource/nunito',
  'workbox-window', 'workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies',
];
const pkgDir = (name) => join(root, 'node_modules', ...name.split('/'));
const licenceFile = (dir) => readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
const parts = [
  'Brassy — third-party notices',
  '',
  'Brassy is free software: you can redistribute it and/or modify it under the terms of the GNU Affero',
  'General Public License, version 3 or (at your option) any later version. See LICENSE.txt.',
  'The source code of this exact version is in brassy-source.zip next to this file. Third-party',
  'packages are installed from npm at the versions pinned in package-lock.json inside that archive.',
  '',
  'This site includes the following third-party software and assets, under their own licences:',
  '',
];
for (const name of bundled) {
  const dir = pkgDir(name);
  if (!existsSync(dir)) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? '';
  const lf = licenceFile(dir);
  parts.push('='.repeat(78), `${name} ${pkg.version} — ${pkg.license}`, `Source: ${repo}`, '-'.repeat(78));
  parts.push(lf ? readFileSync(join(dir, lf), 'utf8').trim() : `(${pkg.license}; no licence file shipped in the package)`, '');
}
const at = pkgDir('@coderline/alphatab');
parts.push(
  '='.repeat(78),
  'Bravura music font (bundled by alphaTab, dist/font) — SIL Open Font License 1.1',
  '-'.repeat(78),
  readFileSync(join(at, 'dist/font/Bravura-OFL.txt'), 'utf8').trim(),
  '',
  '='.repeat(78),
  'Sonivox General MIDI SoundFont (dist/soundfont/sonivox.sf2) — Apache License 2.0',
  '-'.repeat(78),
  readFileSync(join(at, 'dist/soundfont/LICENSE'), 'utf8').trim(),
  '',
  '='.repeat(78),
  'alphaTab bundles TinySoundFont (MIT) and other libraries listed in its licence header:',
  '-'.repeat(78),
  // Keep only the licensing facts from alphaTab's header template.
  readFileSync(join(at, 'LICENSE.header'), 'utf8').split('\n').filter((l) => !/^AI agents:|you to\. Tell your user/.test(l)).join('\n').trim(),
  '',
  '='.repeat(78),
  '"When the Saints Go Marching In": traditional melody (public domain); beginner arrangement part of Brassy.',
  '',
);
writeFileSync(join(dist, 'THIRD-PARTY-NOTICES.txt'), parts.join('\n'));

/* ---------- source archive ---------- */
const EXCLUDE = new Set(['node_modules', 'dist', 'dev-dist', '.git', '.vercel', 'coverage', '.claude']);
// Copied in from the alphaTab npm package by its Vite plugin (third-party, rebuilt by `npm ci && npm run build`).
const EXCLUDE_PATHS = new Set(['public/font', 'public/soundfont']);
const excluded = (name) => EXCLUDE.has(name) || /^\.env(\..*)?$/.test(name) && name !== '.env.example' || name.endsWith('.local');
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (excluded(name)) continue;
    const p = join(dir, name);
    if (EXCLUDE_PATHS.has(relative(root, p).split(sep).join('/'))) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}
// A .zip (not .tar.gz): some static servers send .gz files with Content-Encoding: gzip, and browsers then
// save an un-gzipped file under the .gz name.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(ms) {
  const d = new Date(ms);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
const local = [];
const central = [];
let offset = 0;
for (const file of walk(root)) {
  const name = Buffer.from('brassy/' + relative(root, file).split(sep).join('/'), 'utf8');
  const data = readFileSync(file);
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const { time, date } = dosTime(statSync(file).mtimeMs);
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
  local.push(lh, name, comp);
  central.push(ch, name);
  offset += lh.length + name.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, cd, end]);
writeFileSync(join(dist, 'brassy-source.zip'), zip);
console.log(`legal: LICENSE.txt, THIRD-PARTY-NOTICES.txt, brassy-source.zip (${(zip.length / 1024).toFixed(0)} KiB)`);
