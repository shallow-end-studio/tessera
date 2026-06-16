import { getAt, resolveAlias } from '../model/dtcg.js';
import { toCssColor } from '../model/color.js';
import ValueEditor from './ValueEditor.jsx';

// Dark-vs-Light comparison: each semantic token with both values side by side.
export default function CompareTable({ cmpRows, cmp, primitivesTree, onCmpValue }) {
  const base = primitivesTree || {};
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-[#0b1020] text-left text-[11px] uppercase tracking-wide text-white/40">
        <tr>
          <th className="px-5 py-2 font-medium">Token</th>
          <th className="px-3 py-2 font-medium">Dark</th>
          <th className="px-3 py-2 font-medium">Light</th>
        </tr>
      </thead>
      <tbody>
        {cmpRows.map(({ path }) => {
          const name = path.join('/');
          const dTok = getAt(cmp.dark, path);
          const lTok = getAt(cmp.light, path);
          const dSw = dTok && toCssColor(resolveAlias(dTok.$value, cmp.dark, base));
          const lSw = lTok && toCssColor(resolveAlias(lTok.$value, cmp.light, base));
          return (
            <tr key={name} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="px-5 py-2 font-mono text-xs text-white/80">{name}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {dTok && <ValueEditor token={dTok} onChange={(v) => onCmpValue('dark', path, v)} />}
                  {dSw && (
                    <span className="h-4 w-4 shrink-0 rounded border border-white/20" style={{ background: dSw }} title={dSw} />
                  )}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {lTok && <ValueEditor token={lTok} onChange={(v) => onCmpValue('light', path, v)} />}
                  {lSw && (
                    <span className="h-4 w-4 shrink-0 rounded border border-white/20" style={{ background: lSw }} title={lSw} />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
