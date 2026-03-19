#!/usr/bin/env node
/**
 * cli.js — `openclaw-evo` CLI entry point
 * Usage:
 *   npx openclaw-evo setup     — configure OpenClaw native plugin
 *   npx openclaw-evo diagnose  — run diagnostics
 */

const { spawnSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(os.homedir(), '.openclaw', 'extensions', 'openclaw-evo');
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

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

function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✓ ${msg}`); }
function fail(msg){ console.log(`  ✗ ${msg}`); }

// ── diagnose ──────────────────────────────────────────────────────────────────

function diagnose() {
  console.log('\nopenclaw-evo diagnostics\n');
  let allOk = true;

  function check(label, fn) {
    try {
      const result = fn();
      ok(label + (result ? ` — ${result}` : ''));
      return true;
    } catch (e) {
      fail(label + ` — ${e.message}`);
      allOk = false;
      return false;
    }
  }

  // 1. Package integrity
  console.log('── Package ──');
  check('openclaw.plugin.json', () => {
    const m = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'openclaw.plugin.json'), 'utf8'));
    const pkg = readJSON(path.join(PKG_ROOT, 'package.json'));
    if (m.id !== pkg.name) throw new Error(`id mismatch: manifest="${m.id}" package="${pkg.name}"`);
    return `id=${m.id} v=${m.version}`;
  });
  check('dist/index.js', () => {
    const p = path.join(PKG_ROOT, 'dist', 'index.js');
    if (!fs.existsSync(p)) throw new Error('not found — run "npm run build"');
    const stat = fs.statSync(p);
    return `${(stat.size / 1024).toFixed(1)} KB, modified ${stat.mtime.toISOString().slice(0, 19)}`;
  });
  check('skill files', () => {
    const dir = path.join(PKG_ROOT, 'plugin', 'skills');
    if (!fs.existsSync(dir)) throw new Error('plugin/skills/ not found');
    const skills = fs.readdirSync(dir).filter(d => {
      const skillMd = path.join(dir, d, 'SKILL.md');
      return fs.existsSync(skillMd);
    });
    return `${skills.length} skills (${skills.join(', ')})`;
  });

  // 2. Binaries
  console.log('\n── Binaries ──');
  check('node', () => process.version);
  check('lobster', () => {
    try {
      return execFileSync('lobster', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('not in PATH — evolve will use exec fallback');
      throw new Error(e.message);
    }
  });
  check('git', () => {
    return execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  });
  check('gh (GitHub CLI)', () => {
    try {
      return execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000 }).split('\n')[0].trim();
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('not found — PR creation in /evolve will be unavailable');
      throw new Error(e.message);
    }
  });

  // 3. OpenClaw installation
  console.log('\n── OpenClaw Integration ──');
  check('extensions directory', () => {
    if (!fs.existsSync(EXT_DIR)) throw new Error(`${EXT_DIR} not found — run "npx openclaw-evo setup"`);
    const files = fs.readdirSync(EXT_DIR);
    return `${files.length} entries in ${EXT_DIR}`;
  });
  check('dist/index.js in extensions', () => {
    const p = path.join(EXT_DIR, 'dist', 'index.js');
    if (!fs.existsSync(p)) throw new Error('not found — run "npx openclaw-evo setup" to copy');
    return 'exists';
  });
  check('openclaw.json plugin entry', () => {
    if (!fs.existsSync(CONFIG_PATH)) throw new Error(`${CONFIG_PATH} not found`);
    const config = readJSON(CONFIG_PATH);
    const entry = config?.plugins?.entries?.['openclaw-evo'];
    if (!entry) throw new Error('no "openclaw-evo" entry in plugins.entries');
    if (!entry.enabled) throw new Error('plugin is disabled');
    return 'enabled';
  });
  check('plugins.allow whitelist', () => {
    const config = readJSON(CONFIG_PATH);
    const allow = config?.plugins?.allow;
    if (!Array.isArray(allow)) throw new Error('plugins.allow is missing or not an array');
    if (!allow.includes('openclaw-evo')) throw new Error('"openclaw-evo" not in plugins.allow');
    return `[${allow.join(', ')}]`;
  });
  check('plugins.installs metadata', () => {
    const config = readJSON(CONFIG_PATH);
    const inst = config?.plugins?.installs?.['openclaw-evo'];
    if (!inst) throw new Error('no install entry — run "npx openclaw-evo setup"');
    return `source=${inst.source} v=${inst.version} @ ${inst.installedAt}`;
  });
  check('skills.entries registration', () => {
    const config = readJSON(CONFIG_PATH);
    const skills = config?.skills?.entries;
    if (!skills) throw new Error('skills.entries missing');
    const evoSkills = Object.keys(skills).filter(k => skills[k]?.enabled);
    if (evoSkills.length === 0) throw new Error('no skills enabled');
    if (!skills.evolve) throw new Error('"evolve" skill not registered');
    return `${evoSkills.length} enabled: ${evoSkills.join(', ')}`;
  });
  check('skill files in extensions', () => {
    const skillsDir = path.join(EXT_DIR, 'plugin', 'skills');
    if (!fs.existsSync(skillsDir)) throw new Error(`${skillsDir} not found`);
    const skills = fs.readdirSync(skillsDir).filter(d =>
      fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))
    );
    return `${skills.length} skills: ${skills.join(', ')}`;
  });
  check('manifest skill paths resolve', () => {
    const extManifest = path.join(EXT_DIR, 'openclaw.plugin.json');
    if (!fs.existsSync(extManifest)) throw new Error('no manifest in extensions');
    const m = JSON.parse(fs.readFileSync(extManifest, 'utf8'));
    for (const sp of m.skills || []) {
      const resolved = path.resolve(EXT_DIR, sp);
      if (!fs.existsSync(resolved)) throw new Error(`"${sp}" resolves to ${resolved} — not found`);
    }
    return (m.skills || []).join(', ');
  });

  // Summary
  console.log('');
  if (allOk) {
    console.log('  All checks passed.\n');
  } else {
    console.log('  Some checks failed. Fix the issues above and re-run:\n');
    console.log('    npx openclaw-evo diagnose\n');
  }

  return allOk;
}

// ── setup ─────────────────────────────────────────────────────────────────────

function setupOpenclaw() {
  console.log('\nopenclaw-evo setup\n');

  // 1. Check dist exists
  const distSrc = path.join(PKG_ROOT, 'dist', 'index.js');
  if (!fs.existsSync(distSrc)) {
    fail('dist/index.js not found — building now...');
    const build = spawnSync('npm', ['run', 'build'], { cwd: PKG_ROOT, stdio: 'inherit' });
    if (build.status !== 0) {
      fail('build failed — cannot continue');
      process.exit(1);
    }
    ok('build succeeded');
  } else {
    ok(`dist/index.js exists`);
  }

  // 2. Copy plugin files — preserve directory structure so manifest paths resolve
  log(`copying to ${EXT_DIR} ...`);
  fs.mkdirSync(EXT_DIR, { recursive: true });

  // Copy dist/
  const distDst = path.join(EXT_DIR, 'dist');
  fs.mkdirSync(distDst, { recursive: true });
  for (const f of fs.readdirSync(path.join(PKG_ROOT, 'dist'))) {
    fs.copyFileSync(path.join(PKG_ROOT, 'dist', f), path.join(distDst, f));
  }
  ok('dist/ copied');

  // Copy plugin/ INTO plugin/ (keep structure matching manifest's "./plugin/skills")
  const pluginSrc = path.join(PKG_ROOT, 'plugin');
  const pluginDst = path.join(EXT_DIR, 'plugin');
  if (fs.existsSync(pluginSrc)) {
    fs.mkdirSync(pluginDst, { recursive: true });
    spawnSync('cp', ['-r', `${pluginSrc}/.`, pluginDst], { stdio: 'pipe' });
    ok('plugin/ copied (preserving structure)');
  }

  // Copy manifest
  const manifestSrc = path.join(PKG_ROOT, 'openclaw.plugin.json');
  if (fs.existsSync(manifestSrc)) {
    fs.copyFileSync(manifestSrc, path.join(EXT_DIR, 'openclaw.plugin.json'));
    ok('openclaw.plugin.json copied');
  }

  // Copy package.json (needed for version info)
  fs.copyFileSync(path.join(PKG_ROOT, 'package.json'), path.join(EXT_DIR, 'package.json'));
  ok('package.json copied');

  // 3. Discover skills from plugin/skills/*/SKILL.md
  const skillNames = [];
  const skillsDir = path.join(PKG_ROOT, 'plugin', 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const d of fs.readdirSync(skillsDir)) {
      if (fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))) {
        skillNames.push(d);
      }
    }
  }
  ok(`found ${skillNames.length} skills: ${skillNames.join(', ')}`);

  // 4. Update openclaw.json with full config structure
  log(`updating ${CONFIG_PATH} ...`);
  const config = readJSON(CONFIG_PATH);
  const pkg = readJSON(path.join(PKG_ROOT, 'package.json'));

  // plugins.allow — allowlist
  if (!config.plugins) config.plugins = {};
  if (!Array.isArray(config.plugins.allow)) config.plugins.allow = [];
  if (!config.plugins.allow.includes('openclaw-evo')) {
    config.plugins.allow.push('openclaw-evo');
  }
  ok('plugins.allow: openclaw-evo added');

  // plugins.entries
  merge(config, {
    plugins: { entries: { 'openclaw-evo': { enabled: true, config: {} } } }
  });
  ok('plugins.entries: openclaw-evo enabled');

  // plugins.installs — install metadata
  if (!config.plugins.installs) config.plugins.installs = {};
  config.plugins.installs['openclaw-evo'] = {
    source: 'path',
    sourcePath: PKG_ROOT,
    installPath: EXT_DIR,
    version: pkg.version || '0.1.0',
    installedAt: new Date().toISOString()
  };
  ok('plugins.installs: metadata recorded');

  // skills.entries — register each skill
  if (!config.skills) config.skills = {};
  if (!config.skills.entries) config.skills.entries = {};
  for (const skill of skillNames) {
    config.skills.entries[skill] = { enabled: true };
  }
  ok(`skills.entries: ${skillNames.join(', ')} registered`);

  writeJSON(CONFIG_PATH, config);
  ok('openclaw.json written');

  // 4. Verify
  console.log('\n── Verification ──');
  const verified = diagnose();

  if (verified) {
    console.log('Setup complete. Run: openclaw gateway restart\n');
  } else {
    console.log('Setup finished with warnings — check above.\n');
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];

switch (cmd) {
  case 'setup':
    setupOpenclaw();
    break;
  case 'diagnose':
  case 'diag':
  case 'doctor':
    diagnose();
    break;
  default:
    console.log('Usage:');
    console.log('  npx openclaw-evo setup     — install plugin into OpenClaw');
    console.log('  npx openclaw-evo diagnose  — run full diagnostics');
    process.exit(0);
}
