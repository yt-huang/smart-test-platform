import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { parseArgs, runCommand } from '../src/run.js';
import { runFixture, matrixFixture, suiteXml, matrixXml } from './gate-fixtures.js';

const env = { PLATFORM_URL: 'https://platform.example', PLATFORM_TOKEN: 'fixture-token' };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const silent = { out: () => {}, err: () => {} };
const runArgs = ['run', '--plan', 'p1'];
const matrixArgs = ['matrix', '--plan', 'p1', '--browsers', 'chromium,firefox'];
const execute = (value, args = runArgs, hooks = {}) => runCommand([...args, '--gate'], env, { ...silent, fetchImpl: async () => json(value), ...hooks });

test('--gate is a single valueless flag for run and matrix and rejects values before API access', async () => {
  for (const args of [runArgs, matrixArgs]) {
    assert.equal(parseArgs([...args, '--gate']).gate, true);
    assert.equal(parseArgs([args[0], '--gate', ...args.slice(1)]).gate, true);
    for (const extra of [['--gate', '--gate'], ['--gate', '--gate', '--help'], ['--gate', 'true'], ['--gate=1'], ['--gate', 'false']]) {
      let requests = 0;
      assert.equal(await runCommand([...args, ...extra], env, { ...silent, fetchImpl: async () => { requests++; } }), 2);
      assert.equal(requests, 0);
    }
  }
});

