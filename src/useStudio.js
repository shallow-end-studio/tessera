import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  flatten,
  getAt,
  setValueAt,
  setTokenAt,
  deleteAt,
  hasToken,
  moveNode,
  isAlias,
  resolveAlias,
  validateTree,
  diffTrees,
} from './model/dtcg.js';
import { toCss } from './model/toCss.js';
import { api, PRIMITIVES, semanticFile, componentsFile, coerceNewValue } from './api.js';

// All of Tessera's state, derived data, and actions. The App component is
// purely the composition of UI pieces around what this hook returns.
export function useStudio() {
  const [files, setFiles] = useState([]);
  const [dir, setDir] = useState('');
  const [active, setActive] = useState(null);
  const [tree, setTree] = useState(null);
  const [original, setOriginal] = useState(null); // tree as last loaded/saved (disk state)
  const [primitivesTree, setPrimitivesTree] = useState(null);
  const [semantic, setSemantic] = useState({}); // { dark, light } from disk — preview + resolution base
  const [showPreview, setShowPreview] = useState(true);
  const [showTree, setShowTree] = useState(true);
  const [compare, setCompare] = useState(false);
  const [cmp, setCmp] = useState({ dark: null, light: null, darkOrig: null, lightOrig: null });
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback((name) => {
    api.read(name).then(({ content }) => {
      setCompare(false);
      setActive(name);
      setTree(content);
      setOriginal(content);
      setDirty(false);
      setQuery('');
      setStatus('');
    });
  }, []);

  useEffect(() => {
    api.list().then(({ files, dir }) => {
      setFiles(files || []);
      setDir(dir || '');
      if (files?.length) load(files.includes(PRIMITIVES) ? PRIMITIVES : files[0]);
    });
    api.read(PRIMITIVES).then((r) => r.content && setPrimitivesTree(r.content)).catch(() => {});
    ['dark', 'light'].forEach((mode) =>
      api.read(semanticFile(mode)).then((r) => r.content && setSemantic((s) => ({ ...s, [mode]: r.content }))).catch(() => {}),
    );
  }, [load]);

  // Tier-aware resolution base: components → semantic(same mode) → primitives.
  const baseTreesFor = useCallback(
    (name) => {
      if (!name) return [primitivesTree || {}];
      if (name.startsWith('components.')) {
        const mode = name.includes('.light.') ? 'light' : 'dark';
        return [semantic[mode] || {}, primitivesTree || {}];
      }
      if (name.startsWith('semantic.')) return [primitivesTree || {}];
      return [];
    },
    [primitivesTree, semantic],
  );

  const openCompare = useCallback(async () => {
    const [d, l] = await Promise.all([api.read(semanticFile('dark')), api.read(semanticFile('light'))]);
    setCompare(true);
    setActive(null);
    setQuery('');
    setStatus('');
    setCmp({ dark: d.content, light: l.content, darkOrig: d.content, lightOrig: l.content });
  }, []);

  const refreshFiles = useCallback(
    async (selectName) => {
      const { files } = await api.list();
      setFiles(files || []);
      if (selectName && (files || []).includes(selectName)) load(selectName);
    },
    [load],
  );

  // ─── file CRUD + reorder ────────────────────────────────────────────────────
  const moveFile = (from, to) => {
    setFiles((fs) => {
      if (from === to || from == null) return fs;
      const next = [...fs];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      api.saveOrder(next);
      return next;
    });
  };

  const submitFile = async () => {
    let name = modal.name.trim();
    if (!name) return setStatus('Name is required');
    if (!name.endsWith('.json')) name += '.tokens.json';
    if (modal.mode === 'new') {
      if (files.includes(name)) return setStatus(`"${name}" already exists`);
      await api.write(name, {});
    } else {
      if (name !== modal.orig && files.includes(name)) return setStatus(`"${name}" already exists`);
      const { content } = await api.read(modal.orig);
      await api.write(name, content);
      if (name !== modal.orig) await api.del(modal.orig);
    }
    setModal(null);
    setStatus(modal.mode === 'new' ? `Created ${name}` : `Renamed to ${name}`);
    await refreshFiles(name);
  };

  const deleteFile = async (f) => {
    if (!confirm(`Delete file "${f}"? This removes it from disk.`)) return;
    await api.del(f);
    setStatus(`Deleted ${f}`);
    const remaining = files.filter((x) => x !== f);
    setFiles(remaining);
    if (active === f) {
      if (remaining.length) load(remaining[0]);
      else {
        setActive(null);
        setTree(null);
      }
    }
  };

  // ─── derived state ──────────────────────────────────────────────────────────
  const allRows = useMemo(() => (tree ? flatten(tree) : []), [tree]);
  const issues = useMemo(() => (tree ? validateTree(tree, ...baseTreesFor(active)) : {}), [tree, active, baseTreesFor]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allRows.filter(({ path }) => path.join('/').toLowerCase().includes(q)) : allRows;
  }, [allRows, query]);

  const cmpRows = useMemo(() => {
    if (!compare || !cmp.dark) return [];
    const all = flatten(cmp.dark);
    const q = query.trim().toLowerCase();
    return q ? all.filter(({ path }) => path.join('/').toLowerCase().includes(q)) : all;
  }, [compare, cmp.dark, query]);
  const cmpDirty =
    compare && (diffTrees(cmp.darkOrig, cmp.dark).length > 0 || diffTrees(cmp.lightOrig, cmp.light).length > 0);

  const livePrimitives = active === PRIMITIVES ? tree : primitivesTree;
  const darkTheme = compare ? cmp.dark : active === semanticFile('dark') ? tree : semantic.dark;
  const lightTheme = compare ? cmp.light : active === semanticFile('light') ? tree : semantic.light;

  const resolveValue = (token) =>
    isAlias(token.$value) ? resolveAlias(token.$value, tree, ...baseTreesFor(active)) : null;

  // ─── token edits / CRUD / move ──────────────────────────────────────────────
  const onValue = (path, value) => {
    setTree((t) => setValueAt(t, path, value));
    setDirty(true);
  };
  const onCmpValue = (side, path, value) => setCmp((c) => ({ ...c, [side]: setValueAt(c[side], path, value) }));

  const deleteToken = (path) => {
    if (!confirm(`Delete token "${path.join('/')}"?`)) return;
    setTree((t) => deleteAt(t, path));
    setDirty(true);
  };

  const moveTreeNode = (fromPath, toGroupPath) => {
    const next = moveNode(tree, fromPath, toGroupPath);
    if (next === null) return setStatus(`"${fromPath[fromPath.length - 1]}" already exists in that group`);
    if (next !== tree) {
      setTree(next);
      setDirty(true);
      setStatus('Moved — review and Save');
    }
  };

  const submitToken = () => {
    const name = modal.name.trim().replace(/^\/+|\/+$/g, '');
    if (!name) return setStatus('Name is required');
    const segs = name.split('/');
    if (modal.mode === 'rename') {
      if (name !== modal.origPath && hasToken(tree, segs)) return setStatus(`"${name}" already exists`);
      const tok = structuredClone(getAt(tree, modal.origPath.split('/')));
      setTree((t) => setTokenAt(deleteAt(t, modal.origPath.split('/')), segs, tok));
    } else {
      if (hasToken(tree, segs)) return setStatus(`"${name}" already exists`);
      setTree((t) => setTokenAt(t, segs, { $type: modal.type, $value: coerceNewValue(modal.type, modal.value) }));
    }
    setDirty(true);
    setStatus(modal.mode === 'rename' ? 'Renamed — review and Save' : 'Added — review and Save');
    setModal(null);
  };

  // ─── save / export / import ─────────────────────────────────────────────────
  const save = () => {
    if (compare) {
      const changes = [
        ...diffTrees(cmp.darkOrig, cmp.dark).map((c) => ({ ...c, key: `dark · ${c.key}` })),
        ...diffTrees(cmp.lightOrig, cmp.light).map((c) => ({ ...c, key: `light · ${c.key}` })),
      ];
      if (!changes.length) return setStatus('No changes to save');
      return setModal({ kind: 'diff', changes, compare: true });
    }
    const changes = diffTrees(original, tree);
    if (!changes.length) return setStatus('No changes to save');
    setModal({ kind: 'diff', changes });
  };

  const doWrite = async () => {
    const isCompare = modal?.compare;
    setModal(null);
    setStatus('Saving…');
    if (isCompare) {
      const [r1, r2] = await Promise.all([
        api.write(semanticFile('dark'), cmp.dark),
        api.write(semanticFile('light'), cmp.light),
      ]);
      if (r1.ok && r2.ok) {
        setCmp((c) => ({ ...c, darkOrig: c.dark, lightOrig: c.light }));
        setSemantic((s) => ({ ...s, dark: cmp.dark, light: cmp.light }));
        setStatus('Saved both semantic themes');
      } else setStatus(`Error: ${r1.error || r2.error || 'failed'}`);
      return;
    }
    const res = await api.write(active, tree);
    if (res.ok) {
      setOriginal(tree);
      setDirty(false);
      setStatus(`Saved ${active}`);
      if (active === PRIMITIVES) setPrimitivesTree(tree);
      if (active === semanticFile('dark')) setSemantic((s) => ({ ...s, dark: tree }));
      if (active === semanticFile('light')) setSemantic((s) => ({ ...s, light: tree }));
    } else setStatus(`Error: ${res.error || 'failed'}`);
  };

  const openCss = async () => {
    const names = [PRIMITIVES, semanticFile('dark'), componentsFile('dark'), semanticFile('light'), componentsFile('light')];
    const [prim, semD, compD, semL, compL] = await Promise.all(
      names.map((n) => api.read(n).then((r) => r.content || {}).catch(() => ({}))),
    );
    setModal({ kind: 'css', text: toCss({ rootLayers: [prim, semD, compD], lightLayers: [semL, compL] }) });
  };

  const downloadJson = () => {
    if (!tree) return;
    const blob = new Blob([JSON.stringify(tree, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = active;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = () => {
    try {
      setTree(JSON.parse(modal.text));
      setDirty(true);
      setStatus('Imported into editor — review and Save');
      setModal(null);
    } catch (err) {
      setStatus(`Invalid JSON: ${err.message}`);
    }
  };

  const copyText = (t) => navigator.clipboard?.writeText(t).then(() => setStatus('Copied to clipboard'));

  return {
    // state
    files, dir, active, tree, primitivesTree, compare, cmp, dirty, query, status, modal,
    showTree, showPreview,
    // derived
    rows, allRows, cmpRows, issues, cmpDirty, resolveValue, darkTheme, lightTheme, livePrimitives,
    // setters
    setQuery, setModal, setShowTree, setShowPreview,
    // actions
    load, openCompare, moveFile, deleteFile, submitFile,
    onValue, onCmpValue, deleteToken, moveTreeNode, submitToken,
    save, doWrite, openCss, downloadJson, applyImport, copyText,
  };
}
