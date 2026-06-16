import { isAlias } from '../model/dtcg.js';
import { toCssColor, toHex6, fromHex6, isColorObject } from '../model/color.js';

export const isColor = (t) => t?.$type === 'color';

// Inline editor for a single token's $value: color picker for colors, comma list
// for fontFamily arrays, plain text otherwise. Aliases edit as their {ref} string.
export default function ValueEditor({ token, onChange }) {
  const value = token.$value;
  const alias = isAlias(value);

  if (isColor(token) && !alias) {
    const css = toCssColor(value);
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={toHex6(value)}
          onChange={(e) => onChange(fromHex6(e.target.value, value))}
          className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent p-0"
        />
        {isColorObject(value) ? (
          <span className="w-32 truncate font-mono text-[11px] text-white/60" title={css}>
            {css}
          </span>
        ) : (
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-32 rounded border border-white/15 bg-black/30 px-2 py-1 font-mono text-xs"
          />
        )}
      </div>
    );
  }

  const isArr = Array.isArray(value);
  return (
    <input
      type="text"
      value={isArr ? value.join(', ') : String(value)}
      onChange={(e) => onChange(isArr ? e.target.value.split(',').map((s) => s.trim()) : e.target.value)}
      className="w-full max-w-[18rem] rounded border border-white/15 bg-black/30 px-2 py-1 font-mono text-xs"
    />
  );
}
