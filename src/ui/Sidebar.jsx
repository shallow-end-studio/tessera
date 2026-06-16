import { useState } from 'react';

// Leftmost rail: the token-file list with compare entry, new/rename/delete, and
// drag-to-reorder (order persistence is handled by the onReorder callback).
export default function Sidebar({
  dir,
  files,
  active,
  compare,
  dirty,
  onOpenCompare,
  onNewFile,
  onLoad,
  onRenameFile,
  onDeleteFile,
  onReorder,
}) {
  const [dragIndex, setDragIndex] = useState(null);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-black/20">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-base font-semibold">Tessera</div>
        <div className="mt-0.5 truncate text-[11px] text-white/40" title={dir}>
          {dir || 'loading…'}
        </div>
      </div>
      <nav className="flex-1 overflow-auto p-2">
        <button
          onClick={onOpenCompare}
          className={`mb-1 block w-full truncate rounded px-3 py-2 text-left text-xs ${
            compare ? 'bg-indigo-500/30 text-white' : 'text-white/70 hover:bg-white/5'
          }`}
        >
          ⇄ Dark vs Light
        </button>
        <div className="my-1 flex items-center justify-between px-3 py-1">
          <span className="text-[10px] uppercase tracking-wide text-white/30">Files</span>
          <button
            onClick={onNewFile}
            title="New token file"
            className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ＋
          </button>
        </div>
        {files.map((f, i) => (
          <div
            key={f}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              onReorder(dragIndex, i);
              setDragIndex(null);
            }}
            className={`group flex items-center rounded ${dragIndex === i ? 'opacity-40' : ''} ${
              f === active ? 'bg-indigo-500/30' : 'hover:bg-white/5'
            }`}
          >
            <span className="cursor-grab select-none px-1 text-white/20 group-hover:text-white/40" title="Drag to reorder">
              ⠿
            </span>
            <button
              onClick={() => (dirty ? confirm('Discard unsaved changes?') && onLoad(f) : onLoad(f))}
              className={`flex-1 truncate py-2 pr-1 text-left text-xs ${f === active ? 'text-white' : 'text-white/70'}`}
            >
              {f}
            </button>
            <div className="flex items-center opacity-0 transition group-hover:opacity-100">
              <button onClick={() => onRenameFile(f)} title="Rename file" className="px-1 text-white/50 hover:text-white">
                ✎
              </button>
              <button onClick={() => onDeleteFile(f)} title="Delete file" className="px-1.5 text-white/50 hover:text-rose-300">
                🗑
              </button>
            </div>
          </div>
        ))}
        {!files.length && <div className="px-3 py-2 text-xs text-white/40">No token files.</div>}
      </nav>
    </aside>
  );
}
