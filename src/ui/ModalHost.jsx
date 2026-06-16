import { TOKEN_TYPES } from '../api.js';

// Renders the active modal (css / import / token / file / diff). All state lives
// in the parent; this is the presentation + which-action-button-to-show switch.
export default function ModalHost({ modal, active, setModal, onSubmitToken, onSubmitFile, onApplyImport, onCopy, onWrite }) {
  if (!modal) return null;

  const title =
    modal.kind === 'css'
      ? 'Generated tokens.css'
      : modal.kind === 'import'
        ? 'Import DTCG JSON'
        : modal.kind === 'token'
          ? modal.mode === 'add'
            ? 'Add token'
            : 'Rename token'
          : modal.kind === 'file'
            ? modal.mode === 'new'
              ? 'New token file'
              : 'Rename file'
            : modal.title
              ? `${modal.title} · ${modal.changes.length} change${modal.changes.length > 1 ? 's' : ''}`
              : `Review ${modal.changes.length} change${modal.changes.length > 1 ? 's' : ''} → ${
                  modal.compare ? 'dark + light themes' : active
                }`;

  const field =
    'rounded border border-white/15 bg-black/30 px-2 py-1.5 font-mono outline-none focus:border-white/30';
  const primary = 'rounded bg-indigo-500 px-4 py-1.5 text-xs font-medium hover:bg-indigo-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={() => setModal(null)}>
      <div
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-white/10 bg-[#0b1020] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="font-medium">{title}</span>
          <button onClick={() => setModal(null)} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>

        {modal.kind === 'token' ? (
          <div className="m-4 flex flex-col gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-white/50">Name (slash path, e.g. surface/raised)</span>
              <input
                autoFocus
                value={modal.name}
                onChange={(e) => setModal({ ...modal, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && onSubmitToken()}
                placeholder="group/subgroup/token"
                className={field}
              />
            </label>
            {modal.mode === 'add' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-white/50">Type</span>
                  <select
                    value={modal.type}
                    onChange={(e) => setModal({ ...modal, type: e.target.value })}
                    className="rounded border border-white/15 bg-black/30 px-2 py-1.5 outline-none focus:border-white/30"
                  >
                    {TOKEN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-white/50">
                    Value {modal.type === 'color' ? '(#hex or {alias})' : modal.type === 'boolean' ? '(true/false)' : ''}
                  </span>
                  <input
                    value={modal.value}
                    onChange={(e) => setModal({ ...modal, value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && onSubmitToken()}
                    placeholder={modal.type === 'color' ? '#3b82f6' : ''}
                    className={field}
                  />
                </label>
              </>
            )}
          </div>
        ) : modal.kind === 'file' ? (
          <div className="m-4 flex flex-col gap-1 text-xs">
            <span className="text-white/50">File name</span>
            <input
              autoFocus
              value={modal.name}
              onChange={(e) => setModal({ ...modal, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && onSubmitFile()}
              placeholder="my-collection.tokens.json"
              className={field}
            />
            <span className="mt-1 text-[11px] text-white/30">“.tokens.json” is appended if you omit an extension.</span>
          </div>
        ) : modal.kind === 'diff' ? (
          <div className="m-4 max-h-[55vh] overflow-auto rounded border border-white/10 bg-black/40">
            <table className="w-full text-xs">
              <tbody>
                {modal.changes.map((c) => (
                  <tr key={c.key} className="border-b border-white/5">
                    <td className="px-3 py-1.5 font-mono text-white/80">{c.key}</td>
                    <td className="px-3 py-1.5 font-mono text-rose-300/80">
                      {c.from === undefined ? <em className="text-white/30">added</em> : JSON.stringify(c.from)}
                    </td>
                    <td className="px-2 text-white/30">→</td>
                    <td className="px-3 py-1.5 font-mono text-emerald-300/90">
                      {c.to === undefined ? <em className="text-white/30">removed</em> : JSON.stringify(c.to)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <textarea
            value={modal.text}
            readOnly={modal.kind === 'css'}
            onChange={(e) => setModal({ ...modal, text: e.target.value })}
            placeholder="Paste a DTCG token JSON object…"
            spellCheck={false}
            className="m-4 h-[55vh] resize-none rounded border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/80 outline-none"
          />
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          {modal.kind === 'css' && (
            <button onClick={() => onCopy(modal.text)} className={primary}>
              Copy
            </button>
          )}
          {modal.kind === 'import' && (
            <button onClick={onApplyImport} className={primary}>
              Load into editor
            </button>
          )}
          {modal.kind === 'token' && (
            <button onClick={onSubmitToken} className={primary}>
              {modal.mode === 'add' ? 'Add token' : 'Rename'}
            </button>
          )}
          {modal.kind === 'file' && (
            <button onClick={onSubmitFile} className={primary}>
              {modal.mode === 'new' ? 'Create' : 'Rename'}
            </button>
          )}
          {modal.kind === 'diff' && (
            <>
              <button onClick={() => setModal(null)} className="rounded bg-white/10 px-4 py-1.5 text-xs hover:bg-white/20">
                Cancel
              </button>
              <button
                onClick={onWrite}
                className="rounded bg-emerald-500 px-4 py-1.5 text-xs font-medium text-black hover:bg-emerald-400"
              >
                Save to disk
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
