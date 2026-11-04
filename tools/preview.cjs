const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const prefix = '/__preview/firebase';
const clients = new Set();
let database = { assemblea: { stato: { attiva: false } }, live: { stato: { pos: 0, max: 0 } } };

function read(keys) {
  return keys.reduce((value, key) => value?.[key], database) ?? null;
}

function timestamps(value) {
  if (value && typeof value === 'object') {
    if (value['.sv'] === 'timestamp') return Date.now();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, timestamps(item)]));
  }
  return value;
}

function write(keys, value) {
  if (!keys.length) { database = value || {}; return }
  let node = database;
  for (const key of keys.slice(0, -1)) node = node[key] ||= {};
  if (value === null) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
}

function sendEvent(client) {
  client.response.write('event: put\ndata: ' + JSON.stringify({ path: '/', data: read(client.keys) }) + '\n\n');
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  // Preview pages may load fonts, but cannot connect to Firebase or GitHub.
  response.setHeader('Content-Security-Policy', "connect-src 'self'; form-action 'self'; object-src 'none'");
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith(prefix + '/')) {
      if (!pathname.endsWith('.json')) {
        response.writeHead(404).end('Endpoint demo non trovato');
        return;
      }
      const keys = pathname.slice(prefix.length + 1, -5).split('/').filter(Boolean);
      if (request.method === 'GET' && request.headers.accept?.includes('text/event-stream')) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        const client = { response, keys };
        clients.add(client);
        sendEvent(client);
        response.on('close', () => clients.delete(client));
        return;
      }
      if (request.method !== 'GET') {
        if (!['PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          response.writeHead(405).end('Metodo non consentito');
          return;
        }
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024 * 1024) {
            response.writeHead(413).end('Dati demo troppo grandi');
            return;
          }
        }
        let value;
        try { value = request.method === 'DELETE' ? null : timestamps(JSON.parse(body)) }
        catch { response.writeHead(400).end('JSON demo non valido'); return }
        if (request.method === 'PATCH') {
          for (const [key, item] of Object.entries(value)) write([...keys, ...key.split('/')], item);
        } else write(keys, value);
        for (const client of clients) sendEvent(client);
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(read(keys)));
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end('Anteprima di sola lettura');
      return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      response.writeHead(403).end('Percorso non consentito');
      return;
    }
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    let content = await fs.readFile(file);
    if (file === path.join(root, 'Assemblea-di-Gruppo/config.js')) {
      content = content.toString().replace(/url:\s*'[^']*'/, "url: location.origin + '" + prefix + "'");
    }
    if (path.extname(file) === '.js') {
      content = content.toString()
        .replaceAll('canicattini-area-', 'canicattini-preview-area-')
        .replaceAll('assemblea-gh-token', 'assemblea-preview-gh-token');
    }
    if (path.extname(file) === '.html') {
      content = content.toString().replace('<head>', '<head><script src="/tools/preview-ui.js"></script>');
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') response.writeHead(404).end('File non trovato');
    else {
      console.error('Errore anteprima:', error);
      response.writeHead(500).end('Errore del server di anteprima');
    }
  }
});

server.on('error', error => { console.error('Impossibile avviare l’anteprima:', error.message); process.exitCode = 1 });
server.listen(Number(process.env.PORT || 8000), '127.0.0.1', () => {
  console.log('Anteprima grafica: http://localhost:' + server.address().port);
  console.log('Accedi con una chiave qualsiasi. Firebase simulato in memoria; salvataggio GitHub bloccato.');
});
