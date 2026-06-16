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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ORDER_FILE = '.order.json'; // hidden; not a token file
const CONFIG_FILE = 'tessera.config.json';

// Used when a repo has no tessera.config.json — the primitives→semantic→components
// layout Tessera was first built around. Apps override this with their own config.
const DEFAULT_CONFIG = {
  tokensDir: 'tokens',
  modes: ['dark', 'light'],
  collections: [
    { name: 'primitives', files: { default: 'primitives.tokens.json' } },
    { name: 'semantic', modes: ['dark', 'light'], files: { dark: 'semantic.dark.tokens.json', light: 'semantic.light.tokens.json' } },
    { name: 'components', modes: ['dark', 'light'], files: { dark: 'components.dark.tokens.json', light: 'components.light.tokens.json' } },
  ],
  preview: { collection: 'semantic' },
};

function loadConfig(rootDir) {
  const p = path.join(rootDir, CONFIG_FILE);
  if (existsSync(p)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, 'utf8')) };
    } catch (err) {
      console.warn(`[tessera] could not parse ${CONFIG_FILE}: ${err.message}`);
    }
  }
  return DEFAULT_CONFIG;
}

// A relative *.json path inside tokensDir (subfolders allowed), with no traversal.
function safeRel(name) {
  if (typeof name !== 'string' || !name) return null;
  const norm = path.posix.normalize(name.replace(/\\/g, '/'));
  if (norm.startsWith('/') || norm.split('/').some((s) => s === '..' || s === '')) return null;
  return norm.endsWith('.json') ? norm : null;
}

// Recursively list token files (relative posix paths), skipping dot/$ files
// (.order.json, $metadata.json, $themes.json) — those are config, not tokens.
async function walkTokenFiles(dir, base = '') {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkTokenFiles(path.join(dir, e.name), rel)));
    else if (e.name.endsWith('.json')) out.push(rel);
  }
  return out;
}

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

export function fileApi(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const config = loadConfig(rootDir);
  // tokensDir from config (relative to the repo root), with an examples/ fallback
  // so a fresh clone of Tessera itself still runs.
  let tokensDir = options.tokensDir;
  if (!tokensDir) {
    const declared = path.resolve(rootDir, config.tokensDir || 'tokens');
    tokensDir = existsSync(declared) ? declared : path.resolve(rootDir, 'examples/tokens');
  }

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

  // Resolve a safe relative name to an absolute path confined to tokensDir.
  function bounded(name) {
    const rel = safeRel(name);
    if (!rel) return null;
    const base = path.resolve(tokensDir);
    const full = path.resolve(base, rel);
    return full === base || full.startsWith(base + path.sep) ? full : null;
  }

  return {
    name: 'token-file-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();

        try {
          if (req.method === 'OPTIONS') return json(res, 204, {});

          // GET /api/tokens — list (in saved order; recurses subfolders)
          if (req.method === 'GET' && url.pathname === '/api/tokens') {
            await ensureDir();
            const all = await walkTokenFiles(tokensDir);
            const files = applyOrder(all, await readOrder());
            return json(res, 200, { dir: tokensDir, files });
          }

          // GET /api/config — the resolved token structure (collections/modes/preview).
          // Re-read fresh so edits to tessera.config.json apply on a browser reload
          // (no process restart needed).
          if (req.method === 'GET' && url.pathname === '/api/config') {
            return json(res, 200, loadConfig(rootDir));
          }

          // GET /api/order — saved sidebar order
          if (req.method === 'GET' && url.pathname === '/api/order') {
            return json(res, 200, { order: await readOrder() });
          }

          // PUT /api/order — persist sidebar order. Body: { order: [...] }
          if (req.method === 'PUT' && url.pathname === '/api/order') {
            await ensureDir();
            const body = await readBody(req);
            const order = Array.isArray(body.order) ? body.order.filter((n) => safeRel(n)) : [];
            await writeFile(path.join(tokensDir, ORDER_FILE), JSON.stringify({ order }, null, 2) + '\n', 'utf8');
            return json(res, 200, { ok: true, order });
          }

          const readMatch = url.pathname.match(/^\/api\/tokens\/(.+)$/);
          const reqName = readMatch ? safeRel(decodeURIComponent(readMatch[1])) : null;
          const reqFull = readMatch ? bounded(decodeURIComponent(readMatch[1])) : null;

          // GET /api/tokens/:name — read
          if (req.method === 'GET' && readMatch) {
            if (!reqFull) return json(res, 400, { error: 'bad filename' });
            if (!existsSync(reqFull)) return json(res, 404, { error: 'not found' });
            const content = JSON.parse(await readFile(reqFull, 'utf8'));
            return json(res, 200, { name: reqName, content });
          }

          // PUT /api/tokens/:name — write (creates subfolders as needed)
          if (req.method === 'PUT' && readMatch) {
            if (!reqFull) return json(res, 400, { error: 'bad filename' });
            const body = await readBody(req);
            await mkdir(path.dirname(reqFull), { recursive: true });
            await writeFile(reqFull, JSON.stringify(body, null, 2) + '\n', 'utf8');
            return json(res, 200, { name: reqName, ok: true });
          }

          // DELETE /api/tokens/:name — delete a file
          if (req.method === 'DELETE' && readMatch) {
            if (!reqFull) return json(res, 400, { error: 'bad filename' });
            if (existsSync(reqFull)) await unlink(reqFull);
            return json(res, 200, { name: reqName, ok: true });
          }

          // POST /api/import — Figma plugin → disk. Body: { files: { name: content } }
          if (req.method === 'POST' && url.pathname === '/api/import') {
            await ensureDir();
            const body = await readBody(req);
            const files = body.files || {};
            const written = [];
            for (const [rawName, content] of Object.entries(files)) {
              const full = bounded(rawName);
              if (!full) continue;
              await mkdir(path.dirname(full), { recursive: true });
              await writeFile(full, JSON.stringify(content, null, 2) + '\n', 'utf8');
              written.push(safeRel(rawName));
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
