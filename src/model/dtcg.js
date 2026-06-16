// Minimal DTCG (W3C Design Tokens) model helpers.
//
// A token is a leaf object carrying `$value` (and usually `$type`).
// Groups are plain nested objects. Keys starting with `$` are metadata,
// never groups. Aliases are strings of the form "{group.sub.token}".

import { isValidColor } from './color.js';

const META_KEYS = new Set(['$value', '$type', '$description', '$extensions', '$deprecated']);

export const isToken = (node) =>
  node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, '$value');

export const isGroup = (node) => node && typeof node === 'object' && !isToken(node);

// Walk the tree, yielding { path: ['a','b'], token } for every leaf.
export function flatten(tree, prefix = []) {
  const out = [];
  for (const [key, node] of Object.entries(tree || {})) {
    if (key.startsWith('$')) continue;
    const path = [...prefix, key];
    if (isToken(node)) {
      out.push({ path, token: node });
    } else if (isGroup(node)) {
      out.push(...flatten(node, path));
    }
  }
  return out;
}

// Read/write a token at a dotted-or-array path. Returns the leaf object.
export function getAt(tree, path) {
  const segs = Array.isArray(path) ? path : path.split('.');
  return segs.reduce((node, seg) => (node ? node[seg] : undefined), tree);
}

// Immutably set `$value` on the token at `path`, returning a new tree.
export function setValueAt(tree, path, value) {
  const segs = Array.isArray(path) ? path : path.split('.');
  const clone = structuredClone(tree);
  let node = clone;
  for (let i = 0; i < segs.length - 1; i++) node = node[segs[i]];
  const leaf = node[segs[segs.length - 1]];
  leaf.$value = value;
  return clone;
}

// Immutably place a whole token object at `path` (creating intermediate groups).
export function setTokenAt(tree, path, token) {
  const segs = Array.isArray(path) ? path : path.split('/');
  const clone = structuredClone(tree || {});
  let node = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!node[segs[i]] || typeof node[segs[i]] !== 'object' || '$value' in node[segs[i]]) node[segs[i]] = {};
    node = node[segs[i]];
  }
  node[segs[segs.length - 1]] = token;
  return clone;
}

// Immutably remove the token at `path`, pruning any groups left empty.
export function deleteAt(tree, path) {
  const segs = Array.isArray(path) ? path : path.split('/');
  const clone = structuredClone(tree);
  const chain = [clone];
  let node = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    node = node[segs[i]];
    if (!node) return clone; // nothing to delete
    chain.push(node);
  }
  delete node[segs[segs.length - 1]];
  // prune empty ancestors (stop before the root)
  for (let i = chain.length - 1; i > 0; i--) {
    const parent = chain[i - 1];
    const key = segs[i - 1];
    if (parent[key] && Object.keys(parent[key]).filter((k) => !k.startsWith('$')).length === 0) {
      delete parent[key];
    } else break;
  }
  return clone;
}

// True if a token already exists at `path`.
export function hasToken(tree, path) {
  return isToken(getAt(tree, path));
}

// Move a node (token OR group subtree) from `fromPath` into the group at
// `toGroupPath` (empty array = root), keeping its key. Returns a new tree, the
// same tree if it's a no-op, or null on a name collision.
export function moveNode(tree, fromPath, toGroupPath) {
  const from = Array.isArray(fromPath) ? fromPath : fromPath.split('/');
  const to = Array.isArray(toGroupPath) ? toGroupPath : toGroupPath ? toGroupPath.split('/') : [];
  const name = from[from.length - 1];

  if (from.slice(0, -1).join('/') === to.join('/')) return tree; // already there
  // refuse to move a group into itself or one of its descendants
  if (to.length >= from.length && from.every((seg, i) => seg === to[i])) return tree;

  const node = getAt(tree, from);
  if (node === undefined) return tree;
  if (getAt(tree, [...to, name]) !== undefined) return null; // collision

  const moved = structuredClone(node);
  return setTokenAt(deleteAt(tree, from), [...to, name], moved);
}

// Resolve "{a.b.c}" aliases against one or more token trees.
// Returns the literal value, or undefined if the alias can't be resolved.
export function resolveAlias(value, ...trees) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return value;
  const refPath = m[1].split('.');
  for (const tree of trees) {
    const leaf = getAt(tree, refPath);
    if (isToken(leaf)) return resolveAlias(leaf.$value, ...trees);
  }
  return undefined;
}

export const isAlias = (value) => typeof value === 'string' && /^\{[^}]+\}$/.test(value);

// Infer a token's effective type, falling back to a parent group's $type.
export function effectiveType(token) {
  return token.$type || 'unknown';
}

// Validate a tree, resolving aliases against the given extra trees (e.g. core).
// Returns { 'a/b/c': 'message' } for every token with a problem.
export function validateTree(tree, ...resolveTrees) {
  const issues = {};
  for (const { path, token } of flatten(tree)) {
    const key = path.join('/');
    const v = token.$value;
    if (isAlias(v)) {
      if (resolveAlias(v, tree, ...resolveTrees) === undefined) issues[key] = `Unresolved alias ${v}`;
    } else if (token.$type === 'color') {
      if (!isValidColor(v)) issues[key] = 'Invalid color value';
    } else if (token.$type === 'number' || token.$type === 'fontWeight') {
      if (typeof v !== 'number' && isNaN(Number(v))) issues[key] = 'Not a number';
    }
  }
  return issues;
}

// Compare two trees by leaf value. Returns changed/added/removed tokens.
export function diffTrees(orig, next) {
  const map = (t) => Object.fromEntries(flatten(t).map(({ path, token }) => [path.join('/'), token.$value]));
  const o = map(orig || {});
  const n = map(next || {});
  const changes = [];
  for (const key of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (JSON.stringify(o[key]) !== JSON.stringify(n[key])) {
      changes.push({ key, from: key in o ? o[key] : undefined, to: key in n ? n[key] : undefined });
    }
  }
  return changes.sort((a, b) => a.key.localeCompare(b.key));
}
