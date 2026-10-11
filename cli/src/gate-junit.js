import { SaxesParser } from 'saxes';
import { ConfigurationError } from './errors.js';

const invalid = detail => { throw new ConfigurationError(`Platform returned invalid gate JUnit: ${detail}`); };
const countKeys = ['tests', 'failures', 'errors', 'skipped'];
const outcomes = new Set(['failure', 'error', 'skipped']);
const children = {
  testsuites: new Set(['testsuite']),
  testsuite: new Set(['testcase', 'properties', 'system-out', 'system-err']),
  testcase: new Set(['failure', 'error', 'skipped', 'properties', 'system-out', 'system-err']),
  properties: new Set(['property']),
  property: new Set(), failure: new Set(), error: new Set(), skipped: new Set(), 'system-out': new Set(), 'system-err': new Set()
};
const textElements = new Set(['property', 'failure', 'error', 'skipped', 'system-out', 'system-err']);

function parseXml(xml) {
  let root;
  const stack = [];
  const parser = new SaxesParser();
  parser.on('error', () => invalid('malformed XML'));
  parser.on('doctype', () => invalid('DOCTYPE is not supported'));
  parser.on('opentag', tag => {
    if (!Object.hasOwn(children, tag.name) || (stack.length && !children[stack.at(-1).name].has(tag.name))) invalid('invalid JUnit element structure');
    const node = { name: tag.name, attributes: tag.attributes, children: [] };
    if (stack.length) stack.at(-1).children.push(node);
    else root = node;
    stack.push(node);
  });
  const checkText = value => {
    if (value.trim() && stack.length && !textElements.has(stack.at(-1).name)) invalid('unexpected text in JUnit structure');
  };
  parser.on('text', checkText);
  parser.on('cdata', checkText);
  parser.on('closetag', () => stack.pop());
  parser.write(xml).close();
  return root;
}

function counts(node) {
  const result = {};
  for (const key of countKeys) {
    const value = node.attributes[key];
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) invalid('missing or invalid suite counts');
    result[key] = Number(value);
  }
  return result;
}

function checkCounts(actual, declared) {
  if (countKeys.some(key => actual[key] !== declared[key])) invalid('suite counts disagree with nodes');
}

function validateSuite(suite, gate) {
  if (suite.name !== 'testsuite') invalid('expected testsuite');
  const cases = suite.children.filter(child => child.name === 'testcase');
  const actual = { tests: cases.length, failures: 0, errors: 0, skipped: 0 };
  for (const testCase of cases) {
    const result = testCase.children.filter(child => outcomes.has(child.name));
    if (result.length > 1) invalid('testcase has conflicting outcomes');
    if (result.length) {
      const outcome = result[0];
      actual[outcome.name === 'failure' ? 'failures' : outcome.name === 'error' ? 'errors' : 'skipped']++;
      if (outcome.name === 'skipped' && !outcome.attributes.message?.startsWith('Quarantined failure:')) invalid('skipped testcase is not a quarantined failure');
    }
  }
  checkCounts(actual, counts(suite));
  const expectedTests = gate.total + gate.infrastructureFailures;
  if (!Number.isSafeInteger(expectedTests) || actual.tests !== expectedTests || actual.failures !== gate.blockingFailures
    || actual.skipped !== gate.quarantinedFailures || actual.errors !== gate.infrastructureFailures
    || actual.tests - actual.failures - actual.errors - actual.skipped !== gate.passed) invalid('report counts contradict gate');
  return actual;
}

export function validateGateJunit(xml, execution, command) {
  const root = parseXml(xml);
  if (!root || root.name !== (command === 'matrix' ? 'testsuites' : 'testsuite')) invalid('unexpected root element');
  if (command !== 'matrix') {
    validateSuite(root, execution.gate);
    return;
  }
  if (root.children.some(child => child.name !== 'testsuite') || root.children.length !== execution.variants.length) invalid('matrix suites do not match targets');
  const total = { tests: 0, failures: 0, errors: 0, skipped: 0 };
  const labels = new Set();
  for (const suite of root.children) {
    // The platform includes the browser label in each suite name.
    const matches = execution.variants.filter(variant => suite.attributes.name === variant.label || suite.attributes.name?.endsWith(` [${variant.label}]`));
    if (matches.length !== 1 || labels.has(matches[0].label)) invalid('matrix suite target is missing or duplicated');
    labels.add(matches[0].label);
    const actual = validateSuite(suite, matches[0].gate);
    for (const key of countKeys) total[key] += actual[key];
  }
  checkCounts(total, counts(root));
}
