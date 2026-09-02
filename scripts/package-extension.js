#!/usr/bin/env node
'use strict';

/**
 * Builds store ZIPs with manifest.json at the archive root.
 *
 * Usage:
 *   node scripts/package-extension.js           # chrome + firefox
 *   node scripts/package-extension.js chrome
 *   node scripts/package-extension.js firefox
 *
 * Steps per target:
 * 1. Clean dist/<target>/
 * 2. Copy production files
 * 3. Copy target prod manifest → dist/<target>/manifest.json
 * 4. Validate dist/<target>/
 * 5. Zip contents of dist/<target>/ (not the folder itself)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_ROOT = path.join(ROOT, 'dist');
const BUILDS = path.join(ROOT, 'builds');

const TARGETS = {
  chrome: {
    name: 'chrome',
    prodManifest: 'manifest.prod.json',
    zipPrefix: 'better-easy-dots-chrome',
  },
  firefox: {
    name: 'firefox',
    prodManifest: 'manifest.firefox.prod.json',
    zipPrefix: 'better-easy-dots-firefox',
  },
};

const FILES = [
  'browser-compat.js',
  'background.js',
  'changelog.js',
  'changelog.html',
  'changelog.css',
  'config.js',
  'i18n.js',
  'settings.js',
  'settings-ui.js',
  'settings-ui.css',
  'settings.html',
  'settings-page.js',
  'settings-page.css',
  'content.js',
  'content.css',
  'pending-requests-impact.js',
  'eed-animations.css',
  'eed-waves.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'LICENSE',
];

const DIRS = ['_locales', 'icons'];

function fail(message) {
  console.error(`ERRO ${message}`);
  process.exit(1);
}

function resolveTargets() {
  const arg = (process.argv[2] || '').trim().toLowerCase();
  if (!arg) return Object.keys(TARGETS);
  if (arg === 'all') return Object.keys(TARGETS);
  if (!TARGETS[arg]) {
    fail(`alvo inválido "${arg}". Use: chrome | firefox | all`);
  }
  return [arg];
}

function readProdVersion(prodManifestRel) {
  const manifestPath = path.join(ROOT, prodManifestRel);
  if (!fs.existsSync(manifestPath)) fail(`${prodManifestRel} não encontrado`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.version) fail(`version ausente em ${prodManifestRel}`);
  return String(manifest.version);
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function listFiles(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) listFiles(full, base, out);
    else out.push(rel);
  }
  return out.sort();
}

function packageTarget(targetKey) {
  const target = TARGETS[targetKey];
  const version = readProdVersion(target.prodManifest);
  const dist = path.join(DIST_ROOT, target.name);
  const outZip = path.join(BUILDS, `${target.zipPrefix}-v${version}.zip`);

  console.log(`Empacotando Better Easy Dots (${target.name}) v${version}…`);

  rmrf(dist);
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(BUILDS, { recursive: true });

  copyFile(path.join(ROOT, target.prodManifest), path.join(dist, 'manifest.json'));

  for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) fail(`arquivo obrigatório ausente: ${file}`);
    copyFile(src, path.join(dist, file));
  }

  for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) fail(`pasta obrigatória ausente: ${dir}`);
    copyDir(src, path.join(dist, dir));
  }

  const validate = spawnSync(
    process.execPath,
    [path.join(__dirname, 'validate-extension-package.js'), dist, target.name],
    { stdio: 'inherit' }
  );
  if (validate.status !== 0) {
    fail(`validação falhou (${target.name}) — ZIP não gerado`);
  }

  if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

  const zip = spawnSync('zip', ['-r', outZip, '.', '-x', '*.DS_Store'], {
    cwd: dist,
    stdio: 'inherit',
  });
  if (zip.status !== 0) fail(`falha ao criar ZIP (${target.name})`);

  const list = spawnSync('unzip', ['-Z1', outZip], { encoding: 'utf8' });
  if (list.status !== 0) fail(`não foi possível listar o ZIP (${target.name})`);
  const names = list.stdout.split('\n').filter(Boolean);
  if (!names.includes('manifest.json')) {
    fail(`ZIP inválido (${target.name}): manifest.json não está na raiz do arquivo`);
  }
  if (names.some((n) => n.startsWith('better-easy-dots/'))) {
    fail(`ZIP inválido (${target.name}): conteúdo aninhado em better-easy-dots/`);
  }
  if (names.some((n) => n.startsWith('dist/'))) {
    fail(`ZIP inválido (${target.name}): conteúdo aninhado em dist/`);
  }

  const included = listFiles(dist);
  console.log('');
  console.log(`ZIP criado: ${outZip}`);
  console.log(`Arquivos incluídos (${included.length}):`);
  for (const file of included) console.log(`  - ${file}`);
  console.log('');
}

function main() {
  const targets = resolveTargets();
  for (const key of targets) {
    packageTarget(key);
  }
}

main();
