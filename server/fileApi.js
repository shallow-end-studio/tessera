// Vite plugin: a tiny file API for reading/writing DTCG token JSON on disk.
//
// Routes (all under /api):
//   GET    /api/tokens               → list token files in TOKENS_DIR (in saved order)
//   GET    /api/tokens/:name         → read one file's parsed JSON
//   PUT    /api/tokens/:name         → write JSON back to disk (body: the token object)
//   DELETE /api/tokens/:name         → delete a token file
//   GET    /api/order                → saved sidebar order
//   PUT    /api/order                → persist sidebar order (body: { order: [...] })
//   POST   /api/import               → receive DTCG from the Figma plugin, write to disk
//
// The Figma plugin posts to /api/import from a sandboxed iframe, so CORS is opened.

import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const TOKENS_DIRNAME = 'tokens';
const ORDER_FILE = '.order.json'; // hidden; not a token file

// A token file is any non-dot *.json (we treat *.tokens.json and *.json alike).
const isTokenFile = (f) => f.endsWith('.json') && !f.startsWith('.');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Guard against path traversal — only a bare filename, must end in .json.
function safeName(name) {
  const base = path.basename(name || '');
  if (!base || base !== name || !base.endsWith('.json')) return null;
  return base;
}

export function fileApi(options = {}) {
  // Where token files live. Defaults to <project>/tokens.
  const tokensDir = options.tokensDir || path.resolve(process.cwd(), TOKENS_DIRNAME);

  async function ensureDir() {
    if (!existsSync(tokensDir)) await mkdir(tokensDir, { recursive: true });
  }

  async function readOrder() {
    const full = path.join(tokensDir, ORDER_FILE);
    if (!existsSync(full)) return [];
    try {
      return JSON.parse(await readFile(full, 'utf8')).order || [];
    } catch {
      return [];
    }
  }

  // Files in saved order first, then any new/unknown files alphabetically.
  function applyOrder(files, order) {
    const present = new Set(files);
    const ordered = order.filter((f) => present.has(f));
    const rest = files.filter((f) => !order.includes(f)).sort();
    return [...ordered, ...rest];
  }

  return {
    name: 'token-file-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();

        try {
          if (req.method === 'OPTIONS') return json(res, 204, {});

          // GET /api/tokens — list (in saved order)
          if (req.method === 'GET' && url.pathname === '/api/tokens') {
            await ensureDir();
            const all = (await readdir(tokensDir)).filter(isTokenFile);
            const files = applyOrder(all, await readOrder());
            return json(res, 200, { dir: tokensDir, files });
          }

          // GET /api/order — saved sidebar order
          if (req.method === 'GET' && url.pathname === '/api/order') {
            return json(res, 200, { order: await readOrder() });
          }

          // PUT /api/order — persist sidebar order. Body: { order: [...] }
          if (req.method === 'PUT' && url.pathname === '/api/order') {
            await ensureDir();
            const body = await readBody(req);
            const order = Array.isArray(body.order) ? body.order.filter((n) => safeName(n)) : [];
            await writeFile(path.join(tokensDir, ORDER_FILE), JSON.stringify({ order }, null, 2) + '\n', 'utf8');
            return json(res, 200, { ok: true, order });
          }

          // GET /api/tokens/:name — read
          const readMatch = url.pathname.match(/^\/api\/tokens\/(.+)$/);
          if (req.method === 'GET' && readMatch) {
            const name = safeName(decodeURIComponent(readMatch[1]));
            if (!name) return json(res, 400, { error: 'bad filename' });
            const full = path.join(tokensDir, name);
            if (!existsSync(full)) return json(res, 404, { error: 'not found' });
            const content = JSON.parse(await readFile(full, 'utf8'));
            return json(res, 200, { name, content });
          }

          // PUT /api/tokens/:name — write
          if (req.method === 'PUT' && readMatch) {
            const name = safeName(decodeURIComponent(readMatch[1]));
            if (!name) return json(res, 400, { error: 'bad filename' });
            await ensureDir();
            const body = await readBody(req);
            const full = path.join(tokensDir, name);
            await writeFile(full, JSON.stringify(body, null, 2) + '\n', 'utf8');
            return json(res, 200, { name, ok: true });
          }

          // DELETE /api/tokens/:name — delete a file
          if (req.method === 'DELETE' && readMatch) {
            const name = safeName(decodeURIComponent(readMatch[1]));
            if (!name) return json(res, 400, { error: 'bad filename' });
            const full = path.join(tokensDir, name);
            if (existsSync(full)) await unlink(full);
            return json(res, 200, { name, ok: true });
          }

          // POST /api/import — Figma plugin → disk. Body: { files: { name: content } }
          if (req.method === 'POST' && url.pathname === '/api/import') {
            await ensureDir();
            const body = await readBody(req);
            const files = body.files || {};
            const written = [];
            for (const [rawName, content] of Object.entries(files)) {
              const name = safeName(rawName);
              if (!name) continue;
              await writeFile(
                path.join(tokensDir, name),
                JSON.stringify(content, null, 2) + '\n',
                'utf8',
              );
              written.push(name);
            }
            return json(res, 200, { ok: true, written });
          }

          return json(res, 404, { error: 'unknown route' });
        } catch (err) {
          return json(res, 500, { error: String(err && err.message ? err.message : err) });
        }
      });
    },
  };
}
