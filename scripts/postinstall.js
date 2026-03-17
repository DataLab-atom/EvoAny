#!/usr/bin/env node
/**
 * postinstall.js — 自动安装 Python MCP server（evo-engine）
 * 在 `npm install evo-anything` 完成后自动触发。
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PKG_ROOT = path.resolve(__dirname, '..');
const EVO_ENGINE_DIR = path.join(PKG_ROOT, 'plugin', 'evo-engine');

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function checkPython() {
  for (const bin of ['python3', 'python']) {
    try {
      const ver = execSync(`${bin} --version 2>&1`).toString().trim();
      const match = ver.match(/(\d+)\.(\d+)/);
      if (match && (parseInt(match[1]) > 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) >= 11))) {
        return bin;
      }
    } catch (_) {}
  }
  return null;
}

console.log('\n🧬 evo-anything: Installing Python MCP server...\n');

const python = checkPython();
if (!python) {
  console.warn('⚠️  Python >= 3.11 not found. Please install it manually:');
  console.warn(`   pip install ${EVO_ENGINE_DIR}`);
  console.warn('   Then re-run: npm run postinstall\n');
  process.exit(0); // 不阻断 npm install
}

try {
  run(`${python} -m pip install --quiet "${EVO_ENGINE_DIR}"`);
  console.log('\n✅ evo-engine installed successfully.\n');
  console.log('Next steps:');
  console.log('  npx evo-anything setup    — 自动配置 Claude Code / Cursor / Windsurf');
  console.log('  npx evo-anything setup --platform openclaw  — 仅配置 OpenClaw');
  console.log('  Claude Code skills: /evo-anything:status, /evo-anything:evolve, /evo-anything:hunt\n');
} catch (err) {
  console.error('\n❌ pip install failed:', err.message);
  console.error(`   Please run manually: pip install "${EVO_ENGINE_DIR}"\n`);
  process.exit(0); // 不阻断 npm install
}
