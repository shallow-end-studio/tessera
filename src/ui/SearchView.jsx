import { useMemo, useState } from 'react';
import { searchAll } from '../model/search.js';

const SCOPE_KEYS = [
  ['names', 'Names'],
  ['values', 'Values'],
  ['aliases', 'Aliases'],
  ['descriptions', 'Descriptions'],
];

function Highlight({ text, q }) {
  if (!q || !text) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-amber-400/30 text-amber-200">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// Dedicated global search + replace over every token file.
export default function SearchView({ filesMap, onJump, onReplace, onRename, onClose }) {
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scopes, setScopes] = useState({ names: true, values: true, aliases: true, descriptions: true });

  const results = useMemo(() => searchAll(filesMap, query, scopes), [filesMap, query, scopes]);
  const byFile = useMemo(() => {
    const g = {};
    for (const r of results) (g[r.file] ||= []).push(r);
    return g;
  }, [results]);

  const input = 'rounded border border-white/15 bg-black/30 px-2 py-1.5 text-xs outline-none focus:border-white/30';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="font-medium">Search &amp; replace · all files</div>
        <button onClick={onClose} className="text-white/50 hover:text-white">
          ✕
        </button>
      </header>

      <div className="space-y-3 border-b border-white/10 px-5 py-4">
        {/* Find + scopes */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find across all files…"
            className={`${input} w-72`}
          />
          <div className="flex items-center gap-3 text-[11px] text-white/60">
            {SCOPE_KEYS.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={scopes[k]}
                  onChange={(e) => setScopes((s) => ({ ...s, [k]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Text replace */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-white/30">Replace</span>
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="…with this text"
            className={`${input} w-72`}
          />
          <button
            onClick={() => onReplace(query, replace, scopes)}
            disabled={!query}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              query ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'bg-white/10 text-white/40'
            }`}
          >
            Replace all
          </button>
          <span className="text-[11px] text-white/30">replaces matched text in the checked scopes</span>
        </div>

        {/* Token-aware rename */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-white/30">Rename</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="from path, e.g. neutral" className={`${input} w-44`} />
          <span className="text-white/30">→</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to path, e.g. gray" className={`${input} w-44`} />
          <button
            onClick={() => onRename(from, to)}
            disabled={!from || !to}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              from && to ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-white/10 text-white/40'
            }`}
          >
            Rename + update aliases
          </button>
          <span className="text-[11px] text-white/30">moves the token/group and fixes every {'{alias}'} pointing at it</span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-5 py-3">
        {query && (
          <div className="mb-2 text-[11px] text-white/40">
            {results.length} match{results.length === 1 ? '' : 'es'} in {Object.keys(byFile).length} file
            {Object.keys(byFile).length === 1 ? '' : 's'}
          </div>
        )}
        {Object.entries(byFile).map(([file, rows]) => (
          <div key={file} className="mb-4">
            <div className="mb-1 font-mono text-[11px] text-white/50">
              {file} <span className="text-white/30">· {rows.length}</span>
            </div>
            {rows.map((r) => {
              const snippet = r.matches.value || r.matches.alias || r.matches.description;
              return (
                <button
                  key={r.path.join('/')}
                  onClick={() => onJump(file, r.name)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-white/5"
                >
                  <span className="font-mono text-white/80">
                    <Highlight text={r.name} q={scopes.names ? query : ''} />
                  </span>
                  {snippet && (
                    <span className="truncate font-mono text-[11px] text-white/40">
                      <Highlight text={snippet} q={query} />
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[9px] uppercase text-white/25">{(r.type || '')[0]}</span>
                </button>
              );
            })}
          </div>
        ))}
        {query && !results.length && <div className="text-xs text-white/30">No matches.</div>}
        {!query && <div className="text-xs text-white/30">Type to search token names, values, aliases, and descriptions across every file.</div>}
      </div>
    </div>
  );
}
