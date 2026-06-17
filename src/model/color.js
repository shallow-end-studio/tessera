// Color value helpers. Supports the color shapes we encounter:
//   - DTCG object:        { colorSpace, channels: [r,g,b] (0..1), alpha }
//   - Figma export:       { colorSpace, components: [r,g,b] (0..1), alpha, hex }
//   - simple hex string:  '#rrggbb' / '#rrggbbaa'
// Resolved alias values arrive here too, so everything is format-agnostic.

export function isColorObject(v) {
  return v && typeof v === 'object' && (Array.isArray(v.channels) || Array.isArray(v.components) || typeof v.hex === 'string');
}

const channelsOf = (v) => v.channels || v.components || null;
const clamp = (n) => Math.max(0, Math.min(255, Math.round(n * 255)));
const h2 = (n) => clamp(n).toString(16).padStart(2, '0');

// Any color value → a CSS color string (rgb/rgba or the hex as-is). null if not a color.
export function toCssColor(v) {
  if (isColorObject(v)) {
    const a = v.alpha === undefined ? 1 : v.alpha;
    if (a >= 1 && typeof v.hex === 'string') return v.hex;
    const ch = channelsOf(v);
    if (ch) {
      const [r, g, b] = ch;
      return a >= 1 ? `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})` : `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${+a.toFixed(3)})`;
    }
    return typeof v.hex === 'string' ? v.hex : null;
  }
  if (typeof v === 'string' && /^#([0-9a-f]{3,8})$/i.test(v)) return v;
  return null;
}

// Any color value → a 6-digit hex (for <input type="color">). Falls back to #000000.
export function toHex6(v) {
  if (isColorObject(v)) {
    const ch = channelsOf(v);
    if (ch) return '#' + h2(ch[0]) + h2(ch[1]) + h2(ch[2]);
    if (typeof v.hex === 'string' && /^#([0-9a-f]{6,8})$/i.test(v.hex)) return '#' + v.hex.slice(1, 7);
    return '#000000';
  }
  if (typeof v === 'string' && /^#([0-9a-f]{6,8})$/i.test(v)) return '#' + v.slice(1, 7);
  if (typeof v === 'string' && /^#([0-9a-f]{3})$/i.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('');
  }
  return '#000000';
}

// Build a new value from an edited 6-digit hex, preserving the original's shape
// (object stays an object — keeping its channels/components/hex/alpha/colorSpace key).
export function fromHex6(hex, like) {
  if (isColorObject(like)) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const out = { ...like, colorSpace: like.colorSpace || 'srgb', alpha: like.alpha === undefined ? 1 : like.alpha };
    if (Array.isArray(like.components)) out.components = [r, g, b];
    else out.channels = [r, g, b];
    if (typeof like.hex === 'string') out.hex = hex.toUpperCase();
    return out;
  }
  return hex;
}

export function isValidColor(v) {
  return isColorObject(v) || (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v));
}
