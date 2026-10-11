import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { parseArgs, runCommand } from '../src/run.js';

const env = { PLATFORM_URL: 'https://platform.example', PLATFORM_TOKEN: 'test-token' };
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const silent = { out: () => {}, err: () => {} };
function matrix(status, targetStatuses = [status, status]) {
  const variants = ['chromium', 'firefox'].map((label, index) => {
    const targetStatus = targetStatuses[index];
    return { label, capabilities: { browser: label, platform: 'web' }, runId: `r${index + 1}`, status: targetStatus,
      summary: { total: targetStatus === 'PASSED' || targetStatus === 'FAILED' ? 1 : 0, passed: targetStatus === 'PASSED' ? 1 : 0, failed: targetStatus === 'FAILED' ? 1 : 0 },
      message: targetStatus === 'TIMED_OUT' ? 'No matching browser resource became available' : '' };
  });
  return { id: 'm1', status, variants, summary: { totalVariants: 2, completedVariants: variants.filter(v => ['PASSED', 'FAILED', 'TIMED_OUT', 'CANCELLED'].includes(v.status)).length,
    passedVariants: variants.filter(v => v.status === 'PASSED').length, failedVariants: variants.filter(v => ['FAILED', 'TIMED_OUT'].includes(v.status)).length,
    total: variants.reduce((sum, v) => sum + v.summary.total, 0), passed: variants.reduce((sum, v) => sum + v.summary.passed, 0), failed: variants.reduce((sum, v) => sum + v.summary.failed, 0) } };
}

test('matrix trims and deduplicates browsers while keeping their order', () => {
  const options = parseArgs(['matrix', '--plan', 'p1', '--browsers', ' firefox,chromium,firefox, webkit ', '--timeout', '10', '--poll-interval', '100', '--name', 'nightly', '--commit', 'abc']);
  assert.deepEqual(options.browsers, ['firefox', 'chromium', 'webkit']);
  assert.equal(options.command, 'matrix');
  assert.equal(options.timeout, 10);
  assert.equal(options.pollInterval, 100);
  assert.equal(options.name, 'nightly');
  assert.equal(options.commit, 'abc');
});

test('invalid matrix selectors, browsers and options fail before any API call', async () => {
  const invalid = [
    ['matrix'], ['matrix', '--plan', 'p1'], ['matrix', '--browsers', 'chromium,firefox'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,chromium'],
    ['matrix', '--plan', 'p1', '--browsers', 'Chromium,firefox'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,safari'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox,'],
    ['matrix', '--plan', ' ', '--browsers', 'chromium,firefox'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--browsers', 'chromium,webkit'],
    ...['--suite', '--browser', '--platform'].map(option => ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', option, 'value']),
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--timeout', '0'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--poll-interval', '99'],
    ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', 'constructor', 'value'],
    ['run', '--plan', 'p1', '--browsers', 'chromium,firefox']
  ];
  for (const args of invalid) {
    let calls = 0;
    assert.equal(await runCommand(args, env, { ...silent, fetchImpl: async () => { calls++; return json(matrix('PASSED')); } }), 2, args.join(' '));
    assert.equal(calls, 0, args.join(' '));
  }
});

test('matrix submits inherited browser capabilities, polls all targets, then exports aggregate XML', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-matrix-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputs = [], calls = [];
  const states = [matrix('QUEUED'), matrix('RUNNING', ['PASSED', 'RUNNING']), matrix('PASSED')];
  const xml = '<testsuites tests="2" failures="0"><testsuite name="chromium" tests="1"/><testsuite name="firefox" tests="1"/></testsuites>';
  const target = path.join(directory, 'nested', 'matrix.xml');
  const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox,chromium', '--name', 'nightly', '--commit', 'abc', '--junit', target], env, {
    out: value => outputs.push(value), err: value => assert.fail(value), sleep: async () => {},
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/matrices')) {
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { planId: 'p1', name: 'nightly', commitSha: 'abc', variants: [
          { label: 'chromium', capabilities: { browser: 'chromium' } }, { label: 'firefox', capabilities: { browser: 'firefox' } }
        ] });
      }
      if (url.endsWith('/junit')) { assert.equal(states.length, 0); return new Response(xml); }
      return json(states.shift());
    }
  });
  assert.equal(code, 0);
  assert.deepEqual(calls.map(call => call.url), ['https://platform.example/api/matrices', 'https://platform.example/api/matrices/m1', 'https://platform.example/api/matrices/m1', 'https://platform.example/api/matrices/m1/junit']);
  assert.ok(outputs.includes('Report: https://platform.example/#/matrices/m1'));
  assert.ok(outputs.includes('  Report: https://platform.example/#/runs/r2'));
  assert.ok(outputs.includes('firefox: RUNNING (0 passed, 0 failed, 0 total)'));
  assert.ok(outputs.includes('firefox: PASSED (1 passed, 0 failed, 1 total)'));
  assert.equal(await readFile(target, 'utf8'), xml);
});

