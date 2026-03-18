#!/usr/bin/env node
/**
 * cli.js — `evo-anything` CLI entry point
 * Usage:
 *   npx evo-anything setup  — configure OpenClaw native plugin
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');

// ── helpers ───────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { return {}; }
}

function writeJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function merge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = merge(target[k] || {}, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

// ── setup ─────────────────────────────────────────────────────────────────────

function setupOpenclaw() {
  const extDir = path.join(os.homedir(), '.openclaw', 'extensions', 'openclaw-evo');
  const pluginSrc = path.join(PKG_ROOT, 'plugin');

  // Copy plugin files to OpenClaw extensions directory.
  fs.mkdirSync(extDir, { recursive: true });
  spawnSync('cp', ['-r', `${pluginSrc}/.`, extDir], { stdio: 'inherit' });
  console.log(`  Plugin copied to ${extDir}`);

  // Enable the native plugin in openclaw.json.
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const config = readJSON(configPath);
  merge(config, {
    plugins: { entries: { 'openclaw-evo': { enabled: true, config: {} } } }
  });
  writeJSON(configPath, config);
  console.log(`  Updated ${configPath}`);
  console.log('  Run: openclaw gateway restart');
}

// ── main ──────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

if (cmd !== 'setup') {
  console.log('Usage:');
  console.log('  npx evo-anything setup');
  process.exit(0);
}

console.log('\nevo-anything setup\n');
try { setupOpenclaw(); } catch (e) { console.error('  Error:', e.message); }
console.log('\nDone!\n');
