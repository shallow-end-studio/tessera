import AutoPreview from './AutoPreview.jsx';

// Right rail: a structure-driven preview of the file currently being edited.
export default function PreviewPanel({ tree, bases, label }) {
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wide text-white/40">Live preview</span>
        {label && <span className="truncate font-mono text-[10px] text-white/30">{label}</span>}
      </div>
      <AutoPreview tree={tree} bases={bases} />
    </aside>
  );
}
