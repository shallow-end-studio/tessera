// Editor header: title/count/issues, the filter box, and all the action buttons.
export default function Toolbar({
  compare,
  active,
  status,
  query,
  onQuery,
  counts, // { rows, all, cmp }
  issueCount,
  saveEnabled,
  showTree,
  showPreview,
  onAddToken,
  onToggleTree,
  onTogglePreview,
  onExportCss,
  onExportJson,
  onImport,
  onSave,
}) {
  const subtitle = compare
    ? `${counts.cmp} token${counts.cmp === 1 ? '' : 's'}`
    : `${query ? `${counts.rows} of ${counts.all}` : counts.all} tokens`;

  const ghost = 'rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20';
  const toggle = (on) =>
    `rounded px-3 py-1.5 text-xs ${on ? 'bg-indigo-500/30 text-white' : 'bg-white/10 hover:bg-white/20'}`;

  return (
    <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
      <div className="flex items-center gap-4">
        <div>
          <div className="font-medium">{compare ? 'Dark vs Light' : active || '—'}</div>
          <div className="text-[11px] text-white/40">
            {subtitle}
            {!compare && issueCount > 0 && (
              <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                {issueCount} issue{issueCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Filter tokens…"
          className="w-48 rounded border border-white/15 bg-black/30 px-2 py-1 text-xs outline-none focus:border-white/30"
        />
      </div>
      <div className="flex items-center gap-2">
        {status && <span className="mr-1 text-xs text-white/50">{status}</span>}
        {!compare && active && (
          <button onClick={onAddToken} className={ghost}>
            + Token
          </button>
        )}
        {!compare && (
          <button onClick={onToggleTree} className={toggle(showTree)}>
            Tree
          </button>
        )}
        <button onClick={onTogglePreview} className={toggle(showPreview)}>
          Preview
        </button>
        <button onClick={onExportCss} className={ghost}>
          Export CSS
        </button>
        <button onClick={onExportJson} className={ghost}>
          Export JSON
        </button>
        <button onClick={onImport} className={ghost}>
          Import JSON
        </button>
        <button
          onClick={onSave}
          disabled={!saveEnabled}
          className={`rounded px-3 py-1.5 text-xs font-medium ${
            saveEnabled ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-white/10 text-white/40'
          }`}
        >
          Save
        </button>
      </div>
    </header>
  );
}
