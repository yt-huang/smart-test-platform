import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { runCommand } from '../src/run.js';

const env = { PLATFORM_URL: 'https://platform.example', PLATFORM_TOKEN: 'private-token' };
const silent = { out: () => {}, err: () => {} };

test('invalid root URLs and malformed tokens fail without leaking credentials or calling API', async () => {
  for (const url of ['file:///tmp/platform', 'https://alice:private-password@platform.example', 'https://platform.example?token=private-query', 'https://platform.example/#private-fragment', 'not-a-url']) {
    const errors = []; let calls = 0;
    assert.equal(await runCommand(['run', '--plan', 'p1'], { ...env, PLATFORM_URL: url }, { ...silent, err: value => errors.push(value), fetchImpl: async () => { calls++; } }), 2);
    assert.equal(calls, 0);
    assert.doesNotMatch(errors.join('\n'), /private-token|alice|private-password|private-query|private-fragment/);
  }
  assert.equal(await runCommand(['run', '--plan', 'p1'], { ...env, PLATFORM_TOKEN: 'bad\r\ntoken' }, silent), 2);
});

test('API error details and target messages redact bearer tokens and credentials', async () => {
  const errors = [];
  const detail = 'private-token Bearer other-secret https://user:secret-password@platform.example token=more-secret password=credential {"password":"json-credential"}';
  assert.equal(await runCommand(['run', '--plan', 'p1'], env, {
    ...silent, err: value => errors.push(value), fetchImpl: async () => new Response(JSON.stringify({ message: detail }), { status: 403 })
  }), 2);
  assert.match(errors[0], /HTTP 403/);
  assert.doesNotMatch(errors[0], /private-token|other-secret|user:secret-password|more-secret|credential/);
  const outputs = [];
  assert.equal(await runCommand(['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'], env, {
    ...silent, out: value => outputs.push(value), fetchImpl: async () => new Response(JSON.stringify({ id: 'm1', status: 'FAILED', summary: { total: 2, passed: 1, failed: 1 }, variants: [
      { label: 'chromium', runId: 'r1', status: 'PASSED', summary: { total: 1, passed: 1, failed: 0 } },
      { label: 'firefox', runId: 'r2', status: 'FAILED', summary: { total: 1, passed: 0, failed: 1 }, message: detail }
    ] }))
  }), 1);
  assert.doesNotMatch(outputs.join('\n'), /private-token|other-secret|user:secret-password|more-secret|credential/);
});

test('request errors do not expose token-bearing errors from the transport', async () => {
  const errors = [];
  assert.equal(await runCommand(['run', '--plan', 'p1'], env, { ...silent, err: value => errors.push(value), fetchImpl: async () => { throw new Error('private-token'); } }), 2);
  assert.doesNotMatch(errors[0], /private-token/);
});

test('real HTTP redirects are rejected without forwarding bearer authorization to another origin', async t => {
  let targetRequests = 0; let sourceAuthorization;
  const target = http.createServer((request, response) => { targetRequests++; response.writeHead(200).end('{"id":"r1","status":"PASSED"}'); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  t.after(() => new Promise(resolve => target.close(resolve)));
  const source = http.createServer((request, response) => {
    sourceAuthorization = request.headers.authorization;
    response.writeHead(307, { Location: `http://127.0.0.1:${target.address().port}/api/runs` }).end();
  });
  source.listen(0, '127.0.0.1'); await once(source, 'listening');
  t.after(() => new Promise(resolve => source.close(resolve)));
  const errors = [];
  const code = await runCommand(['run', '--plan', 'p1'], { ...env, PLATFORM_URL: `http://127.0.0.1:${source.address().port}` }, { ...silent, err: value => errors.push(value) });
  assert.equal(code, 2);
  assert.equal(sourceAuthorization, 'Bearer private-token');
  assert.equal(targetRequests, 0);
  assert.match(errors[0], /redirects/);
  assert.doesNotMatch(errors[0], /private-token/);
});

test('redirect responses from an injected transport are also rejected', async () => {
  let calls = 0;
  const code = await runCommand(['run', '--plan', 'p1'], env, { ...silent, fetchImpl: async (_url, options) => {
    calls++; assert.equal(options.redirect, 'error'); return new Response('', { status: 302, headers: { Location: 'https://other.example' } });
  } });
  assert.equal(code, 2);
  assert.equal(calls, 1);
});
