import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

const work = mkdtempSync(`${tmpdir()}/qr-chat-pg-names-`);
const data = `${work}/data`;
const socket = `${work}/socket`;
mkdirSync(socket);
const port = 20_000 + (process.pid % 40_000);
const fixture = fileURLToPath(new URL('./sql/qr-group-names-regression.sql', import.meta.url));
let started = false;
let stopped = false;
let testFailure;
let stopFailure;

try {
  run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-instructions', '-c', 'dynamic_shared_memory_type=mmap', '-c', 'shared_memory_type=mmap']);
  run('pg_ctl', ['-D', data, '-l', `${work}/postgres.log`, '-o', `-h '' -p ${port} -k ${socket}`, '-w', 'start']);
  started = true;
  run('psql', ['--no-psqlrc', '-h', socket, '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', fixture]);
} catch (error) {
  testFailure = error;
} finally {
  if (started) {
    try {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      stopped = true;
    } catch (error) {
      stopFailure = error;
    }
  }

  if (!started || stopped) {
    rmSync(work, { recursive: true, force: true });
  } else {
    process.stderr.write(`PostgreSQL may still be running. Its cluster was preserved at ${work}\n`);
  }
}

if (testFailure && stopFailure) {
  throw new AggregateError([testFailure, stopFailure], `SQL fixture failed and PostgreSQL could not be stopped; cluster preserved at ${work}`);
}
if (testFailure) throw testFailure;
if (stopFailure) {
  throw new Error(`PostgreSQL could not be stopped; cluster preserved at ${work}`, { cause: stopFailure });
}
