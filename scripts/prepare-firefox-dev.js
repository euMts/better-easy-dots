#!/usr/bin/env node
'use strict';

/**
 * Prepares a Firefox-only folder for about:debugging temporary load.
 *
 * IMPORTANT: Firefox ignores the selected filename and always loads
 * manifest.json from that directory. Never load from the repo root
 * (that picks Chrome's manifest.json with service_worker).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIRS = [
  path.join(ROOT, 'dist', 'firefox-dev'),
  path.join(ROOT, 'load-in-firefox'),
];

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

function prepareOut(OUT) {
  const srcManifest = path.join(ROOT, 'manifest.firefox.json');
  if (!fs.existsSync(srcManifest)) {
    console.error('ERRO manifest.firefox.json não encontrado');
    process.exit(1);
  }

  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  copyFile(srcManifest, path.join(OUT, 'manifest.json'));

  for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) {
      console.error(`ERRO arquivo obrigatório ausente: ${file}`);
      process.exit(1);
    }
    copyFile(src, path.join(OUT, file));
  }

  for (const dir of DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) {
      console.error(`ERRO pasta obrigatória ausente: ${dir}`);
      process.exit(1);
    }
    copyDir(src, path.join(OUT, dir));
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  if (!manifest.background?.scripts?.length) {
    console.error('ERRO pacote Firefox sem background.scripts');
    process.exit(1);
  }
  if (manifest.background?.service_worker) {
    console.error('ERRO pacote Firefox não deve ter background.service_worker');
    process.exit(1);
  }

  const validate = spawnSync(
    process.execPath,
    [path.join(__dirname, 'validate-extension-package.js'), OUT, 'firefox'],
    { stdio: 'inherit' }
  );
  if (validate.status !== 0) {
    console.error(`ERRO validação falhou: ${OUT}`);
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(OUT, 'README-LOAD.txt'),
    [
      'Load Temporary Add-on in Firefox:',
      '1. about:debugging#/runtime/this-firefox',
      '2. Load Temporary Add-on…',
      '3. Select THIS folder\'s manifest.json (or any file in THIS folder)',
      '',
      'Do NOT select files from the repo root — Firefox always uses',
      'manifest.json in the chosen directory, and the root one is Chrome.',
      '',
    ].join('\n'),
    'utf8'
  );
}

function main() {
  for (const out of OUT_DIRS) {
    prepareOut(out);
    console.log(`OK ${out}`);
  }
  console.log('');
  console.log('Firefox → about:debugging → Carregar complemento temporário');
  console.log('Selecione: load-in-firefox/manifest.json');
  console.log('(qualquer arquivo DENTRO de load-in-firefox/ — nunca a raiz do repo)');
}

main();
