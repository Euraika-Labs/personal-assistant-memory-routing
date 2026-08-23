#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const VERSION = packageJson.version;
const SKILL_NAME = 'personal-assistant-memory-routing';
const OWNED_MARKER = 'personal-assistant-memory-routing';

function usage(code = 0) {
  console.log(`pamr ${VERSION}

Usage:
  pamr doctor
  pamr status --host claude|codex|both [--scope user|project] [--project PATH]
  pamr install --host claude|codex|both [--scope user|project] [--project PATH] [--hooks --yes] [--dry-run] [--force]
  pamr uninstall --host claude|codex|both [--scope user|project] [--project PATH] [--yes] [--dry-run] [--force]

Safety:
  npm installation has no lifecycle side effects. Hooks are installed only with --hooks --yes.
  Existing host configuration is backed up and unrelated settings are preserved.`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { scope: 'user', project: process.cwd(), hooks: false, yes: false, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') options.host = argv[++i];
    else if (arg === '--scope') options.scope = argv[++i];
    else if (arg === '--project') options.project = path.resolve(argv[++i]);
    else if (arg === '--hooks') options.hooks = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') usage();
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['claude', 'codex', 'both'].includes(options.host)) throw new Error('--host must be claude, codex, or both');
  if (!['user', 'project'].includes(options.scope)) throw new Error('--scope must be user or project');
  return options;
}

function hosts(value) { return value === 'both' ? ['claude', 'codex'] : [value]; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function timestamp() { return new Date().toISOString().replaceAll(':', '-'); }
function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }

function targetFor(host, options) {
  const base = options.scope === 'user' ? os.homedir() : options.project;
  const hostDir = host === 'claude' ? '.claude' : '.codex';
  const root = path.join(base, hostDir);
  const skillDir = path.join(root, 'skills', SKILL_NAME);
  const config = host === 'claude'
    ? path.join(root, options.scope === 'user' ? 'settings.json' : 'settings.local.json')
    : path.join(root, 'hooks.json');
  const dataRoot = options.scope === 'user'
    ? path.join(os.homedir(), '.local', 'share', 'personal-assistant-memory-routing')
    : path.join(options.project, '.pamr');
  const runtime = path.join(dataRoot, 'runtime', VERSION, 'assistant-hook.mjs');
  const manifest = path.join(dataRoot, 'installations', `${host}-${options.scope}-${hash(base).slice(0, 12)}.json`);
  return { host, base, root, skillDir, config, runtime, manifest };
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked JSON file: ${file}`);
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be an object');
    return value;
  } catch (error) {
    throw new Error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

function atomicWrite(file, content, originalHash = null) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (originalHash !== null && fs.existsSync(file) && hash(fs.readFileSync(file)) !== originalHash) {
    throw new Error(`Concurrent modification detected: ${file}`);
  }
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600;
  const fd = fs.openSync(temp, 'wx', mode);
  try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file);
  const backup = `${file}.pamr-backup-${timestamp()}-${hash(content).slice(0, 10)}`;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, fs.statSync(file).mode & 0o777);
  return backup;
}

function copyTree(source, destination) {
  fs.cpSync(source, destination, { recursive: true, errorOnExist: false, force: true });
}

function ownedCommand(target, action) {
  return `${quote(process.execPath)} ${quote(target.runtime)} ${action} --host ${target.host} # ${OWNED_MARKER}`;
}

function hookEntries(target) {
  const command = (action) => ({ type: 'command', command: ownedCommand(target, action), timeout: action === 'guard-write' ? 5 : 8 });
  return {
    SessionStart: [{ matcher: 'startup|resume|compact', hooks: [{ ...command('session-start'), statusMessage: 'Loading bounded assistant context' }] }],
    UserPromptSubmit: [{ hooks: [{ ...command('recall'), statusMessage: 'Recalling relevant context' }] }],
    PreToolUse: [{ matcher: target.host === 'claude' ? 'Bash' : '^Bash$', hooks: [command('guard-write')] }],
    Stop: [{ hooks: [{ ...command('stage-candidate'), statusMessage: 'Staging explicit memory candidates for review' }] }],
  };
}

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isOwnedGroup(group) {
  return Array.isArray(group?.hooks) && group.hooks.some((entry) => typeof entry?.command === 'string' && entry.command.includes(`# ${OWNED_MARKER}`));
}

function mergeHooks(config, desired) {
  const next = structuredClone(config);
  if (next.hooks !== undefined && (!next.hooks || typeof next.hooks !== 'object' || Array.isArray(next.hooks))) throw new Error('Existing hooks must be an object');
  next.hooks ||= {};
  for (const [event, groups] of Object.entries(desired)) {
    if (next.hooks[event] !== undefined && !Array.isArray(next.hooks[event])) throw new Error(`Existing hooks.${event} must be an array`);
    const existing = (next.hooks[event] || []).filter((group) => !isOwnedGroup(group));
    next.hooks[event] = [...existing, ...groups];
  }
  return next;
}

function removeHooks(config, recorded) {
  const next = structuredClone(config);
  const conflicts = [];
  if (!next.hooks || typeof next.hooks !== 'object') return { next, conflicts };
  for (const [event, groups] of Object.entries(recorded || {})) {
    if (!Array.isArray(next.hooks[event])) continue;
    for (const expected of groups) {
      const index = next.hooks[event].findIndex((actual) => deepEqual(actual, expected));
      if (index >= 0) next.hooks[event].splice(index, 1);
      else if (next.hooks[event].some(isOwnedGroup)) conflicts.push(event);
    }
    if (next.hooks[event].length === 0) delete next.hooks[event];
  }
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return { next, conflicts };
}

function skillSource() { return path.join(packageRoot, 'skill', SKILL_NAME); }
function runtimeSource() { return path.join(packageRoot, 'runtime', 'assistant-hook.mjs'); }

function printPlan(action, targets, options) {
  console.log(`${action} plan (${options.dryRun ? 'dry run' : 'live'}):`);
  for (const target of targets) {
    console.log(`- ${target.host}:`);
    console.log(`  skill:    ${target.skillDir}`);
    console.log(`  runtime:  ${target.runtime}`);
    console.log(`  config:   ${target.config}${options.hooks ? ' (hooks requested)' : ' (unchanged)'}`);
    console.log(`  manifest: ${target.manifest}`);
  }
}

function install(target, options) {
  if (fs.existsSync(target.skillDir)) {
    const marker = path.join(target.skillDir, '.pamr-install.json');
    if (!fs.existsSync(marker) && !options.force) throw new Error(`Existing unowned skill directory: ${target.skillDir}; use --force only after review`);
  }
  const desired = options.hooks ? hookEntries(target) : {};
  let config = null;
  let merged = null;
  let configHash = null;
  if (options.hooks) {
    config = readJson(target.config);
    configHash = fs.existsSync(target.config) ? hash(fs.readFileSync(target.config)) : null;
    merged = mergeHooks(config, desired);
  }
  if (options.dryRun) return;

  fs.mkdirSync(path.dirname(target.skillDir), { recursive: true });
  copyTree(skillSource(), target.skillDir);
  atomicWrite(path.join(target.skillDir, '.pamr-install.json'), JSON.stringify({ package: packageJson.name, version: VERSION }, null, 2) + '\n');
  fs.mkdirSync(path.dirname(target.runtime), { recursive: true, mode: 0o700 });
  fs.copyFileSync(runtimeSource(), target.runtime);
  fs.chmodSync(target.runtime, 0o755);

  let backup = null;
  if (options.hooks && !deepEqual(config, merged)) {
    backup = backupFile(target.config);
    atomicWrite(target.config, JSON.stringify(merged, null, 2) + '\n', configHash);
  }
  const manifestData = {
    package: packageJson.name,
    version: VERSION,
    host: target.host,
    scope: options.scope,
    installedAt: new Date().toISOString(),
    skillDir: target.skillDir,
    runtime: target.runtime,
    config: target.config,
    hooks: desired,
    backup,
  };
  atomicWrite(target.manifest, JSON.stringify(manifestData, null, 2) + '\n');
  console.log(`Installed ${target.host} skill${options.hooks ? ' and hooks' : ' (hooks not activated)'}.`);
}

function uninstall(target, options) {
  if (!fs.existsSync(target.manifest)) {
    console.log(`No owned ${target.host} installation manifest found; skipped.`);
    return;
  }
  const manifest = readJson(target.manifest);
  const config = readJson(target.config);
  const configHash = fs.existsSync(target.config) ? hash(fs.readFileSync(target.config)) : null;
  const { next, conflicts } = removeHooks(config, manifest.hooks);
  if (conflicts.length && !options.force) throw new Error(`Owned hooks were edited in ${target.config}; refusing broad removal (events: ${conflicts.join(', ')})`);
  if (options.dryRun) {
    console.log(`Would remove exact owned hooks and skill for ${target.host}.`);
    return;
  }
  if (!deepEqual(config, next)) {
    backupFile(target.config);
    atomicWrite(target.config, JSON.stringify(next, null, 2) + '\n', configHash);
  }
  const marker = path.join(target.skillDir, '.pamr-install.json');
  if (fs.existsSync(marker)) {
    const ownership = readJson(marker);
    if (ownership.package === packageJson.name) fs.rmSync(target.skillDir, { recursive: true, force: true });
  }
  fs.rmSync(target.manifest, { force: true });
  console.log(`Uninstalled owned ${target.host} files.`);
}

function doctor() {
  console.log(`pamr ${VERSION}`);
  console.log(`Node: ${process.version} (${process.execPath})`);
  const nmem = spawnSync('sh', ['-lc', 'command -v nmem'], { encoding: 'utf8', timeout: 2000 });
  console.log(`nmem: ${nmem.status === 0 ? nmem.stdout.trim() : 'not found (recall will fail open)'}`);
  console.log(`Platform: ${process.platform} (${process.platform === 'win32' ? 'unsupported by this installer' : 'supported'})`);
  const test = spawnSync(process.execPath, [runtimeSource(), '--self-test'], { encoding: 'utf8' });
  console.log(`Runtime: ${test.status === 0 ? 'self-test ok' : 'self-test failed'}`);
  const detect = spawnSync(process.execPath, [runtimeSource(), 'detect', '--host', 'claude'], { encoding: 'utf8', input: JSON.stringify({ cwd: process.cwd() }) });
  if (detect.status === 0 && detect.stdout.trim()) console.log(`Memory providers: ${detect.stdout.trim().replaceAll('\n', ' ')}`);
  process.exitCode = test.status === 0 ? 0 : 1;
}

function status(target) {
  const installed = fs.existsSync(path.join(target.skillDir, '.pamr-install.json'));
  const manifest = fs.existsSync(target.manifest) ? readJson(target.manifest) : null;
  let hooks = false;
  if (fs.existsSync(target.config)) {
    const config = readJson(target.config);
    hooks = Object.values(config.hooks || {}).some((groups) => Array.isArray(groups) && groups.some(isOwnedGroup));
  }
  console.log(`${target.host}: skill=${installed ? 'installed' : 'absent'}, hooks=${hooks ? 'installed' : 'absent'}, version=${manifest?.version || '-'}`);
}

const [command, ...argv] = process.argv.slice(2);
try {
  if (!command || command === '--help' || command === '-h') usage();
  if (command === 'doctor') { doctor(); }
  else if (!['install', 'uninstall', 'status'].includes(command)) usage(64);
  if (command === 'doctor') process.exit(process.exitCode || 0);
  if (process.platform === 'win32') throw new Error('This installer currently supports macOS/Linux only');
  const options = parseArgs(argv);
  const targets = hosts(options.host).map((host) => targetFor(host, options));
  if (command !== 'status') printPlan(command, targets, options);
  if (command === 'install' && options.hooks && !options.yes && !options.dryRun) throw new Error('Hook activation requires --yes after review');
  if (command === 'uninstall' && !options.yes && !options.dryRun) throw new Error('Uninstall requires --yes');
  for (const target of targets) {
    if (command === 'install') install(target, options);
    else if (command === 'uninstall') uninstall(target, options);
    else status(target);
  }
} catch (error) {
  console.error(`pamr: ${error.message}`);
  process.exit(1);
}
