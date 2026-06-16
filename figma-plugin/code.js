// Tessera Bridge — main thread.
//
// Two operations, both driven from ui.html:
//   'export'  → read all local Variables, serialize to DTCG, return file map.
//   'import'  → take a DTCG file map, create/update Variables (collections+modes).
//
// Mapping rules
//   Figma collection  ↔ DTCG file. Single-mode → "<collection>.tokens.json".
//                                    Multi-mode  → "<collection>.<mode>.tokens.json".
//   Variable name "a/b/c" ↔ nested DTCG groups a → b → c.
//   COLOR ↔ color(hex)   FLOAT ↔ number/dimension(unit stripped)
//   STRING ↔ string/fontFamily   BOOLEAN ↔ boolean
//   VARIABLE_ALIAS ↔ DTCG alias "{a.b.c}"
//
// Note: Figma variables are unitless, so dimensions round-trip through Figma as
// plain numbers — the repo DTCG keeps the px unit as the source of truth.

// ─── color helpers ─────────────────────────────────────────────────────────
function rgbToHex(c) {
  const h = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  const base = '#' + h(c.r) + h(c.g) + h(c.b);
  return c.a === undefined || c.a >= 1 ? base : base + h(c.a);
}
function hexToRgb(hex) {
  hex = String(hex).replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

// Figma color {r,g,b,a} (0..1) → modern DTCG color object (the format the token
// files use), so a Pull preserves channels/alpha rather than flattening to hex.
function rgbaToDtcg(c) {
  return {
    colorSpace: 'srgb',
    channels: [c.r, c.g, c.b],
    alpha: c.a === undefined ? 1 : c.a,
  };
}
// DTCG color value → Figma {r,g,b,a}. Accepts the object format OR a hex string.
function dtcgToRgba(v) {
  if (v && typeof v === 'object' && Array.isArray(v.channels)) {
    const [r, g, b] = v.channels;
    return { r, g, b, a: v.alpha === undefined ? 1 : v.alpha };
  }
  return hexToRgb(v);
}

// ─── tree helpers ──────────────────────────────────────────────────────────
function setNested(tree, path, leaf) {
  let node = tree;
  for (let i = 0; i < path.length - 1; i++) {
    node[path[i]] = node[path[i]] || {};
    node = node[path[i]];
  }
  node[path[path.length - 1]] = leaf;
}
function flattenTree(tree, prefix, out) {
  for (const key of Object.keys(tree || {})) {
    if (key[0] === '$') continue;
    const node = tree[key];
    const path = prefix.concat(key);
    if (node && Object.prototype.hasOwnProperty.call(node, '$value')) out.push({ path, token: node });
    else if (node && typeof node === 'object') flattenTree(node, path, out);
  }
}
const slug = (s) => String(s).trim().replace(/\s+/g, '-').toLowerCase();
const dtcgTypeFor = (resolvedType) =>
  ({ COLOR: 'color', FLOAT: 'number', STRING: 'string', BOOLEAN: 'boolean' }[resolvedType] || 'string');
const figmaTypeFor = (dtcgType) =>
  ({ color: 'COLOR', dimension: 'FLOAT', number: 'FLOAT', fontWeight: 'FLOAT', boolean: 'BOOLEAN', string: 'STRING', fontFamily: 'STRING', text: 'STRING' }[
    dtcgType
  ] || 'STRING');

// ─── EXPORT: Figma Variables → DTCG file map ─────────────────────────────────
async function exportToDtcg() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const allVars = await figma.variables.getLocalVariablesAsync();
  const idToName = {};
  allVars.forEach((v) => (idToName[v.id] = v.name));

  const files = {};
  for (const col of collections) {
    const multi = col.modes.length > 1;
    for (const mode of col.modes) {
      const tree = {};
      for (const vid of col.variableIds) {
        const v = await figma.variables.getVariableByIdAsync(vid);
        if (!v) continue;
        const raw = v.valuesByMode[mode.modeId];
        if (raw === undefined) continue;

        let token;
        if (raw && raw.type === 'VARIABLE_ALIAS') {
          const target = idToName[raw.id];
          token = {
            $type: dtcgTypeFor(v.resolvedType),
            $value: target ? '{' + target.split('/').join('.') + '}' : null,
          };
        } else if (v.resolvedType === 'COLOR') {
          token = { $type: 'color', $value: rgbaToDtcg(raw) };
        } else if (v.resolvedType === 'FLOAT') {
          token = { $type: 'number', $value: raw };
        } else if (v.resolvedType === 'BOOLEAN') {
          token = { $type: 'boolean', $value: raw };
        } else {
          token = { $type: 'string', $value: raw };
        }
        setNested(tree, v.name.split('/'), token);
      }
      const name = multi ? slug(col.name) + '.' + slug(mode.name) + '.tokens.json' : slug(col.name) + '.tokens.json';
      files[name] = tree;
    }
  }
  return files;
}

