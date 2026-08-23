import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function startClaudeMemMock(home) {
  const server = path.join(home, 'claude-mem-mock.mjs');
  fs.writeFileSync(server, `import http from 'node:http';
const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url.startsWith('/api/health'))res.end(JSON.stringify({status:'ok'}));else if(req.url.startsWith('/api/search'))res.end(JSON.stringify({results:[{id:42,title:'Remember the blue deployment lane'}]}));else if(req.url.startsWith('/api/context/inject'))res.end(JSON.stringify({content:[{type:'text',text:'Recent project context'}]}));else{res.statusCode=404;res.end('{}')}});server.listen(0,'127.0.0.1',()=>process.stdout.write(String(server.address().port)));
`);
  const child = spawn(process.execPath, [server], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mock server timeout')), 3000);
    child.once('error', reject);
    child.stdout.once('data', (data) => { clearTimeout(timer); resolve(Number(String(data).trim())); });
  });
  return { child, port };
}

const root = path.resolve(import.meta.dirname, '..');
const hook = path.join(root, 'runtime/assistant-hook.mjs');
const cli = path.join(root, 'bin/pamr.mjs');

function run(file, args, options = {}) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', ...options });
}

test('runtime self-test succeeds', () => {
  const result = run(hook, ['--self-test']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /self-test: ok/);
});

test('guard blocks direct nmem writes by default', () => {
  const result = run(hook, ['guard-write', '--host', 'claude'], {
    input: JSON.stringify({ tool_input: { command: 'nmem fs write /memories/by-id/x.memory.md --body test' } }),
  });
  assert.equal(result.status, 2);
});

test('guard allows unrelated commands', () => {
  const result = run(hook, ['guard-write', '--host', 'claude'], {
    input: JSON.stringify({ tool_input: { command: 'git status' } }),
  });
  assert.equal(result.status, 0);
});

test('install is idempotent and uninstall preserves unrelated settings', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-test-'));
  const env = { ...process.env, HOME: home };
  const config = path.join(home, '.claude/settings.json');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ theme: 'dark' }, null, 2));

  let result = run(cli, ['install', '--host', 'claude', '--scope', 'user', '--hooks', '--yes'], { env });
  assert.equal(result.status, 0, result.stderr);
  const first = fs.readFileSync(config, 'utf8');
  result = run(cli, ['install', '--host', 'claude', '--scope', 'user', '--hooks', '--yes'], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(config, 'utf8'), first);

  const parsed = JSON.parse(first);
  parsed.unrelated = true;
  fs.writeFileSync(config, JSON.stringify(parsed, null, 2) + '\n');
  result = run(cli, ['uninstall', '--host', 'claude', '--scope', 'user', '--yes'], { env });
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(fs.readFileSync(config, 'utf8'));
  assert.equal(after.theme, 'dark');
  assert.equal(after.unrelated, true);
  assert.ok(!after.hooks || Object.values(after.hooks).every((entries) => entries.length === 0));
});

