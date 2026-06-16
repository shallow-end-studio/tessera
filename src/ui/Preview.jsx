import { getAt, resolveAlias } from '../model/dtcg.js';
import { toCssColor } from '../model/color.js';

// Resolve a dotted token path against theme → core → primitives, then a fallback.
// Aliases (e.g. {palette.blue.600}) chase through primitives.
function val(theme, core, primitives, dotPath, fallback) {
  const segs = dotPath.split('.');
  const leaf = getAt(theme || {}, segs) || getAt(core || {}, segs) || getAt(primitives || {}, segs);
  if (!leaf || !('$value' in leaf)) return fallback;
  const r = resolveAlias(leaf.$value, theme || {}, core || {}, primitives || {});
  return r == null ? fallback : r;
}

const PLAYERS = ['red', 'yellow', 'blue', 'green'];

// A small sample of Mini-Nation chrome, styled entirely from token values so it
// reflects edits live. `theme` is the active theme tree, `core` the shared tree.
export default function Preview({ theme, core, primitives }) {
  const raw = (path, fb) => val(theme, core, primitives, path, fb);
  // Color reads go through toCssColor so object-format colors render.
  const c = (path, fb) => toCssColor(val(theme, core, primitives, path)) || fb;

  const surface = c('surface.base', '#091634');
  const textStrong = c('text.strong', '#dfebfb');
  const textBody = c('text.body', '#9cbbe2');
  const borderSubtle = c('border.subtle', '#6985ab');
  const radius = raw('radius.8', 8);
  const pad = raw('spacing.16', 16);

  // Typography from tokens (numbers; fall back to sensible defaults).
  const num = (path, fb) => {
    const v = raw(path);
    return typeof v === 'number' ? v : fb;
  };
  const monoRaw = raw('text.font.mono', 'IBM Plex Mono');
  const mono = (Array.isArray(monoRaw) ? monoRaw : [monoRaw]).filter(Boolean).join(' ');
  const fontStack = `'${mono}', 'IBM Plex Mono', ui-monospace, monospace`;
  const sizeTitle = num('text.size.16', 16);
  const sizeBody = num('text.size.12', 12);
  const sizeSmall = num('text.size.10', 10);
  const wBold = num('text.weight.bold', 700);
  const wMedium = num('text.weight.medium', 500);
  const wRegular = num('text.weight.regular', 400);
  const lhTitle = num('text.line-height.24', 24);
  const trackWide = num('text.tracking.wide', 0.8);

  const tab = (state) => ({
    background: c(`tab.surface.${state}`, 'transparent'),
    color: c(`tab.text.${state}`, textBody),
    border: `2px solid ${state === 'selected' ? c('tab.border.selected', borderSubtle) : 'transparent'}`,
    padding: '8px 12px',
    borderRadius: radius,
    fontSize: sizeBody,
    fontWeight: wMedium,
    letterSpacing: `${trackWide}px`,
  });

  return (
    <div
      style={{
        background: surface,
        color: textBody,
        border: `1px solid ${borderSubtle}`,
        borderRadius: radius,
        padding: pad,
        fontFamily: fontStack,
        display: 'flex',
        flexDirection: 'column',
        gap: pad,
      }}
    >
      <div>
        <div style={{ color: textStrong, fontSize: sizeTitle, fontWeight: wBold, lineHeight: `${lhTitle}px` }}>
          Mini-Nation
        </div>
        <div style={{ color: textBody, fontSize: sizeBody, fontWeight: wRegular }}>
          Game status — live token preview
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <span style={tab('selected')}>Map</span>
        <span style={tab('rest')}>Market</span>
        <span style={tab('rest')}>Players</span>
      </div>

      {/* Player chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {PLAYERS.map((p) => (
          <span
            key={p}
            title={p}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              background: c(`player.${p}.surface.rest`, '#888'),
              border: `2px solid ${c(`player.${p}.border.rest`, '#fff')}`,
            }}
          />
        ))}
        <span
          title="city"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '28px',
            height: '28px',
            padding: '0 6px',
            borderRadius: '4px',
            fontSize: sizeSmall,
            fontWeight: wMedium,
            color: c('player.city.text.rest', '#fafafa'),
            background: c('player.city.surface.rest', '#737373'),
            border: `2px solid ${c('player.city.border.rest', '#d9d9d9')}`,
          }}
        >
          City
        </span>
      </div>

      <div style={{ borderTop: `1px solid ${borderSubtle}`, paddingTop: '8px', fontSize: sizeBody }}>
        <span style={{ color: textStrong, fontWeight: wBold }}>Strong</span>{' '}
        <span style={{ color: textBody, fontWeight: wRegular }}>/ body text sample</span>
      </div>
    </div>
  );
}
