import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function readConfig(env = process.env) {
  const url = new URL(env.PLATFORM_URL || 'http://localhost:8080');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('PLATFORM_URL must be an HTTP(S) platform URL without credentials, query, or fragment');
  }
  const platformUrl = url.toString().replace(/\/$/, '');
  const fingerprint = env.AGENT_HOST_FINGERPRINT || createHash('sha256').update(`${os.hostname()}|${os.platform()}|${os.arch()}`).digest('hex');
  if (!/^[a-zA-Z0-9._-]{1,256}$/.test(fingerprint)) throw new Error('AGENT_HOST_FINGERPRINT must use 1-256 letters, digits, dots, underscores, or dashes');
  const agentId = env.AGENT_ID || `browser-${fingerprint.slice(0, 16)}`;
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(agentId)) throw new Error('AGENT_ID must use 1-128 letters, digits, dots, underscores, or dashes');
  const browsers = (env.AGENT_BROWSERS || 'chromium').split(',').map(s => s.trim()).filter(Boolean);
  if (!browsers.length || browsers.some(b => !['chromium', 'firefox', 'webkit'].includes(b))) throw new Error('AGENT_BROWSERS supports chromium,firefox,webkit');
  const wsUrl = new URL(`${platformUrl}/ws/agent`);
  wsUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let appiumUrl;
  if (env.APPIUM_URL) {
    const value = new URL(env.APPIUM_URL);
    if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.search || value.hash) throw new Error('APPIUM_URL must be an HTTP(S) endpoint without embedded credentials');
    appiumUrl = value.toString().replace(/\/$/, '');
  }
  const androidPackage = env.AGENT_ANDROID_APP_PACKAGE;
  const androidActivity = env.AGENT_ANDROID_APP_ACTIVITY;
  if (androidPackage && !/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(androidPackage)) throw new Error('Invalid AGENT_ANDROID_APP_PACKAGE');
  if (androidActivity && !/^[a-zA-Z0-9_.$]+$/.test(androidActivity)) throw new Error('Invalid AGENT_ANDROID_APP_ACTIVITY');
  if (env.AGENT_ANDROID_BROWSER && env.AGENT_ANDROID_BROWSER !== 'Chrome') throw new Error('AGENT_ANDROID_BROWSER currently supports Chrome only');
  return {
    platformUrl, wsUrl: wsUrl.toString(), agentId, hostFingerprint: fingerprint,
    name: env.AGENT_NAME || `${os.hostname()} browser agent`, key: env.AGENT_KEY,
    keyFile: path.resolve(env.AGENT_KEY_FILE || '.state/agent-key.json'), adminPassword: env.PLATFORM_ADMIN_PASSWORD,
    browsers: [...new Set(browsers)], tags: (env.AGENT_TAGS || '').split(',').map(s => s.trim()).filter(Boolean),
    artifactsDir: path.resolve(env.AGENT_ARTIFACTS_DIR || env.AGENT_WORK_DIR || 'artifacts'), enableAdb: env.AGENT_ENABLE_ADB === 'true',
    allowPrivateNetwork: env.AGENT_ALLOW_PRIVATE_NETWORK === 'true',
    appiumUrl, appiumToken: env.APPIUM_TOKEN, androidPackage, androidActivity, androidBrowser: env.AGENT_ANDROID_BROWSER,
    stepTimeoutMs: integer(env.AGENT_STEP_TIMEOUT_MS, 15000, 100, 300000),
    executionTimeoutSeconds: integer(env.AGENT_EXECUTION_TIMEOUT_SECONDS, 300, 1, 86400),
    headless: env.AGENT_HEADLESS !== 'false'
  };
}

function integer(value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid numeric agent configuration: ${value}`);
  return number;
}