test('same raw failure is default exit 1 but gate WARN exit 0 with visible raw report and counted warning', async () => {
  const value = runFixture(), output = [];
  assert.equal(await runCommand(runArgs, env, { ...silent, fetchImpl: async () => json(value) }), 1);
  assert.equal(await execute(value, runArgs, { out: text => output.push(text) }), 0);
  assert.ok(output.includes('Run r1: FAILED'));
  assert.ok(output.includes('Report: https://platform.example/#/runs/r1'));
  assert.ok(output.includes('FAILED: 1 passed, 1 failed, 2 total'));
  assert.match(output.join('\n'), /Gate: WARN \(1 passed, 1 quarantined failures, 0 blocking failures, 0 infrastructure failures/);
  assert.match(output.join('\n'), /WARNING:.*1 quarantined failures.*raw FAILED/);
});

test('gate PASSED and strict legacy passes exit 0; unquarantined failures and infrastructure always block', async () => {
  const passed = { status: 'PASSED', gateStatus: 'PASSED', passed: 2, quarantinedFailures: 0 };
  assert.equal(await execute(runFixture(passed)), 0);
  assert.equal(await execute(runFixture({ ...passed, policy: 'strict-legacy-v1', quarantinedCaseIds: [] })), 0);
  for (const value of [
    runFixture({ gateStatus: 'BLOCKED', blockingFailures: 1, quarantinedFailures: 0, quarantinedCaseIds: [] }),
    runFixture({ gateStatus: 'BLOCKED', infrastructureFailures: 1 }),
    runFixture({ gateStatus: 'BLOCKED', passed: 2, quarantinedFailures: 0, infrastructureFailures: 1 }),
    runFixture({ gateStatus: 'BLOCKED', policy: 'strict-legacy-v1', blockingFailures: 1, quarantinedFailures: 0, quarantinedCaseIds: [] })
  ]) assert.equal(await execute(value), 1);
});

test('cancelled and timed out gates preserve infrastructure blocking after late raw evidence', async () => {
  for (const status of ['CANCELLED', 'TIMED_OUT', 'FAILED']) {
    const value = runFixture({ status, gateStatus: 'BLOCKED', passed: 0, blockingFailures: 2, quarantinedFailures: 0,
      infrastructureFailures: 1, summary: { total: 2, passed: 2, failed: 0 } });
    assert.equal(await execute(value), 1);
  }
});

test('gate mode polls PENDING through assigned running cleaning and preserves client timeout semantics', async () => {
  const states = ['QUEUED', 'ASSIGNED', 'RUNNING', 'CLEANING'].map(status => runFixture({ status, gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 }));
  states.push(runFixture());
  const output = [];
  assert.equal(await execute(undefined, runArgs, { out: text => output.push(text), sleep: async () => {}, fetchImpl: async () => json(states.shift()) }), 0);
  assert.equal(states.length, 0);
  assert.match(output.join('\n'), /Gate: PENDING/);
  assert.match(output.join('\n'), /Gate: WARN/);
  let time = 0;
  const calls = [], errors = [];
  assert.equal(await execute(runFixture({ status: 'QUEUED', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 }), [...runArgs, '--timeout', '1', '--junit', 'unused.xml'], {
    now: () => time, sleep: async ms => { time += ms; }, err: text => errors.push(text), fetchImpl: async url => { calls.push(url); return json(runFixture({ status: 'QUEUED', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 })); }
  }), 1);
  assert.equal(calls.length, 1);
  assert.match(errors.join('\n'), /remains active/);
});

test('malformed gate data never falls back to raw success, polls or exports', async () => {
  const mutations = [
    value => { delete value.gate; }, value => { value.gate = null; }, value => { value.gate = []; },
    value => { value.gate.policy = 'unknown-v1'; }, value => { value.gate.policy = 'aggregate-v1'; },
    value => { value.gate.status = 'UNKNOWN'; }, value => { value.gate.status = 'PASSED'; },
    value => { value.gate.status = 'PENDING'; }, value => { value.status = 'PASSED'; },
    value => { value.gate.blockingFailures = 1; }, value => { value.gate.infrastructureFailures = 1; },
    value => { value.gate.quarantinedFailures = 0; }, value => { value.gate.passed = 0; },
    value => { value.gate.total = 0; }, value => { value.gate.total = 3; },
    value => { value.gate.passed = -1; }, value => { value.gate.quarantinedFailures = 0.5; },
    value => { value.gate.infrastructureFailures = '0'; }, value => { value.gate.total = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.gate.blockingFailures = Number.MAX_SAFE_INTEGER; },
    value => { value.gate.quarantinedCaseIds = ['login', 'login']; }, value => { value.gate.quarantinedCaseIds = [' ']; },
    value => { value.gate.quarantinedCaseIds = [23]; }, value => { value.gate.quarantinedCaseIds = []; },
    value => { value.gate.policy = 'strict-legacy-v1'; },
    value => { value.summary.failed = 0; }, value => { value.summary.passed = 0; },
    value => { value.summary.total = 3; }, value => { value.summary.passed = '1'; }, value => { delete value.summary; },
    value => { value.status = 'CANCELLED'; }, value => { value.status = 'TIMED_OUT'; }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = runFixture(); mutate(value); let calls = 0;
    assert.equal(await execute(value, [...runArgs, '--junit', 'unused.xml'], { fetchImpl: async () => { calls++; return json(value); } }), 2, `mutation ${index}`);
    assert.equal(calls, 1, `mutation ${index} must stop`);
  }
  const value = runFixture({ status: 'PASSED', gateStatus: 'PASSED', passed: 2, quarantinedFailures: 0 }); delete value.gate;
  assert.equal(await execute(value), 2);
  assert.equal(await runCommand(runArgs, env, { ...silent, fetchImpl: async () => json(value) }), 0, 'default historical raw behavior remains compatible');
});

test('active raw runs require PENDING gate with conservative partial counts', async () => {
  for (const gateStatus of ['PASSED', 'WARN', 'BLOCKED']) assert.equal(await execute(runFixture({ status: 'RUNNING', gateStatus })), 2);
  const value = runFixture({ status: 'CLEANING', gateStatus: 'PENDING' });
  let calls = 0;
  assert.equal(await execute(value, runArgs, { sleep: async () => {}, fetchImpl: async () => json(++calls === 1 ? value : runFixture()) }), 0);
});

test('suite submission keeps approved quarantined cases in business input and does not send client gate overrides', async () => {
  const cases = [{ id: 'login', suite: 'smoke', platform: 'web', status: 'APPROVED', quality: { quarantined: true } },
    { id: 'dashboard', suite: 'smoke', platform: 'web', status: 'APPROVED', quality: { quarantined: false } },
    { id: 'draft', suite: 'smoke', platform: 'web', status: 'DRAFT', quality: { quarantined: true } }];
  assert.equal(await execute(undefined, ['run', '--suite', 'smoke', '--commit', 'fixed-commit'], { fetchImpl: async (url, options) => {
    if (url.endsWith('/cases')) return json(cases);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.caseIds, ['login', 'dashboard']);
    assert.equal(body.commitSha, 'fixed-commit');
    assert.deepEqual(body.capabilities, { platform: 'web', browser: 'chromium', provider: 'local', tags: [] });
    assert.equal(body.gate, undefined);
    assert.equal(body.quarantinedCaseIds, undefined);
    return json(runFixture());
  } }), 0);
});

