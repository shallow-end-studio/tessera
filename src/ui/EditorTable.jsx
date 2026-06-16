import { toCssColor } from '../model/color.js';
import ValueEditor from './ValueEditor.jsx';

// Single-file token table. `resolveValue(token)` returns an alias's resolved value
// (or null for non-aliases); the swatch/text are derived here.
export default function EditorTable({ rows, issues, resolveValue, onValue, onRename, onDelete }) {
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-[#0b1020] text-left text-[11px] uppercase tracking-wide text-white/40">
        <tr>
          <th className="px-5 py-2 font-medium">Token</th>
          <th className="px-3 py-2 font-medium">Type</th>
          <th className="px-3 py-2 font-medium">Value</th>
          <th className="px-3 py-2 font-medium">Resolved</th>
          <th className="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ path, token }) => {
          const name = path.join('/');
          const resolved = resolveValue(token);
          const swatch = toCssColor(resolved);
          const issue = issues[name];
          return (
            <tr key={name} className="group border-t border-white/5 hover:bg-white/[0.02]">
              <td className="px-5 py-2 font-mono text-xs text-white/80">
                {issue && (
                  <span className="mr-1.5 text-amber-400" title={issue}>
                    ⚠
                  </span>
                )}
                {name}
              </td>
              <td className="px-3 py-2 text-[11px] text-white/40">{token.$type || '—'}</td>
              <td className="px-3 py-2">
                <ValueEditor token={token} onChange={(v) => onValue(path, v)} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {swatch && (
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded border border-white/20"
                      style={{ background: swatch }}
                    />
                  )}
                  {resolved != null && (
                    <span className="font-mono text-[11px] text-white/50">{swatch ?? String(resolved)}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => onRename(name)}
                    title="Rename"
                    className="rounded px-1.5 py-0.5 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(path)}
                    title="Delete"
                    className="rounded px-1.5 py-0.5 text-white/50 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    🗑
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
