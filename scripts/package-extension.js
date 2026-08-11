#!/usr/bin/env node
'use strict';

/**
 * Builds a Chrome Web Store ZIP with manifest.json at the archive root.
 *
 * Steps:
 * 1. Clean dist/
 * 2. Copy production files
 * 3. Copy manifest.prod.json → dist/manifest.json
 * 4. Validate dist/
 * 5. Zip contents of dist/ (not the dist folder itself)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUILDS = path.join(ROOT, 'builds');

const FILES = [
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

function readProdVersion() {
  const manifestPath = path.join(ROOT, 'manifest.prod.json');
  if (!fs.existsSync(manifestPath)) fail('manifest.prod.json não encontrado');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.version) fail('version ausente em manifest.prod.json');
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

function main() {
  const version = readProdVersion();
  const outZip = path.join(BUILDS, `better-easy-dots-v${version}.zip`);

  console.log(`Empacotando Better Easy Dots v${version}…`);

  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(BUILDS, { recursive: true });

  copyFile(path.join(ROOT, 'manifest.prod.json'), path.join(DIST, 'manifest.json'));

  for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) fail(`arquivo obrigatório ausente: ${file}`);
    copyFile(src, path.join(DIST, file));
  }

  for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) fail(`pasta obrigatória ausente: ${dir}`);
    copyDir(src, path.join(DIST, dir));
  }

  const validate = spawnSync(
    process.execPath,
    [path.join(__dirname, 'validate-extension-package.js'), DIST],
    { stdio: 'inherit' }
  );
  if (validate.status !== 0) {
    fail('validação falhou — ZIP não gerado');
  }

  if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

  const zip = spawnSync('zip', ['-r', outZip, '.', '-x', '*.DS_Store'], {
    cwd: DIST,
    stdio: 'inherit',
  });
  if (zip.status !== 0) fail('falha ao criar ZIP (comando zip)');

  // Confirm archive root has manifest.json (not nested folder)
  const list = spawnSync('unzip', ['-Z1', outZip], { encoding: 'utf8' });
  if (list.status !== 0) fail('não foi possível listar o ZIP');
  const names = list.stdout.split('\n').filter(Boolean);
  if (!names.includes('manifest.json')) {
    fail('ZIP inválido: manifest.json não está na raiz do arquivo');
  }
  if (names.some((n) => n.startsWith('better-easy-dots/'))) {
    fail('ZIP inválido: conteúdo aninhado em better-easy-dots/');
  }
  if (names.some((n) => n.startsWith('dist/'))) {
    fail('ZIP inválido: conteúdo aninhado em dist/');
  }

  const included = listFiles(DIST);
  console.log('');
  console.log(`ZIP criado: ${outZip}`);
  console.log(`Arquivos incluídos (${included.length}):`);
  for (const file of included) console.log(`  - ${file}`);
}

main();