test('Codex can reuse Claude Code native MEMORY.md without duplicating Claude native loading', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-native-'));
  const cwd = path.join(home, 'work', 'demo');
  fs.mkdirSync(cwd, { recursive: true });
  const key = path.resolve(cwd).replaceAll('\\', '-').replaceAll('/', '-').replaceAll(':', '-');
  const memory = path.join(home, '.claude', 'projects', key, 'memory', 'MEMORY.md');
  fs.mkdirSync(path.dirname(memory), { recursive: true });
  fs.writeFileSync(memory, '# Project memory\nUse the blue deployment lane.\n');
  let result = run(hook, ['recall', '--host', 'codex'], {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'claude-native' },
    input: JSON.stringify({ cwd, prompt: 'Which deployment lane should I use now?' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /claude-native/);
  assert.match(result.stdout, /blue deployment lane/);

  result = run(hook, ['recall', '--host', 'claude'], {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'claude-native' },
    input: JSON.stringify({ cwd, prompt: 'Which deployment lane should I use now?' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('external memory command provider uses an absolute executable without a shell', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-external-'));
  const provider = path.join(home, 'provider.mjs');
  fs.writeFileSync(provider, '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end", () => console.log("external provider memory"));\n');
  fs.chmodSync(provider, 0o755);
  const result = run(hook, ['recall', '--host', 'codex'], {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'external-command', PAMR_MEMORY_COMMAND: provider },
    input: JSON.stringify({ cwd: home, prompt: 'Recall the external provider context please' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /external provider memory/);
});

test('Stop hook is installed and explicit candidates are staged only when enabled', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-stop-'));
  const env = { ...process.env, HOME: home };
  let result = run(cli, ['install', '--host', 'claude', '--scope', 'user', '--hooks', '--yes'], { env });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'));
  assert.ok(Array.isArray(config.hooks.Stop));
  assert.match(JSON.stringify(config.hooks.Stop), /stage-candidate/);

  result = run(hook, ['stage-candidate', '--host', 'claude'], {
    env: { ...env, PAMR_ENABLE_CANDIDATE_STAGING: '1' },
    input: JSON.stringify({ last_assistant_message: 'MEMORY_CANDIDATE: Prefer concise release summaries.' }),
  });
  assert.equal(result.status, 0, result.stderr);
  const queue = fs.readFileSync(path.join(home, '.local/share/personal-assistant-memory-routing/candidates.jsonl'), 'utf8');
  assert.match(queue, /Prefer concise release summaries/);
  assert.match(queue, /review_required/);
});


test('claude-mem bridge uses the validated loopback API when no native host plugin is active', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-claude-mem-'));
  fs.mkdirSync(path.join(home, '.claude-mem'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude-mem/settings.json'), '{}\n');
  const { child, port } = await startClaudeMemMock(home);
  t.after(() => child.kill());
  const result = run(hook, ['recall', '--host', 'codex'], {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'claude-mem', PAMR_CLAUDE_MEM_PORT: String(port) },
    input: JSON.stringify({ cwd: path.join(home, 'demo'), prompt: 'Which deployment lane did we choose previously?' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /claude-mem/);
  assert.match(result.stdout, /blue deployment lane/);
});

test('claude-mem bridge avoids duplicate injection when Codex native plugin is enabled', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-claude-mem-native-'));
  fs.mkdirSync(path.join(home, '.claude-mem'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude-mem/settings.json'), '{}\n');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex/config.toml'), '[plugins."claude-mem@thedotmack"]\nenabled = true\n');
  const { child, port } = await startClaudeMemMock(home);
  t.after(() => child.kill());
  const base = {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'claude-mem', PAMR_CLAUDE_MEM_PORT: String(port) },
    input: JSON.stringify({ cwd: path.join(home, 'demo'), prompt: 'Which deployment lane did we choose previously?' }),
  };
  let result = run(hook, ['recall', '--host', 'codex'], base);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');

  result = run(hook, ['recall', '--host', 'codex'], {
    ...base,
    env: { ...base.env, PAMR_FORCE_CLAUDE_MEM_RECALL: '1' },
  });
  assert.match(result.stdout, /blue deployment lane/);
});

test('invalid claude-mem ports fail open without making a request', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pamr-claude-mem-port-'));
  fs.mkdirSync(path.join(home, '.claude-mem'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude-mem/settings.json'), '{"CLAUDE_MEM_WORKER_PORT":"not-a-port"}\n');
  const result = run(hook, ['recall', '--host', 'codex'], {
    env: { ...process.env, HOME: home, PAMR_MEMORY_PROVIDERS: 'claude-mem', PAMR_CLAUDE_MEM_PORT: '70000' },
    input: JSON.stringify({ cwd: home, prompt: 'Recall the prior deployment decision please' }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