test('matrix gate waits for every target and aggregates WARN separately from the raw FAILED status', async () => {
  const states = [matrixFixture([runFixture(), runFixture({ id: 'r2', status: 'RUNNING', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 })]), matrixFixture()];
  const output = [];
  assert.equal(await execute(undefined, matrixArgs, { sleep: async () => {}, out: text => output.push(text), fetchImpl: async () => json(states.shift()) }), 0);
  assert.equal(states.length, 0);
  assert.match(output.join('\n'), /Report: https:\/\/platform.example\/#\/matrices\/m1/);
  assert.match(output.join('\n'), /Report: https:\/\/platform.example\/#\/runs\/r2/);
  assert.match(output.join('\n'), /firefox: RUNNING/);
  assert.match(output.join('\n'), /Gate: PENDING/);
  assert.match(output.join('\n'), /Gate: WARN/);
});

test('matrix applies BLOCKED precedence over quarantined WARN and permits raw late evidence for infrastructure', async () => {
  const value = matrixFixture([runFixture(), runFixture({ id: 'r2', status: 'TIMED_OUT', gateStatus: 'BLOCKED', passed: 0,
    blockingFailures: 2, quarantinedFailures: 0, infrastructureFailures: 1, summary: { total: 2, passed: 2, failed: 0 } })]);
  assert.equal(await execute(value, matrixArgs), 1);
  const passed = () => runFixture({ status: 'PASSED', gateStatus: 'PASSED', passed: 2, quarantinedFailures: 0 });
  assert.equal(await execute(matrixFixture([passed(), { ...passed(), id: 'r2' }]), matrixArgs), 0);
});

test('matrix rejects target gate absence, illegal policies, aggregate counts status and stable ID inconsistency', async () => {
  const mutations = [
    value => { delete value.gate; }, value => { delete value.variants[1].gate; },
    value => { value.gate.policy = 'quarantine-at-submission-v1'; }, value => { value.variants[0].gate.policy = 'aggregate-v1'; },
    value => { value.gate.status = 'BLOCKED'; }, value => { value.gate.status = 'PENDING'; },
    value => { value.gate.passed--; }, value => { value.gate.total++; }, value => { value.gate.infrastructureFailures++; },
    value => { value.gate.quarantinedCaseIds = ['other']; }, value => { value.gate.quarantinedCaseIds = ['login', 'login']; },
    value => { value.variants[1].gate.quarantinedCaseIds = ['other']; },
    value => { value.variants[0].gate.status = 'PASSED'; }, value => { value.variants[1].gate.total = Number.MAX_SAFE_INTEGER + 1; },
    ...['totalVariants', 'completedVariants', 'passedVariants', 'failedVariants'].map(key => value => { value.summary[key] = 55; })
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = matrixFixture(); mutate(value); let calls = 0;
    assert.equal(await execute(value, matrixArgs, { fetchImpl: async () => { calls++; return json(value); } }), 2, `matrix mutation ${index}`);
    assert.equal(calls, 1);
  }
  const ordered = matrixFixture([runFixture({ total: 3, passed: 2, quarantinedCaseIds: ['login', 'dashboard'] }), runFixture({ id: 'r2', total: 3, passed: 2, quarantinedCaseIds: ['login', 'dashboard'] })]);
  assert.equal(await execute(ordered, matrixArgs), 0);
  ordered.gate.quarantinedCaseIds.reverse();
  assert.equal(await execute(ordered, matrixArgs), 2, 'aggregate IDs must keep target encounter order');
});

test('gate-junit exports valid warning and infrastructure reports for run and matrix while raw mode keeps original route', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-gate-cli-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const blocked = runFixture({ gateStatus: 'BLOCKED', infrastructureFailures: 1 });
  const entries = [[runFixture(), runArgs, 0], [blocked, runArgs, 1], [matrixFixture(), matrixArgs, 0], [matrixFixture([runFixture(), { ...blocked, id: 'r2' }]), matrixArgs, 1]];
  for (const [index, [value, args, expected]] of entries.entries()) {
    const target = path.join(directory, `${index}.xml`), calls = [];
    const xml = args[0] === 'matrix' ? matrixXml(value) : suiteXml(value.gate);
    assert.equal(await execute(value, [...args, '--junit', target], { fetchImpl: async url => {
      calls.push(url); return url.endsWith('/gate-junit') ? new Response(xml) : json(value);
    } }), expected);
    assert.match(calls[1], /\/gate-junit$/);
    assert.equal(await readFile(target, 'utf8'), xml);
  }
  const original = '<testsuite tests="2" failures="1"/>', target = path.join(directory, 'raw.xml');
  assert.equal(await runCommand([...runArgs, '--junit', target], env, { ...silent, fetchImpl: async url => url.endsWith('/junit') ? new Response(original) : json(runFixture()) }), 1);
  assert.equal(await readFile(target, 'utf8'), original);
});

test('malformed and contradictory gate XML returns 2 and cannot overwrite a previous report', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-gate-xml-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'report.xml'); await writeFile(target, 'previous valid report');
  const value = runFixture(), good = suiteXml(value.gate);
  const invalidXml = ['', 'not XML', '<html><body>login required</body></html>', good.slice(0, -12), good + good,
    good.replace('errors="0"', 'errors="1"'), good.replace('skipped="1"', 'skipped="0"'), good.replace('tests="2"', 'tests="3"'),
    good.replace('failures="0"', 'failures="9007199254740992"'), good.replace('Quarantined failure:', 'Normal skip:'),
    good.replace('<skipped ', '<failure '), good.replace('<skipped ', '<error '),
    good.replace('<testcase name="pass-0"/>', '<testcase name="pass-0"><failure/><skipped message="Quarantined failure:"/></testcase>'),
    good.replace('expected &lt;', 'expected &bogus;'), good.replace('<testcase name="pass-0"/>', '<testcase name="pass-0"><properties><failure message="hidden error"/></properties></testcase>'),
    good.replace('<testcase name="pass-0"/>', '<testcase name="pass-0">error page</testcase>'),
    `<!DOCTYPE testsuite [<!ENTITY sample SYSTEM "file:///secret">]>${good}`];
  for (const [index, xml] of invalidXml.entries()) {
    const output = [];
    assert.equal(await execute(value, [...runArgs, '--junit', target], { out: text => output.push(text), fetchImpl: async url => url.endsWith('/gate-junit') ? new Response(xml) : json(value) }), 2, `XML mutation ${index}`);
    assert.ok(output.includes('Report: https://platform.example/#/runs/r1'));
    assert.equal(await readFile(target, 'utf8'), 'previous valid report');
  }
  const blocked = runFixture({ gateStatus: 'BLOCKED', infrastructureFailures: 1 });
  assert.equal(await execute(blocked, [...runArgs, '--junit', target], { fetchImpl: async url => url.endsWith('/gate-junit') ? new Response(good) : json(blocked) }), 2);
});