// ─── IMPORT: DTCG file map → Figma Variables ────────────────────────────────
function parseFileName(name) {
  const base = name.replace(/\.tokens\.json$/, '').replace(/\.json$/, '');
  const parts = base.split('.');
  return { collection: parts[0], mode: parts[1] || null };
}

function coerceValue(token) {
  const v = token.$value;
  switch (figmaTypeFor(token.$type)) {
    case 'COLOR':
      return dtcgToRgba(v);
    case 'FLOAT':
      return typeof v === 'number' ? v : parseFloat(String(v));
    case 'BOOLEAN':
      return Boolean(v);
    default:
      return Array.isArray(v) ? v.join(', ') : String(v);
  }
}

async function importFromDtcg(files) {
  // Group files by target collection.
  const byCollection = {};
  for (const name of Object.keys(files)) {
    const { collection, mode } = parseFileName(name);
    (byCollection[collection] = byCollection[collection] || []).push({ mode, tree: files[name] });
  }

  const existingCols = await figma.variables.getLocalVariableCollectionsAsync();
  const colByName = {};
  existingCols.forEach((c) => (colByName[c.name] = c));

  const varByName = {}; // "a/b" → Variable (for alias resolution, second pass)
  const pendingAliases = []; // { name, modeId, targetName }
  let created = 0;
  let updated = 0;

  for (const colName of Object.keys(byCollection)) {
    const entries = byCollection[colName];
    let col = colByName[colName];
    if (!col) {
      col = figma.variables.createVariableCollection(colName);
      colByName[colName] = col;
    }

    // Resolve/derive a modeId for every entry.
    const modeByName = {};
    col.modes.forEach((m) => (modeByName[m.name] = m.modeId));
    let renamedDefault = false;
    for (const entry of entries) {
      const wantName = entry.mode || col.modes[0].name;
      if (!modeByName[wantName]) {
        if (!renamedDefault && col.modes.length === 1) {
          col.renameMode(col.modes[0].modeId, wantName);
          modeByName[wantName] = col.modes[0].modeId;
          renamedDefault = true;
        } else {
          modeByName[wantName] = col.addMode(wantName);
        }
      }
      entry.modeId = modeByName[wantName];
    }

    // Preload existing variables in this collection by name.
    const localByName = {};
    for (const vid of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(vid);
      if (v) localByName[v.name] = v;
    }

    for (const entry of entries) {
      const leaves = [];
      flattenTree(entry.tree, [], leaves);
      for (const { path, token } of leaves) {
        const figName = path.join('/');
        const figType = figmaTypeFor(token.$type);
        let variable = localByName[figName];
        if (!variable) {
          variable = figma.variables.createVariable(figName, col, figType);
          localByName[figName] = variable;
          created++;
        } else {
          updated++;
        }
        varByName[figName] = variable;

        const isAlias = typeof token.$value === 'string' && /^\{[^}]+\}$/.test(token.$value);
        if (isAlias) {
          pendingAliases.push({
            name: figName,
            modeId: entry.modeId,
            targetName: token.$value.slice(1, -1).split('.').join('/'),
          });
        } else {
          variable.setValueForMode(entry.modeId, coerceValue(token));
        }
      }
    }
  }

  // Second pass: wire up aliases now that every variable exists.
  let aliasCount = 0;
  for (const a of pendingAliases) {
    const src = varByName[a.name];
    const target = varByName[a.targetName];
    if (src && target) {
      src.setValueForMode(a.modeId, figma.variables.createVariableAlias(target));
      aliasCount++;
    }
  }

  return { created, updated, aliases: aliasCount };
}

// ─── message plumbing ────────────────────────────────────────────────────────
figma.showUI(__html__, { width: 320, height: 420 });

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'export') {
      const files = await exportToDtcg();
      figma.ui.postMessage({ type: 'exported', files });
    } else if (msg.type === 'import') {
      const summary = await importFromDtcg(msg.files || {});
      figma.ui.postMessage({ type: 'imported', summary });
      figma.notify(`Variables: ${summary.created} created, ${summary.updated} updated, ${summary.aliases} aliased.`);
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
    figma.notify('Tessera Bridge error: ' + (err && err.message ? err.message : err), { error: true });
  }
};
