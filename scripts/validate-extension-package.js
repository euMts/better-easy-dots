#!/usr/bin/env node
'use strict';

/**
 * Validates an extension package directory (or extracted ZIP root).
 * Usage:
 *   node scripts/validate-extension-package.js [dir] [chrome|firefox]
 * Default dir: ./dist/chrome, then ./dist, then repo root.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const argDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const argTarget = (process.argv[3] || '').trim().toLowerCase() || null;
const DEFAULT_DIST_CHROME = path.join(ROOT, 'dist', 'chrome');
const DEFAULT_DIST_FIREFOX = path.join(ROOT, 'dist', 'firefox');
const DEFAULT_DIST_LEGACY = path.join(ROOT, 'dist');

function resolveTargetDir() {
  if (argDir) return argDir;
  if (fs.existsSync(path.join(DEFAULT_DIST_CHROME, 'manifest.json'))) return DEFAULT_DIST_CHROME;
  if (fs.existsSync(path.join(DEFAULT_DIST_FIREFOX, 'manifest.json'))) return DEFAULT_DIST_FIREFOX;
  if (fs.existsSync(path.join(DEFAULT_DIST_LEGACY, 'manifest.json'))) return DEFAULT_DIST_LEGACY;
  return ROOT;
}

function detectTarget(dir, manifest) {
  if (argTarget === 'chrome' || argTarget === 'firefox') return argTarget;
  if (manifest?.browser_specific_settings?.gecko?.id) return 'firefox';
  const resolved = path.resolve(dir);
  if (resolved === path.resolve(DEFAULT_DIST_FIREFOX)) return 'firefox';
  if (resolved === path.resolve(DEFAULT_DIST_CHROME)) return 'chrome';
  if (manifest?.background?.scripts) return 'firefox';
  return 'chrome';
}

function isProductionPackage(dir) {
  const resolved = path.resolve(dir);
  return (
    resolved === path.resolve(DEFAULT_DIST_CHROME) ||
    resolved === path.resolve(DEFAULT_DIST_FIREFOX) ||
    resolved === path.resolve(DEFAULT_DIST_LEGACY)
  );
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

  for (const script of manifest?.background?.scripts || []) {
    if (script) refs.add(script);
  }

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
  const htmlScriptRemote = /<script[^>]+src\s*=\s*["']https?:\/\//i;
  const importRemote = /\bimport\s*\(\s*["']https?:\/\//i;
  const srcAssignRemote = /\.src\s*=\s*["']https?:\/\/[^"']+\.js/i;

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

  const target = detectTarget(dir, manifest);
  ok(`alvo detectado: ${target}`);

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

  const hasServiceWorker = Boolean(manifest.background?.service_worker);
  const hasScripts =
    Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0;

  if (target === 'chrome') {
    if (!hasServiceWorker) err('background.service_worker ausente (Chrome)');
    else ok(`background.service_worker: ${manifest.background.service_worker}`);
    if (hasScripts) err('background.scripts não é permitido no pacote Chrome');
  } else if (target === 'firefox') {
    if (!hasScripts) err('background.scripts ausente ou vazio (Firefox)');
    else ok(`background.scripts: ${manifest.background.scripts.join(', ')}`);
    if (hasScripts && manifest.background.scripts[0] !== 'browser-compat.js') {
      err('background.scripts deve carregar browser-compat.js primeiro (Firefox)');
    }
    if (hasServiceWorker) {
      err('background.service_worker não deve ser usado no pacote Firefox (use scripts)');
    }
    const geckoId = manifest.browser_specific_settings?.gecko?.id;
    if (!geckoId) err('browser_specific_settings.gecko.id ausente (Firefox)');
    else ok(`gecko.id: ${geckoId}`);
    const dataCollection =
      manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required || [];
    if (!dataCollection.includes('none')) {
      err('browser_specific_settings.gecko.data_collection_permissions.required deve incluir "none"');
    } else {
      ok('gecko.data_collection_permissions.required: none');
    }
    if (!manifest.options_ui?.page && !manifest.options_page) {
      err('options_ui.page ou options_page ausente (Firefox)');
    } else if (manifest.options_ui?.page) {
      ok(`options_ui.page: ${manifest.options_ui.page}`);
    }
  } else if (!hasServiceWorker && !hasScripts) {
    err('background.service_worker ou background.scripts ausente');
  }

  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
    err('content_scripts ausente ou vazio');
  } else {
    for (const [i, cs] of manifest.content_scripts.entries()) {
      if (!cs.matches?.length) err(`content_scripts[${i}].matches vazio`);
      else ok(`content_scripts[${i}].matches: ${cs.matches.join(', ')}`);
      if (cs.js?.length && cs.js[0] !== 'browser-compat.js') {
        err(`content_scripts[${i}].js deve carregar browser-compat.js primeiro`);
      }
    }
  }

  const sharedPermissions = target === 'firefox' ? ['storage', 'tabs'] : ['storage', 'tabs', 'windows'];
  for (const permission of sharedPermissions) {
    if (manifest.permissions?.includes(permission)) ok(`permission: ${permission}`);
    else err(`permissão compartilhada ausente: ${permission}`);
  }

  if (isProductionPackage(dir)) {
    const matches = (manifest.content_scripts || []).flatMap((cs) => cs.matches || []);
    const hostPerms = manifest.host_permissions || [];
    const localMatches = [...matches, ...hostPerms].filter((m) =>
      /localhost|127\.0\.0\.1|192\.168\./i.test(m)
    );
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
