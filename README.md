# Tessera

A local web app to view, edit, and reorganize design-token JSON
([DTCG / W3C format](https://tr.designtokens.org/format/)) and round-trip them with
Figma Variables. Each token is a tile; your design system is the mosaic.

> **Goal:** a repo-agnostic *interface* for editing an app's tokens — not a dependency
> of that app. You point Tessera at a token folder; the app builds its own CSS/JS from
> the JSON independently (e.g. via Style Dictionary). Config-driven multi-repo support
> is in progress.

## Run

```bash
npm install
npm run dev        # http://localhost:5180
```

The dev server doubles as the file API: it reads and writes token JSON directly on disk
(no separate backend). By default it uses `tokens/` if present, otherwise the bundled
`examples/tokens/` fixture — so a fresh clone runs out of the box.

## Token files

DTCG, one file per Figma **mode** (the file-per-mode convention):

| File | Maps to |
|------|---------|
| `tokens/primitives.tokens.json` | raw hex palette (single-mode collection `primitives`) |
| `tokens/core.tokens.json` | shared non-color tokens + a few shared aliases (collection `core`) |
| `tokens/theme.dark.tokens.json` | collection `theme`, mode `dark` |
| `tokens/theme.light.tokens.json` | collection `theme`, mode `light` |

Filenames drive the Figma mapping: `<collection>.tokens.json` (single mode) or
`<collection>.<mode>.tokens.json` (multi-mode).

### Token architecture (two layers)

- **Primitives** (`primitives.tokens.json`) hold the raw hex palette — `palette/blue/600`,
  `palette/red/700`, etc. **Hard hex values live only here.**
- **Semantic** tokens (`theme.dark` / `theme.light`, plus a couple in `core`) carry no hex;
  each is a DTCG **alias** into a primitive (`{palette.blue.950}`). The two themes "branch"
  off the shared primitive palette — dark and light just point different semantic tokens at
  different primitives.

In Figma this maps exactly: a single-mode `primitives` collection, and a `theme` collection
whose `dark`/`light` modes use VARIABLE_ALIAS references to the primitive variables.

## Editor

- Sidebar lists token files; the table edits `$value` per token (color picker for colors).
- **⇄ Dark vs Light** (top of the sidebar) opens a comparison view: every semantic token
  in one table with its **dark and light values side by side** (alias + resolved swatch),
  both editable. Save writes both theme files in one diff.
- **Filter** box narrows the table by token name (works in the comparison view too).
- **Validation** flags broken aliases, invalid hex colors, and non-numeric numbers
  (per-row ⚠ + an issue count in the header).
- **Save** opens a diff (old → new per token) to review before writing to disk.
- **Token CRUD** — **+ Token** adds a token (name/type/value); hover a row for **✎ rename**
  and **🗑 delete**. Changes go through the same Save-with-diff flow to disk.
- **File CRUD** — **＋** (sidebar) creates a token file; hover a file for rename/delete.
  These persist immediately.
- **Drag to reorder** the file list (grab the ⠿ handle). The order is saved to
  `tokens/.order.json` and restored on reload.
- **Structure rail** (second rail, toggle with **Tree**) shows the active file's
  group/token hierarchy. Drag a token or whole group onto another group to **move/reparent**
  it (drop on empty space for root); clicking a node filters the table to it. Moves go
  through Save-with-diff. Name collisions are rejected.
- **Live preview** (right panel) renders the dark and light themes **side by side** as a
  sample Mini-Nation UI from the resolved token values, in the real **IBM Plex Mono**
  webfont with token-driven sizes/weights. Editing a primitive or either theme updates both
  previews instantly. Toggle the panel with the **Preview** button.
- **Export CSS** — generate `tokens.css` in Figma slash notation (`--surface\/base`),
  core + dark in `:root`, light in a `prefers-color-scheme` query. Matches the app's
  existing `src/styles/tokens.css`.
- **Export / Import JSON** — download the active file, or paste a DTCG object to load.

## Figma Variables bridge

The plugin in `figma-plugin/` syncs Variables with the local server.

1. Run `npm run dev` (the bridge talks to `http://localhost:5180`).
2. In Figma: **Plugins → Development → Import plugin from manifest…** and pick
   `tessera/figma-plugin/manifest.json`.
3. Run **Tessera Bridge**:
   - **Pull Figma → Tessera** — reads all local Variables, writes DTCG files to `tokens/`.
   - **Push Tessera → Figma** — reads `tokens/`, creates/updates Variables (collections, modes, aliases).

### Type mapping

| DTCG `$type` | Figma type |
|--------------|------------|
| `color` | COLOR |
| `dimension`, `number`, `fontWeight` | FLOAT |
| `string`, `fontFamily`, `text` | STRING |
| `boolean` | BOOLEAN |
| alias `{a.b}` | VARIABLE_ALIAS |

**Colors** round-trip in the modern DTCG object format
(`{ colorSpace, channels: [r,g,b], alpha }`) — Pull writes that shape, Push reads it
(hex strings are still accepted on Push for hand-edited values).

**Note:** Figma Variables are unitless, so `dimension` tokens round-trip through Figma
as plain numbers (`10px` → `10`). The repo DTCG keeps the unit as the source of truth;
re-pulling from Figma yields `number` tokens you may want to re-tag as `dimension`.
