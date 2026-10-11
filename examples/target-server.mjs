import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Smart test acceptance target</title><style>body{font-family:system-ui;max-width:40rem;margin:4rem auto;padding:1rem;background:#f5f7fb}form{display:grid;gap:1rem;padding:2rem;background:white;border-radius:1rem}input,button{font:inherit;padding:.75rem}button{background:#2463eb;color:white;border:0;border-radius:.5rem}</style><h1>Browser acceptance target</h1><p id="welcome">Guest session</p><form id="login-form"><label for="username">Display name</label><input id="username" name="username" required><button id="login" type="submit">Sign in</button></form><script>const welcome=document.querySelector('#welcome');const previous=localStorage.getItem('display-name');if(previous)welcome.textContent='Welcome '+previous;document.querySelector('#login-form').addEventListener('submit',event=>{event.preventDefault();const name=document.querySelector('#username').value;localStorage.setItem('display-name',name);welcome.textContent='Welcome '+name;console.log('Demo sign-in completed');});</script></html>`;

export function createTargetServer() {
  return http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"UP"}'); }
    else if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); }
    else { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.TARGET_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('TARGET_PORT must be a TCP port');
  const server = createTargetServer();
  server.listen(port, process.env.TARGET_HOST || '127.0.0.1', () => console.log(`Acceptance target: http://${process.env.TARGET_HOST || '127.0.0.1'}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
