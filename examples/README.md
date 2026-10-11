# Real browser acceptance fixtures

Start the deterministic local target with `node examples/target-server.mjs` (Node 22+). `TARGET_HOST=0.0.0.0` is necessary when another container connects; use a hostname reachable from the Agent, such as `http://host.docker.internal:4173`, instead of the host's loopback address. The target is a test fixture; its display-name form is not platform authentication.

`smoke-cases.json` contains two meaningful structured cases: submit the form and verify the changed DOM, then prove the next case starts with fresh localStorage. Replace `__TARGET_URL__` and create the cases through the portal or `POST /api/cases`. These fixtures are drafts; review and approve them in the portal before running. No execution results are seeded.

For this trusted local target, set `AGENT_ALLOW_PRIVATE_NETWORK=true` on the Agent. The default denies private network requests. Install its actual browser with `cd agent && npm ci && npm run install:browser`; `npm run test:browser` performs real execution, failure, cancellation, evidence upload and context isolation against these fixtures.

With approved fixtures and a bearer token:

```sh
cd cli
npm ci
PLATFORM_URL=http://localhost:8080 PLATFORM_TOKEN="$TOKEN" node src/index.js run --suite smoke --platform web --junit smoke.xml
```

The CLI prints the portal report URL and returns 0 only when the stored run is PASSED. Android/iOS execution remains unavailable until actual devices and supported executors are connected.
