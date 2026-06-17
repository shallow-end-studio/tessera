import { useState } from 'react';
import { isToken } from '../model/dtcg.js';

const kids = (node) => Object.keys(node || {}).filter((k) => !k.startsWith('$'));

function allGroupPaths(tree, prefix = [], out = new Set()) {
  for (const k of kids(tree)) {
    const node = tree[k];
    const path = [...prefix, k];
    if (!isToken(node)) {
      out.add(path.join('/'));
      allGroupPaths(node, path, out);
    }
  }
  return out;
}

// A structure rail: the active file's group/token hierarchy. Tokens and groups
// are draggable; dropping onto a group moves the node into it (kept-key reparent).
// Dropping on empty space moves to the root. Clicking filters the table.
export default function TreeRail({ tree, onMove, onSelect, activePath, onNodeDragStart, onNodeDragEnd, onUngroup, onGroup, onRename }) {
  const [expanded, setExpanded] = useState(() => new Set(kids(tree || {}).map((k) => k))); // top level open
  const [dragPath, setDragPath] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const toggle = (p) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });

  const drop = (groupPath) => {
    if (dragPath != null) onMove(dragPath.split('/'), groupPath);
    setDragPath(null);
    setDropTarget(null);
  };
  const begin = (e, pathStr, path) => {
    e.stopPropagation();
    setDragPath(pathStr);
    onNodeDragStart?.(path); // also offer it to the sidebar for cross-file moves
  };
  const end = () => {
    setDragPath(null);
    setDropTarget(null);
    onNodeDragEnd?.();
  };

  const renderNode = (name, node, path) => {
    const pathStr = path.join('/');
    const indent = (path.length - 1) * 12 + 6;
    const dragging = dragPath === pathStr;

    if (isToken(node)) {
      return (
        <div
          key={pathStr}
          draggable
          onDragStart={(e) => begin(e, pathStr, path)}
          onDragEnd={end}
          onClick={() => onSelect(pathStr)}
          style={{ paddingLeft: indent }}
          title={pathStr}
          className={`group flex cursor-grab items-center gap-1.5 rounded py-1 pr-2 text-xs hover:bg-white/5 ${
            dragging ? 'opacity-40' : ''
          } ${activePath === pathStr ? 'bg-indigo-500/20 text-white' : 'text-white/65'}`}
        >
          <span className="text-white/25">•</span>
          <span className="truncate">{name}</span>
          <span className="ml-auto shrink-0 text-[9px] uppercase text-white/25">{(node.$type || '')[0]}</span>
          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename(path);
              }}
              title="Rename"
              className="shrink-0 px-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
            >
              ✎
            </button>
          )}
          {onGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroup(path);
              }}
              title="Wrap in a new group"
              className="shrink-0 px-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
            >
              ⤵
            </button>
          )}
        </div>
      );
    }

    const open = expanded.has(pathStr);
    const isDrop = dropTarget === pathStr;
    return (
      <div
        key={pathStr}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dropTarget !== pathStr) setDropTarget(pathStr);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drop(path);
        }}
      >
        <div
          draggable
          onDragStart={(e) => begin(e, pathStr, path)}
          onDragEnd={end}
          onClick={() => {
            toggle(pathStr);
            onSelect(pathStr);
          }}
          style={{ paddingLeft: indent }}
          className={`group flex cursor-pointer items-center gap-1 rounded py-1 pr-2 text-xs hover:bg-white/5 ${
            isDrop ? 'bg-indigo-500/30 ring-1 ring-indigo-400' : ''
          } ${dragging ? 'opacity-40' : ''}`}
        >
          <span className="w-3 shrink-0 text-white/40">{open ? '▾' : '▸'}</span>
          <span className="truncate font-medium text-white/85">{name}</span>
          <span className="ml-auto shrink-0 text-[9px] text-white/25">{kids(node).length}</span>
          {onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename(path);
              }}
              title="Rename group"
              className="shrink-0 px-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
            >
              ✎
            </button>
          )}
          {onGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroup(path);
              }}
              title="Wrap in a new group"
              className="shrink-0 px-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
            >
              ⤵
            </button>
          )}
          {onUngroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUngroup(path);
              }}
              title="Ungroup — promote children up a level"
              className="shrink-0 px-1 text-white/30 opacity-0 transition hover:text-white group-hover:opacity-100"
            >
              ⤴
            </button>
          )}
        </div>
        {open && kids(node).map((k) => renderNode(k, node[k], [...path, k]))}
      </div>
    );
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => drop([])}
      className="flex h-full flex-col overflow-auto border-r border-white/10 bg-black/10"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-white/30">Structure</span>
        <div className="flex gap-2 text-[10px] text-white/40">
          <button onClick={() => setExpanded(allGroupPaths(tree))} className="hover:text-white">
            expand
          </button>
          <button onClick={() => setExpanded(new Set())} className="hover:text-white">
            collapse
          </button>
        </div>
      </div>
      <div className="flex-1 p-1.5">{tree ? kids(tree).map((k) => renderNode(k, tree[k], [k])) : null}</div>
      <div className="border-t border-white/10 px-3 py-1.5 text-[10px] leading-snug text-white/25">
        Drag a token or group onto another group to move it. Drop on empty space for root.
      </div>
    </div>
  );
}
