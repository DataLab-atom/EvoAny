#!/usr/bin/env node
/**
 * cli.js — `evo-anything` CLI 入口
 * 用法：
 *   npx evo-anything setup                    # 配置所有支持的平台
 *   npx evo-anything setup --platform claude  # 仅配置 Claude Code
 *   npx evo-anything setup --platform cursor  # 仅配置 Cursor
 *   npx evo-anything setup --platform windsurf
 *   npx evo-anything setup --platform openclaw
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PKG_ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(PKG_ROOT, 'plugin');
const AGENTS_MD = path.join(PKG_ROOT, 'plugin', 'AGENTS.md');
const AGENTS_DIR = path.join(PKG_ROOT, 'plugin', 'agents');

const MCP_SERVER_ENTRY = {
  command: 'evo-engine',
  type: 'stdio',
  args: []
};

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

// ── platform setups ───────────────────────────────────────────────────────────

function setupClaude() {
  // 通过 enabledPlugins 注册插件目录（符合 Claude Code 插件规范）
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readJSON(settingsPath);
  if (!Array.isArray(settings.enabledPlugins)) {
    settings.enabledPlugins = [];
  }
  if (!settings.enabledPlugins.includes(PLUGIN_DIR)) {
    settings.enabledPlugins.push(PLUGIN_DIR);
  }
  writeJSON(settingsPath, settings);
  console.log(`  ✅ Registered plugin: ${PLUGIN_DIR}`);
  console.log(`  ✅ Updated ${settingsPath}`);
  console.log(`  ℹ️  Skills available as /evo-anything:<skill-name>`);
  console.log(`     e.g. /evo-anything:status, /evo-anything:evolve, /evo-anything:hunt`);
}

function setupCursor(projectDir) {
  const base = projectDir || process.cwd();
  const mcpPath = path.join(base, '.cursor', 'mcp.json');
  const mcp = readJSON(mcpPath);
  merge(mcp, { mcpServers: { 'evo-engine': MCP_SERVER_ENTRY } });
  writeJSON(mcpPath, mcp);
  console.log(`  ✅ Updated ${mcpPath}`);

  // 复制 AGENTS.md 为 Cursor Rule
  const rulesDir = path.join(base, '.cursor', 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.copyFileSync(AGENTS_MD, path.join(rulesDir, 'evo-agents.md'));
  console.log(`  ✅ Copied AGENTS.md → .cursor/rules/evo-agents.md`);

  // 复制 agent 定义文件
  if (fs.existsSync(AGENTS_DIR)) {
    for (const agentFile of fs.readdirSync(AGENTS_DIR)) {
      fs.copyFileSync(
        path.join(AGENTS_DIR, agentFile),
        path.join(rulesDir, `evo-${agentFile}`)
      );
      console.log(`  ✅ Copied agents/${agentFile} → .cursor/rules/evo-${agentFile}`);
    }
  }
}

function setupWindsurf() {
  const mcpPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  const mcp = readJSON(mcpPath);
  merge(mcp, { mcpServers: { 'evo-engine': MCP_SERVER_ENTRY } });
  writeJSON(mcpPath, mcp);
  console.log(`  ✅ Updated ${mcpPath}`);
}

function setupOpenclaw() {
  const extDir = path.join(os.homedir(), '.openclaw', 'extensions', 'openclaw-evo');
  const pluginSrc = path.join(PKG_ROOT, 'plugin');

  // 复制插件文件
  fs.mkdirSync(extDir, { recursive: true });
  spawnSync('cp', ['-r', `${pluginSrc}/.`, extDir], { stdio: 'inherit' });
  console.log(`  ✅ Plugin copied to ${extDir}`);

  // 写 openclaw.json
  const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const config = readJSON(configPath);
  merge(config, {
    plugins: { entries: { 'openclaw-evo': { enabled: true, config: {} } } },
    mcpServers: { 'evo-engine': { command: 'evo-engine', args: [], env: {} } }
  });
  writeJSON(configPath, config);
  console.log(`  ✅ Updated ${configPath}`);
  console.log('  ℹ️  Run: openclaw gateway restart');
}

// ── main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];
const platformIdx = args.indexOf('--platform');
const platform = platformIdx !== -1 ? args[platformIdx + 1] : 'all';

if (cmd !== 'setup') {
  console.log('Usage:');
  console.log('  npx evo-anything setup [--platform claude|cursor|windsurf|openclaw|all]');
  process.exit(0);
}

console.log(`\n🧬 evo-anything setup (platform: ${platform})\n`);

const all = platform === 'all';

if (all || platform === 'claude') {
  console.log('📦 Claude Code:');
  try { setupClaude(); } catch (e) { console.error('  ❌', e.message); }
}
if (all || platform === 'cursor') {
  console.log('📦 Cursor:');
  try { setupCursor(); } catch (e) { console.error('  ❌', e.message); }
}
if (all || platform === 'windsurf') {
  console.log('📦 Windsurf:');
  try { setupWindsurf(); } catch (e) { console.error('  ❌', e.message); }
}
if (all || platform === 'openclaw') {
  console.log('📦 OpenClaw:');
  try { setupOpenclaw(); } catch (e) { console.error('  ❌', e.message); }
}

console.log('\n✅ Done! 在对话中输入 /evo-anything:status 验证安装。\n');