test('matrix XML refuses duplicated or missing targets, per-target contradictions and aggregate count mismatches', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-gate-matrix-xml-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const value = matrixFixture(), good = matrixXml(value);
  const xmlValues = [good.replace('[firefox]', '[chromium]'), good.replace('[firefox]', '[webkit]'), good.replace('tests="4"', 'tests="5"'),
    good,
    good.replace(suiteXml(value.variants[1].gate, 'plan [firefox]'), ''), suiteXml(value.variants[0].gate)];
  // Swapping labels while leaving target results in place must also be rejected.
  xmlValues[3] = good.replace('[chromium]', '[TEMP]').replace('[firefox]', '[chromium]').replace('[TEMP]', '[firefox]');
  for (const [index, xml] of xmlValues.entries()) assert.equal(await execute(value, [...matrixArgs, '--junit', path.join(directory, 'invalid.xml')], {
    fetchImpl: async url => url.endsWith('/gate-junit') ? new Response(xml) : json(value)
  }), 2, `matrix XML mutation ${index}`);
});

test('gate polling rejects missing or changed execution identity and missing gate in later responses', async () => {
  const pending = runFixture({ status: 'RUNNING', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 });
  for (const final of [{ ...runFixture(), id: 'different-run' }, { id: 'r1', status: 'PASSED', summary: { total: 2, passed: 2, failed: 0 } }]) {
    let calls = 0;
    assert.equal(await execute(undefined, runArgs, { sleep: async () => {}, fetchImpl: async () => json(++calls === 1 ? pending : final) }), 2);
    assert.equal(calls, 2);
  }
});

test('submission gate policy totals frozen case IDs and matrix run identities cannot change during polling', async () => {
  const pending = () => runFixture({ status: 'RUNNING', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 });
  const values = [runFixture({ quarantinedCaseIds: ['other'] }), runFixture({ total: 3, passed: 2 }),
    runFixture({ status: 'PASSED', gateStatus: 'PASSED', passed: 2, quarantinedFailures: 0, quarantinedCaseIds: [], policy: 'strict-legacy-v1' })];
  for (const value of values) {
    let calls = 0;
    assert.equal(await execute(undefined, runArgs, { sleep: async () => {}, fetchImpl: async () => json(++calls === 1 ? pending() : value) }), 2);
  }
  const first = matrixFixture([pending(), { ...pending(), id: 'r2' }]);
  const final = matrixFixture(); final.variants[1].runId = 'replacement-run';
  let calls = 0;
  assert.equal(await execute(undefined, matrixArgs, { sleep: async () => {}, fetchImpl: async () => json(++calls === 1 ? first : final) }), 2);
});

