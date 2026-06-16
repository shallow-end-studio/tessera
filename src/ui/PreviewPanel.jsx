import Preview from './Preview.jsx';

// Right rail: the dark and light theme samples side by side.
export default function PreviewPanel({ darkTheme, lightTheme, primitives }) {
  return (
    <aside className="flex w-[480px] shrink-0 flex-col overflow-auto border-l border-white/10 bg-black/20 p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-white/40">Live preview</div>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-[11px] font-medium text-white/50">Dark</div>
          <Preview theme={darkTheme} core={{}} primitives={primitives} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-[11px] font-medium text-white/50">Light</div>
          <Preview theme={lightTheme} core={{}} primitives={primitives} />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-white/30">
        Rendered from resolved token values. Editing primitives or either theme updates these live.
      </p>
    </aside>
  );
}
