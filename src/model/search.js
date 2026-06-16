// Global search + replace across token files (pure; operates on { file: tree } maps).
import { flatten, getAt, setTokenAt, deleteAt, isToken, isAlias } from './dtcg.js';
import { toCssColor } from './color.js';

// Case-insensitive substring replace.
function replaceCI(str, find, repl) {
  if (!find) return str;
  const lo = String(str).toLowerCase();
  const f = find.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const idx = lo.indexOf(f, i);
    if (idx === -1) return out + str.slice(i);
    out += str.slice(i, idx) + repl;
    i = idx + f.length;
  }
}
const hasCI = (str, q) => typeof str === 'string' && str.toLowerCase().includes(q);

// The searchable text forms of a token's value.
function valueText(token) {
  const v = token.$value;
  if (isAlias(v)) return { alias: v };
  if (Array.isArray(v)) return { value: v.join(', ') };
  if (v && typeof v === 'object') return { value: toCssColor(v) || '' }; // object color → hex/rgb
  return { value: String(v) };
}

// scopes: { names, values, aliases, descriptions }
export function searchAll(filesMap, query, scopes) {
  const q = query.trim().toLowerCase();
  const results = [];
  if (!q) return results;
  for (const [file, tree] of Object.entries(filesMap)) {
    for (const { path, token } of flatten(tree)) {
      const name = path.join('/');
      const vt = valueText(token);
      const matches = {};
      if (scopes.names && hasCI(name, q)) matches.name = name;
      if (scopes.values && hasCI(vt.value, q)) matches.value = vt.value;
      if (scopes.aliases && hasCI(vt.alias, q)) matches.alias = vt.alias;
      if (scopes.descriptions && hasCI(token.$description, q)) matches.description = token.$description;
      if (Object.keys(matches).length) results.push({ file, path, name, type: token.$type, matches });
    }
  }
  return results;
}

// Rebuild a tree, optionally renaming keys and transforming leaf tokens.
function rebuild(node, { renameKey, leaf }) {
  if (isToken(node)) return leaf(node);
  const out = {};
  for (const k of Object.keys(node)) {
    if (k.startsWith('$')) {
      out[k] = node[k];
      continue;
    }
    out[renameKey ? renameKey(k) : k] = rebuild(node[k], { renameKey, leaf });
  }
  return out;
}

// Text find & replace across files. Returns { file: newTree } for changed files only.
export function applyTextReplace(filesMap, find, repl, scopes) {
  const changed = {};
  for (const [file, tree] of Object.entries(filesMap)) {
    const next = rebuild(tree, {
      renameKey: scopes.names ? (k) => replaceCI(k, find, repl) : null,
      leaf: (token) => {
        const t = { ...token };
        const v = token.$value;
        if (typeof v === 'string') {
          const al = isAlias(v);
          if ((al && scopes.aliases) || (!al && scopes.values)) t.$value = replaceCI(v, find, repl);
        }
        if (scopes.descriptions && typeof token.$description === 'string') {
          t.$description = replaceCI(token.$description, find, repl);
        }
        return t;
      },
    });
    if (JSON.stringify(next) !== JSON.stringify(tree)) changed[file] = next;
  }
  return changed;
}

// Token-aware rename: move the token/group at `fromDotted` to `toDotted` AND
// rewrite every alias that references it (or a descendant) across all files.
export function applyRename(filesMap, fromDotted, toDotted) {
  const fromSegs = fromDotted.split('.');
  const toSegs = toDotted.split('.');
  const changed = {};

  for (const [file, tree] of Object.entries(filesMap)) {
    let next = tree;
    let dirty = false;

    // 1. move the definition if it lives in this file
    const node = getAt(tree, fromSegs);
    if (node !== undefined) {
      next = setTokenAt(deleteAt(next, fromSegs), toSegs, structuredClone(node));
      dirty = true;
    }

    // 2. rewrite aliases pointing at fromDotted (or fromDotted.*)
    const rewritten = rebuild(next, {
      renameKey: null,
      leaf: (token) => {
        const v = token.$value;
        if (typeof v === 'string' && isAlias(v)) {
          const inner = v.slice(1, -1);
          if (inner === fromDotted || inner.startsWith(fromDotted + '.')) {
            return { ...token, $value: `{${toDotted}${inner.slice(fromDotted.length)}}` };
          }
        }
        return token;
      },
    });
    if (JSON.stringify(rewritten) !== JSON.stringify(next)) {
      next = rewritten;
      dirty = true;
    }

    if (dirty) changed[file] = next;
  }
  return changed;
}
