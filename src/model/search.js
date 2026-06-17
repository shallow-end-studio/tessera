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

// Move a token/group from one file to another (optionally at a new path), and
// rewrite every alias referencing it across all files. Returns { file: newTree }
// for changed files, or null on a name collision in the target.
export function applyCrossFileMove(filesMap, fromFile, fromDotted, targetFile, toDotted) {
  const fromSegs = fromDotted.split('.');
  const toSegs = toDotted.split('.');
  const src = filesMap[fromFile] || {};
  const tgt = filesMap[targetFile] || {};
  const node = getAt(src, fromSegs);
  if (node === undefined) return {};
  if (getAt(tgt, toSegs) !== undefined) return null; // collision in target

  // 1. move the definition: remove from source, add to target at toPath
  const map = {
    ...filesMap,
    [fromFile]: deleteAt(src, fromSegs),
    [targetFile]: setTokenAt(tgt, toSegs, structuredClone(node)),
  };
  // 2. if the path changed, rewrite aliases everywhere to match
  const aliasChanged = fromDotted !== toDotted ? applyRename(map, fromDotted, toDotted) : {};
  const merged = { ...map, ...aliasChanged };

  const changed = {};
  for (const f of new Set([...Object.keys(filesMap), fromFile, targetFile])) {
    if (JSON.stringify(merged[f] ?? {}) !== JSON.stringify(filesMap[f] ?? {})) changed[f] = merged[f] ?? {};
  }
  return changed;
}

// Ungroup: dissolve the group at `groupDotted` in `file`, promoting its children
// to the parent level, and rewrite aliases across all files to drop the group
// segment. Returns { file: newTree } for changed files, or null on a collision.
export function applyUngroup(filesMap, file, groupDotted) {
  const groupSegs = groupDotted.split('.');
  const groupKey = groupSegs[groupSegs.length - 1];
  const parentSegs = groupSegs.slice(0, -1);
  const parentDotted = parentSegs.join('.');
  const grp = getAt(filesMap[file], groupSegs);
  if (!grp || typeof grp !== 'object' || '$value' in grp) return {}; // not a group
  const childKeys = Object.keys(grp).filter((k) => !k.startsWith('$'));

  const clone = structuredClone(filesMap[file]);
  let parentNode = clone;
  for (const s of parentSegs) parentNode = parentNode[s];
  for (const c of childKeys) if (parentNode[c] !== undefined) return null; // sibling collision
  for (const c of childKeys) parentNode[c] = parentNode[groupKey][c];
  delete parentNode[groupKey];

  const map = { ...filesMap, [file]: clone };
  const rewriteLeaf = (token) => {
    const v = token.$value;
    if (typeof v === 'string' && isAlias(v)) {
      const inner = v.slice(1, -1);
      if (inner.startsWith(groupDotted + '.')) {
        const rest = inner.slice(groupDotted.length + 1);
        return { ...token, $value: `{${parentDotted ? `${parentDotted}.${rest}` : rest}}` };
      }
    }
    return token;
  };
  const changed = {};
  for (const f of Object.keys(map)) {
    const next = rebuild(map[f], { renameKey: null, leaf: rewriteLeaf });
    if (JSON.stringify(next) !== JSON.stringify(filesMap[f])) changed[f] = next;
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
