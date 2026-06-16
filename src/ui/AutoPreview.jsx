import { flatten, resolveAlias } from '../model/dtcg.js';
import { toCssColor } from '../model/color.js';

// A structure-driven preview of any token file: colors become swatch ramps
// (grouped by their parent group), numbers become proportional scales, and
// fontFamily/size tokens become type samples. Aliases resolve through `bases`.
export default function AutoPreview({ tree, bases = [] }) {
  if (!tree) return null;
  const resolve = (tok) => resolveAlias(tok.$value, tree, ...bases);
  const groupKey = (path) => path.slice(0, -1).join('/') || '·';

  const colorGroups = {};
  const numberGroups = {};
  const sizes = [];
  const families = [];
  let fontStack = "'IBM Plex Mono', ui-monospace, monospace";

  for (const { path, token } of flatten(tree)) {
    const lit = resolve(token);
    const css = toCssColor(lit);
    if (token.$type === 'color' || css) {
      if (css) (colorGroups[groupKey(path)] ||= []).push({ name: path[path.length - 1], path, css });
    } else if (token.$type === 'fontFamily' || token.$type === 'text') {
      const fam = Array.isArray(lit) ? lit.join(', ') : String(lit);
      families.push({ path, fam });
      if (path.join('/').includes('mono') || families.length === 1) fontStack = `${fam}, ui-monospace, monospace`;
    } else if (typeof lit === 'number') {
      if (path.join('/').includes('size')) sizes.push({ path, value: lit });
      else (numberGroups[groupKey(path)] ||= []).push({ name: path[path.length - 1], value: lit });
    }
  }

  const colorRows = Object.entries(colorGroups);
  const numberRows = Object.entries(numberGroups);
  sizes.sort((a, b) => a.value - b.value);
  const hasAny = colorRows.length || numberRows.length || sizes.length || families.length;

  const Section = ({ label, children }) => (
    <div className="mb-4">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-white/30">{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      {!hasAny && <div className="text-xs text-white/30">No previewable tokens in this file.</div>}

      {colorRows.length > 0 && (
        <Section label={`Colors · ${colorRows.reduce((n, [, s]) => n + s.length, 0)}`}>
          {colorRows.map(([group, swatches]) => (
            <div key={group} className="mb-2">
              <div className="mb-1 truncate font-mono text-[10px] text-white/40" title={group}>
                {group}
              </div>
              <div className="flex flex-wrap gap-1">
                {swatches.map((s) => (
                  <span
                    key={s.path.join('/')}
                    title={`${s.path.join('/')} — ${s.css}`}
                    style={{ background: s.css }}
                    className="h-7 w-7 rounded border border-white/15"
                  />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {sizes.length > 0 && (
        <Section label={`Type scale · ${sizes.length}`}>
          {sizes.map((s) => (
            <div key={s.path.join('/')} className="flex items-baseline gap-2 overflow-hidden">
              <span
                style={{ fontSize: Math.min(s.value, 40), fontFamily: fontStack, lineHeight: 1.2 }}
                className="truncate text-white/85"
              >
                Ag
              </span>
              <span className="font-mono text-[10px] text-white/30">
                {s.path[s.path.length - 1]} · {s.value}
              </span>
            </div>
          ))}
        </Section>
      )}

      {numberRows.length > 0 && (
        <Section label="Scale">
          {numberRows.map(([group, items]) => {
            const max = Math.max(...items.map((i) => i.value), 1);
            return (
              <div key={group} className="mb-2">
                <div className="mb-1 truncate font-mono text-[10px] text-white/40" title={group}>
                  {group}
                </div>
                {items.map((i) => (
                  <div key={i.name} className="flex items-center gap-2">
                    <div className="h-2 rounded bg-indigo-400/70" style={{ width: `${(i.value / max) * 100}%` }} />
                    <span className="shrink-0 font-mono text-[10px] text-white/40">
                      {i.name} · {i.value}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </Section>
      )}

      {families.length > 0 && (
        <Section label="Fonts">
          {families.map((f) => (
            <div key={f.path.join('/')} className="mb-1">
              <div style={{ fontFamily: `${f.fam}, ui-monospace, monospace` }} className="text-sm text-white/85">
                {f.fam}
              </div>
              <div
                style={{ fontFamily: `${f.fam}, ui-monospace, monospace` }}
                className="truncate text-xs text-white/45"
              >
                The quick brown fox — 0123456789
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
