import { chromium, firefox, webkit } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

export const browserTypes = { chromium, firefox, webkit };
const exec = promisify(execFile);

export async function discoverTargets(config, log = console.log) {
  const targets = [];
  for (const name of config.browsers) {
    let browser;
    try {
      browser = await browserTypes[name].launch({ headless: config.headless, timeout: 30000 });
      const version = browser.version();
      await browser.close();
      if (browser.isConnected()) throw new Error('Browser process is still connected after close');
      targets.push({ id: `${config.agentId}-${name}`, name: `${name} on ${os.hostname()}`, platform: 'web',
        version, browser: name, brand: 'Playwright', model: os.arch(), provider: 'local', tags: config.tags,
        status: 'IDLE', cleanupOk: true });
    } catch (error) {
      await browser?.close().catch(() => {});
      log(`Browser ${name} unavailable: ${error.message.split('\n')[0]}`);
    }
  }
  if (config.enableAdb) {
    try {
      const { stdout } = await exec('adb', ['devices', '-l'], { timeout: 10000 });
      for (const line of stdout.split('\n').slice(1)) {
        const [serial, state] = line.trim().split(/\s+/);
        if (!serial || state !== 'device') continue;
        const get = async key => (await exec('adb', ['-s', serial, 'shell', 'getprop', key], { timeout: 5000 })).stdout.trim();
        targets.push({ id: `${config.agentId}-adb-${serial}`, name: serial, platform: 'android',
          version: await get('ro.build.version.release'), browser: '', brand: await get('ro.product.brand'),
          model: await get('ro.product.model'), provider: 'local', tags: [...config.tags, 'enumeration-only'],
          status: 'MAINTENANCE', cleanupOk: false });
      }
    } catch (error) { log(`ADB enumeration unavailable: ${error.message.split('\n')[0]}`); }
  }
  return targets;
}