test('gate output and rejected payloads redact polluted tokens including encoded IDs and timeout messages', async () => {
  const pollutedEnv = { ...env, PLATFORM_TOKEN: '  private token/+  ' }, output = [], errors = [];
  const value = matrixFixture(); value.id = 'private token/+'; value.variants[0].runId = 'private token/+1';
  value.variants[0].message = 'Bearer other-secret token=leak password=secret private token/+';
  assert.equal(await runCommand([...matrixArgs, '--gate'], pollutedEnv, { out: text => output.push(text), err: text => errors.push(text), fetchImpl: async () => json(value) }), 0);
  value.gate.policy = 'private token/+';
  assert.equal(await runCommand([...matrixArgs, '--gate'], pollutedEnv, { out: text => output.push(text), err: text => errors.push(text), fetchImpl: async () => json(value) }), 2);
  let time = 0;
  const pending = runFixture({ id: 'private token/+', status: 'QUEUED', gateStatus: 'PENDING', passed: 0, quarantinedFailures: 0 });
  assert.equal(await runCommand([...runArgs, '--gate', '--timeout', '1'], pollutedEnv, {
    out: text => output.push(text), err: text => errors.push(text), now: () => time, sleep: async ms => { time += ms; }, fetchImpl: async () => json(pending)
  }), 1);
  assert.doesNotMatch([...output, ...errors].join('\n'), /private token|private%20token|other-secret|token=leak|password=secret/);
});

test('actual CLI processes submit and export against a local HTTP fixture with truthful gate and raw exits', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-gate-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const server = http.createServer(async (request, response) => {
    calls.push({ url: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', request.url.endsWith('junit') ? 'application/xml' : 'application/json');
    if (request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk;
      assert.equal(JSON.parse(body).planId, 'p1');
      response.end(JSON.stringify(request.url === '/api/matrices' ? matrixFixture() : runFixture()));
    } else response.end(request.url.includes('/matrices/') ? matrixXml(matrixFixture()) : suiteXml(runFixture().gate));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const [index, args] of [[...runArgs, '--gate'], runArgs, [...matrixArgs, '--gate']].entries()) {
    const target = path.join(directory, `${index}.xml`);
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url)), ...args, '--junit', target], {
      env: { ...process.env, PLATFORM_URL: `http://127.0.0.1:${server.address().port}`, PLATFORM_TOKEN: 'fixture-token' }, windowsHide: true
    });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, index === 1 ? 1 : 0); assert.equal(stderr, '');
    assert.match(stdout, /FAILED/); assert.match(stdout, /Report:/);
    if (index !== 1) assert.match(stdout, /WARNING: Gate WARN/);
    assert.match(await readFile(target, 'utf8'), /<testsuite/);
  }
  assert.ok(calls.every(call => call.authorization === 'Bearer fixture-token'));
  assert.deepEqual(calls.map(call => call.url), ['/api/runs', '/api/runs/r1/gate-junit', '/api/runs', '/api/runs/r1/junit', '/api/matrices', '/api/matrices/m1/gate-junit']);
});

test('actual HTTP redirects on gate export never forward bearer authorization to a second origin or write a report', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-gate-redirect-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let targetCalls = 0;
  const target = http.createServer((_request, response) => { targetCalls++; response.end(suiteXml(runFixture().gate)); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening'); t.after(() => new Promise(resolve => target.close(resolve)));
  const source = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    if (request.url.endsWith('/gate-junit')) response.writeHead(307, { Location: `http://127.0.0.1:${target.address().port}/stolen` }).end();
    else response.end(JSON.stringify(runFixture()));
  });
  source.listen(0, '127.0.0.1'); await once(source, 'listening'); t.after(() => new Promise(resolve => source.close(resolve)));
  const output = [], errors = [], report = path.join(directory, 'redirect.xml');
  assert.equal(await runCommand([...runArgs, '--gate', '--junit', report], { ...env, PLATFORM_URL: `http://127.0.0.1:${source.address().port}` }, {
    out: text => output.push(text), err: text => errors.push(text)
  }), 2);
  assert.equal(targetCalls, 0); assert.match(errors.join('\n'), /redirects/);
  assert.doesNotMatch(errors.join('\n'), /fixture-token/); assert.match(output.join('\n'), /Report:/);
  await assert.rejects(readFile(report), { code: 'ENOENT' });
});