test('mixed failures, target timeout and cancellation return exit one and keep individual results', async () => {
  for (const [status, target] of [['FAILED', 'FAILED'], ['FAILED', 'TIMED_OUT'], ['CANCELLED', 'CANCELLED']]) {
    const outputs = [];
    const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'], env, {
      ...silent, out: value => outputs.push(value), fetchImpl: async () => json(matrix(status, ['PASSED', target]))
    });
    assert.equal(code, 1);
    assert.ok(outputs.some(value => value.startsWith(`chromium: PASSED`)));
    assert.ok(outputs.some(value => value.startsWith(`firefox: ${target}`)));
    if (target === 'TIMED_OUT') assert.ok(outputs.some(value => value.includes('No matching browser resource')));
  }
});

test('matrix follows assigned targets through running and cleaning before terminal export', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-matrix-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputs = [], calls = [];
  const states = [matrix('RUNNING', ['ASSIGNED', 'ASSIGNED']), matrix('RUNNING', ['CLEANING', 'RUNNING']), matrix('RUNNING', ['PASSED', 'CLEANING']), matrix('PASSED')];
  const target = path.join(directory, 'assigned.xml');
  const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--junit', target], env, {
    ...silent, out: value => outputs.push(value), sleep: async () => {}, fetchImpl: async url => {
      calls.push(url);
      if (url.endsWith('/junit')) { assert.equal(states.length, 0); return new Response('<testsuites tests="2" failures="0"/>'); }
      return json(states.shift());
    }
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 5);
  assert.ok(outputs.some(value => value.startsWith('chromium: ASSIGNED')));
  assert.ok(outputs.some(value => value.startsWith('chromium: CLEANING')));
  assert.ok(outputs.some(value => value.startsWith('firefox: CLEANING')));
  assert.match(await readFile(target, 'utf8'), /tests="2"/);
});

test('waiting timeout preserves report and target progress, never cancels or exports an active matrix', async () => {
  let time = 0; const calls = [], outputs = [], errors = [];
  const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--timeout', '1', '--junit', 'unused.xml'], env, {
    out: value => outputs.push(value), err: value => errors.push(value), now: () => time,
    sleep: async ms => { time += ms; }, fetchImpl: async url => { calls.push(url); return json(matrix('RUNNING', ['PASSED', 'QUEUED'])); }
  });
  assert.equal(code, 1);
  assert.deepEqual(calls, ['https://platform.example/api/matrices']);
  assert.match(errors[0], /matrix m1.*matrix remains active/);
  assert.ok(outputs.includes('Report: https://platform.example/#/matrices/m1'));
  assert.ok(outputs.some(value => value.startsWith('firefox: QUEUED')));
});

test('matrix API errors, malformed details and inconsistent early success return exit two', async () => {
  const values = [
    { id: 'm1', status: 'PASSED' },
    matrix('PASSED', ['PASSED', 'RUNNING']),
    matrix('PASSED', ['PASSED', 'FAILED']),
    matrix('RUNNING', ['PASSED', 'PASSED']),
    { ...matrix('PASSED'), variants: [matrix('PASSED').variants[0], matrix('PASSED').variants[0]] },
    { ...matrix('PASSED'), summary: undefined },
    { ...matrix('PASSED'), variants: matrix('PASSED').variants.map(variant => ({ ...variant, summary: undefined })) },
    { ...matrix('PASSED'), status: 'UNKNOWN' }
  ];
  for (const value of values) {
    assert.equal(await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'], env, { ...silent, fetchImpl: async () => json(value) }), 2);
  }
  assert.equal(await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'], env, { ...silent, fetchImpl: async () => new Response('{"message":"forbidden"}', { status: 403 }) }), 2);
  assert.equal(await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'], env, { ...silent, fetchImpl: async () => new Response('not-json') }), 2);
});

test('failure XML can be exported only after all targets reach terminal state', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-matrix-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'failure.xml'); let requests = 0;
  const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--junit', target], env, {
    ...silent, sleep: async () => {}, fetchImpl: async url => {
      requests++;
      if (requests === 1) return json(matrix('RUNNING', ['FAILED', 'RUNNING']));
      if (requests === 2) return json(matrix('FAILED', ['FAILED', 'PASSED']));
      assert.match(url, /\/matrices\/m1\/junit$/);
      return new Response('<testsuites tests="2" failures="1"/>');
    }
  });
  assert.equal(code, 1);
  assert.equal(requests, 3);
  assert.equal(await readFile(target, 'utf8'), '<testsuites tests="2" failures="1"/>');
});

test('report remains visible when XML export fails and GitHub metadata remains supported', async () => {
  const outputs = [];
  const code = await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox', '--junit', 'unused.xml'], { ...env, GITHUB_SHA: 'github-commit' }, {
    ...silent, out: value => outputs.push(value), fetchImpl: async (url, options) => {
      if (url.endsWith('/junit')) return new Response('unavailable', { status: 500 });
      assert.equal(JSON.parse(options.body).commitSha, 'github-commit');
      return json(matrix('PASSED'));
    }
  });
  assert.equal(code, 2);
  assert.ok(outputs.includes('Report: https://platform.example/#/matrices/m1'));
});
