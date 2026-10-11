import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { parseArgs, runCommand } from '../src/run.js';

const env = { PLATFORM_URL: 'https://platform.example', PLATFORM_TOKEN: 'test-token' };
const cases = [{ id: 'approved', suite: 'smoke', status: 'APPROVED', platform: 'web' }, { id: 'draft', suite: 'smoke', status: 'DRAFT', platform: 'web' }];
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
test('run requires exactly one selector and validates options', () => {
  for (const args of [['run'], ['run', '--suite', 'smoke', '--plan', 'p1'], ['run', '--suite', 'all'], ['run', '--plan', 'p1', '--browser', 'chromium'], ['run', '--plan', 'p1', '--timeout', 'zero'], ['run', '--suite', 'smoke', '--eval', 'x']]) assert.throws(() => parseArgs(args));
  assert.equal(parseArgs(['run', '--suite', 'smoke']).browser, undefined);
});
test('CLI excludes drafts, authenticates every request, polls and exports JUnit', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputs = [], calls = []; let poll = 0;
  const code = await runCommand(['run', '--suite', 'smoke', '--junit', path.join(directory, 'report.xml')], env, {
    out: text => outputs.push(text), err: text => assert.fail(text), sleep: async () => {},
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer test-token'); calls.push({ url, options });
      if (url.endsWith('/cases')) return json(cases);
      if (url.endsWith('/runs')) { assert.deepEqual(JSON.parse(options.body).caseIds, ['approved']); return json({ id: 'r1', status: 'QUEUED' }); }
      if (url.endsWith('/junit')) return new Response('<testsuite tests="1" failures="0"/>');
      return json({ id: 'r1', status: ++poll === 1 ? 'RUNNING' : 'PASSED', summary: { total: 1, passed: 1, failed: 0 } });
    }
  });
  assert.equal(code, 0); assert.equal(poll, 2); assert.ok(outputs.includes('Report: https://platform.example/#/runs/r1'));
  assert.match(await readFile(path.join(directory, 'report.xml'), 'utf8'), /failures="0"/);
});
test('failure, timeout and cancellation return exit one for plan runs', async () => {
  for (const status of ['FAILED', 'TIMED_OUT', 'CANCELLED']) {
    assert.equal(await runCommand(['run', '--plan', 'p1'], env, { out: () => {}, err: () => {}, fetchImpl: async () => json({ id: 'r1', status }) }), 1);
  }
});
test('missing auth, API rejection and empty or mixed suites return configuration exit two', async () => {
  const silent = { out: () => {}, err: () => {} };
  assert.equal(await runCommand(['run', '--plan', 'p1'], {}, silent), 2);
  assert.equal(await runCommand(['run', '--plan', 'p1'], env, { ...silent, fetchImpl: async () => new Response('{"message":"forbidden"}', { status: 403 }) }), 2);
  for (const value of [[], [...cases, { id: 'android', suite: 'smoke', status: 'APPROVED', platform: 'android' }]]) assert.equal(await runCommand(['run', '--suite', 'smoke'], env, { ...silent, fetchImpl: async () => json(value) }), 2);
});
test('client polling deadline returns failure without claiming the platform run was cancelled', async () => {
  let time = 0; const errors = [];
  const code = await runCommand(['run', '--plan', 'p1', '--timeout', '1'], env, { out: () => {}, err: value => errors.push(value), now: () => time, sleep: async () => { time += 1000; }, fetchImpl: async () => json({ id: 'r1', status: 'QUEUED' }) });
  assert.equal(code, 1); assert.match(errors[0], /remains active/);
});
