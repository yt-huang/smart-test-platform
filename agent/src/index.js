import { readConfig } from './config.js';
import { resolveAgentKey } from './platform.js';
import { AgentClient } from './client.js';

let client;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  stopping = true;
  await client?.stop(`Received ${signal}`);
});

try {
  const config = readConfig();
  // Compose may start the Agent while the backend is becoming ready. Resolve once and persist;
  // retries and WS reconnects reuse this key rather than creating a key per connection.
  let key;
  for (let attempt = 0; !stopping; attempt++) {
    try { key = await resolveAgentKey(config); break; }
    catch (error) {
      if (!config.adminPassword || attempt >= 11 || !/HTTP 5\d\d|fetch failed|ECONNREFUSED|TimeoutError|aborted/i.test(error.message)) throw error;
      console.error(`Platform bootstrap not ready: ${error.message}; retrying`);
      await new Promise(resolve => setTimeout(resolve, Math.min(10000, 1000 * (attempt + 1))));
    }
  }
  if (!stopping) { client = new AgentClient(config, key); await client.start(); }
} catch (error) {
  console.error(`Agent startup failed: ${error.message}`);
  process.exitCode = 2;
}
