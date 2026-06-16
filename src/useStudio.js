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
import { api, coerceNewValue } from './api.js';

// All of Tessera's state, derived data, and actions. The structure (collections,
// modes, preview) comes from the repo's tessera.config.json via /api/config, so
// nothing here is tied to a specific design system's filenames.
export function useStudio() {
  const [config, setConfig] = useState(null);
  const [files, setFiles] = useState([]);
  const [dir, setDir] = useState('');
  const [active, setActive] = useState(null);
  const [tree, setTree] = useState(null);
  const [original, setOriginal] = useState(null);
  const [cache, setCache] = useState({}); // { filename: tree } — base layers for resolution/preview
  const [showPreview, setShowPreview] = useState(true);
  const [showTree, setShowTree] = useState(true);
  const [compare, setCompare] = useState(false);
  const [cmp, setCmp] = useState({ dark: null, light: null, darkOrig: null, lightOrig: null });
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);

  // Static structure derived from the config (the tier model).
  const model = useMemo(() => {
    const collections = config?.collections || [];
    const fileFor = (col, mode) =>
      col?.files?.[mode] || col?.files?.default || (col?.files ? Object.values(col.files)[0] : undefined);
    const primaryFile = collections[0] ? fileFor(collections[0]) : null; // most-primitive layer
    const previewCol =
      collections.find((c) => c.name === config?.preview?.collection) ||
      collections.find((c) => (c.modes || []).length > 1) ||
      null;
    const tierOf = (name) => {
      for (let ci = 0; ci < collections.length; ci++) {
        for (const [mode, fn] of Object.entries(collections[ci].files || {})) {
          if (fn === name) return { ci, mode: mode === 'default' ? null : mode };
        }
      }
      return null;
    };
    // Earlier collections (nearest-first), mode-matched — the alias resolution base.
    const baseFilesFor = (name) => {
      const t = tierOf(name);
      if (!t) return [];
      const out = [];
      for (let j = t.ci - 1; j >= 0; j--) {
        const fn = (t.mode && collections[j].files?.[t.mode]) || fileFor(collections[j]);
        if (fn) out.push(fn);
      }
      return out;
    };
    return {
      collections,
      fileFor,
      primaryFile,
      themedDark: previewCol ? fileFor(previewCol, 'dark') : null,
      themedLight: previewCol ? fileFor(previewCol, 'light') : null,
      baseFilesFor,
      allFiles: collections.flatMap((c) => Object.values(c.files || {})),
    };
  }, [config]);

  const liveOrCache = useCallback((fn) => (fn && active === fn ? tree : cache[fn] || {}), [active, tree, cache]);
  const baseTreesFor = useCallback((name) => model.baseFilesFor(name).map(liveOrCache), [model, liveOrCache]);

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
    api.config().then(setConfig);
  }, []);

  useEffect(() => {
    if (!config) return;
    api.list().then(({ files, dir }) => {
      setFiles(files || []);
      setDir(dir || '');
      if (files?.length) load(files.includes(model.primaryFile) ? model.primaryFile : files[0]);
    });
    // cache every collection file so aliases/preview can resolve across tiers
    model.allFiles.forEach((fn) =>
      api.read(fn).then((r) => r.content && setCache((c) => ({ ...c, [fn]: r.content }))).catch(() => {}),
    );
  }, [config, model, load]);

  const openCompare = useCallback(async () => {
    const [d, l] = await Promise.all([api.read(model.themedDark), api.read(model.themedLight)]);
    setCompare(true);
    setActive(null);
    setQuery('');
    setStatus('');
    setCmp({ dark: d.content, light: l.content, darkOrig: d.content, lightOrig: l.content });
  }, [model]);

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

  // Preview: auto-render the file being edited (or the dark themed file in compare),
  // resolving its aliases through the tier base.
  const previewTree = compare ? cmp.dark : tree;
  const previewBases = compare ? baseTreesFor(model.themedDark) : baseTreesFor(active);
  const previewLabel = compare ? model.themedDark : active;

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
      const [r1, r2] = await Promise.all([api.write(model.themedDark, cmp.dark), api.write(model.themedLight, cmp.light)]);
      if (r1.ok && r2.ok) {
        setCmp((c) => ({ ...c, darkOrig: c.dark, lightOrig: c.light }));
        setCache((c) => ({ ...c, [model.themedDark]: cmp.dark, [model.themedLight]: cmp.light }));
        setStatus('Saved both themes');
      } else setStatus(`Error: ${r1.error || r2.error || 'failed'}`);
      return;
    }
    const res = await api.write(active, tree);
    if (res.ok) {
      setOriginal(tree);
      setDirty(false);
      setStatus(`Saved ${active}`);
      setCache((c) => ({ ...c, [active]: tree }));
    } else setStatus(`Error: ${res.error || 'failed'}`);
  };

  const openCss = async () => {
    const read = (fn) => (fn ? api.read(fn).then((r) => r.content || {}).catch(() => ({})) : Promise.resolve({}));
    const rootLayers = await Promise.all(model.collections.map((c) => read(model.fileFor(c, 'dark'))));
    const lightLayers = await Promise.all(
      model.collections.filter((c) => (c.modes || []).includes('light')).map((c) => read(model.fileFor(c, 'light'))),
    );
    setModal({ kind: 'css', text: toCss({ rootLayers, lightLayers }) });
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
    files, dir, active, tree, compare, cmp, dirty, query, status, modal, showTree, showPreview,
    // derived
    rows, allRows, cmpRows, issues, cmpDirty, resolveValue,
    previewTree, previewBases, previewLabel, primitivesTree: liveOrCache(model.primaryFile),
    // setters
    setQuery, setModal, setShowTree, setShowPreview,
    // actions
    load, openCompare, moveFile, deleteFile, submitFile,
    onValue, onCmpValue, deleteToken, moveTreeNode, submitToken,
    save, doWrite, openCss, downloadJson, applyImport, copyText,
  };
}
