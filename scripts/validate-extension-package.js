#!/usr/bin/env node
'use strict';

/**
 * Validates a Chrome extension package directory (or extracted ZIP root).
 * Usage:
 *   node scripts/validate-extension-package.js [dir]
 * Default dir: ./dist  (falls back to repo root if dist/manifest.json is missing)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const DEFAULT_DIST = path.join(ROOT, 'dist');

function resolveTargetDir() {
  if (argDir) return argDir;
  if (fs.existsSync(path.join(DEFAULT_DIST, 'manifest.json'))) return DEFAULT_DIST;
  return ROOT;
}

function existsFile(dir, rel) {
  const full = path.join(dir, rel);
  try {
    return fs.statSync(full).isFile();
  } catch {
    return false;
  }
}

function existsDir(dir, rel) {
  const full = path.join(dir, rel);
  try {
    return fs.statSync(full).isDirectory();
  } catch {
    return false;
  }
}

function collectManifestRefs(manifest) {
  const refs = new Set();

  const sw = manifest?.background?.service_worker;
  if (sw) refs.add(sw);

  if (manifest?.action?.default_popup) refs.add(manifest.action.default_popup);
  if (manifest?.options_page) refs.add(manifest.options_page);
  if (manifest?.options_ui?.page) refs.add(manifest.options_ui.page);

  for (const iconPath of Object.values(manifest?.icons || {})) {
    if (iconPath) refs.add(iconPath);
  }
  for (const iconPath of Object.values(manifest?.action?.default_icon || {})) {
    if (iconPath) refs.add(iconPath);
  }

  for (const cs of manifest?.content_scripts || []) {
    for (const file of [...(cs.js || []), ...(cs.css || [])]) refs.add(file);
  }

  for (const war of manifest?.web_accessible_resources || []) {
    for (const file of war.resources || []) {
      if (!file.includes('*')) refs.add(file);
    }
  }

  return [...refs].sort();
}

function scanRemoteCode(dir, relativeFiles) {
  const issues = [];
  const htmlScriptRemote =
    /<script[^>]+src\s*=\s*["']https?:\/\//i;
  const importRemote =
    /\bimport\s*\(\s*["']https?:\/\//i;
  const srcAssignRemote =
    /\.src\s*=\s*["']https?:\/\/[^"']+\.js/i;

  for (const rel of relativeFiles) {
    if (!/\.(js|html|mjs|css)$/i.test(rel)) continue;
    const full = path.join(dir, rel);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    if (htmlScriptRemote.test(text)) {
      issues.push(`${rel}: remote <script src="https://...">`);
    }
    if (importRemote.test(text)) {
      issues.push(`${rel}: remote dynamic import()`);
    }
    if (srcAssignRemote.test(text)) {
      issues.push(`${rel}: assigns remote .js to script.src`);
    }
  }

  return issues;
}

function walkFiles(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) walkFiles(full, base, out);
    else out.push(rel);
  }
  return out;
}

function main() {
  const dir = resolveTargetDir();
  const lines = [];
  const errors = [];
  const ok = (msg) => lines.push(`OK ${msg}`);
  const err = (msg) => {
    lines.push(`ERRO ${msg}`);
    errors.push(msg);
  };

  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsFile(dir, 'manifest.json')) {
    err('manifest.json não encontrado na raiz do pacote');
    printAndExit(lines, errors, dir);
    return;
  }
  ok('manifest.json encontrado na raiz');

  // Reject nested packaging mistake: better-easy-dots/manifest.json as only layout
  const nested = path.join(dir, 'better-easy-dots', 'manifest.json');
  if (fs.existsSync(nested) && !existsFile(dir, 'content.js')) {
    err('pacote parece aninhado (better-easy-dots/manifest.json) sem arquivos na raiz');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    err(`manifest.json inválido: ${e.message}`);
    printAndExit(lines, errors, dir);
    return;
  }

  if (manifest.manifest_version !== 3) {
    err(`manifest_version deve ser 3 (atual: ${manifest.manifest_version})`);
  } else {
    ok('manifest_version: 3');
  }

  for (const key of ['name', 'version', 'description']) {
    if (!manifest[key]) err(`campo obrigatório ausente: ${key}`);
    else ok(`${key}: ${manifest[key]}`);
  }

  if (manifest.default_locale) {
    ok(`default_locale: ${manifest.default_locale}`);
    const localeMessages = `_locales/${manifest.default_locale}/messages.json`;
    if (existsFile(dir, localeMessages)) ok(`${localeMessages} encontrado`);
    else err(`${localeMessages} citado (default_locale) mas não encontrado`);

    if (!existsDir(dir, '_locales')) err('_locales/ não encontrado');
    else ok('_locales/ encontrado');
  }

  if (!manifest.background?.service_worker) {
    err('background.service_worker ausente');
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    err('content_scripts ausente ou vazio');
  } else {
    for (const [i, cs] of manifest.content_scripts.entries()) {
      if (!cs.matches?.length) err(`content_scripts[${i}].matches vazio`);
      else ok(`content_scripts[${i}].matches: ${cs.matches.join(', ')}`);
    }
  }

  // Localhost matches should not ship in production packages (dist/)
  const isDistPackage = path.resolve(dir) === path.resolve(DEFAULT_DIST);
  if (isDistPackage) {
    const matches = (manifest.content_scripts || []).flatMap((cs) => cs.matches || []);
    const localMatches = matches.filter((m) => /localhost|127\.0\.0\.1|192\.168\./i.test(m));
    if (localMatches.length) {
      err(`matches de desenvolvimento no pacote de produção: ${localMatches.join(', ')}`);
    } else {
      ok('sem matches de localhost/dev no pacote de produção');
    }
  }

  const refs = collectManifestRefs(manifest);
  for (const ref of refs) {
    if (existsFile(dir, ref)) ok(`${ref} encontrado`);
    else err(`${ref} citado no manifest mas não encontrado`);
  }

  // HTML pages often reference local scripts — soft-check common extension pages
  const htmlPages = ['popup.html', 'settings.html', 'changelog.html'].filter((f) =>
    existsFile(dir, f)
  );
  for (const page of htmlPages) {
    const html = fs.readFileSync(path.join(dir, page), 'utf8');
    const srcs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/gi)].map(
      (m) => m[1]
    );
    for (const src of srcs) {
      if (/^https?:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('#')) continue;
      const cleaned = src.split('?')[0];
      if (existsFile(dir, cleaned)) ok(`${page} → ${cleaned}`);
      else err(`${page} referencia ${cleaned} mas o arquivo não existe`);
    }
  }

  const allFiles = walkFiles(dir);
  const remoteIssues = scanRemoteCode(dir, allFiles);
  if (remoteIssues.length === 0) {
    ok('nenhum script remoto proibido detectado');
  } else {
    for (const issue of remoteIssues) err(issue);
  }

  // Critical boot dependency for this project
  if (refs.includes('pending-requests-impact.js') && !existsFile(dir, 'pending-requests-impact.js')) {
    err('pending-requests-impact.js é obrigatório (chama init() dos content scripts)');
  }

  printAndExit(lines, errors, dir);
}

function printAndExit(lines, errors, dir) {
  console.log(`Validando: ${dir}`);
  for (const line of lines) console.log(line);
  if (errors.length) {
    console.log('');
    console.log(`FALHOU com ${errors.length} erro(s).`);
    process.exit(1);
  }
  console.log('');
  console.log('Pacote válido.');
  process.exit(0);
}

main();
