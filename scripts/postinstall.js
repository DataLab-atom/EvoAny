#!/usr/bin/env node
/**
 * postinstall.js — verify installation and report status
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PKG_ROOT = path.resolve(__dirname, '..');

function check(label, fn) {
  try {
    const result = fn();
    console.log(`  ✓ ${label}` + (result ? ` — ${result}` : ''));
    return true;
  } catch (e) {
    console.log(`  ✗ ${label} — ${e.message}`);
    return false;
  }
}

console.log('\n🧬 evo-anything postinstall\n');

let ok = true;

ok = check('plugin manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'openclaw.plugin.json'), 'utf8'));
  return `id=${manifest.id} v${manifest.version}`;
}) && ok;

ok = check('dist/index.js', () => {
  const p = path.join(PKG_ROOT, 'dist', 'index.js');
  if (!fs.existsSync(p)) throw new Error('not found — run "npm run build" first');
  return 'exists';
}) && ok;

ok = check('lobster binary', () => {
  const ver = execFileSync('lobster', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  return ver;
}) && ok;

ok = check('skill files', () => {
  const skillsDir = path.join(PKG_ROOT, 'plugin', 'skills');
  if (!fs.existsSync(skillsDir)) throw new Error('plugin/skills/ not found');
  const skills = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory()
  );
  return `${skills.length} skills (${skills.join(', ')})`;
}) && ok;

if (ok) {
  console.log('\n  All checks passed.\n');
} else {
  console.log('\n  Some checks failed — the plugin may not work correctly.');
  console.log('  Run "npx evo-anything diagnose" for details.\n');
}

console.log('Next steps:');
console.log('  npx evo-anything setup    — install into OpenClaw');
console.log('  npx evo-anything diagnose — run full diagnostics\n');
