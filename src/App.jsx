import { useStudio } from './useStudio.js';
import Sidebar from './ui/Sidebar.jsx';
import Toolbar from './ui/Toolbar.jsx';
import TreeRail from './ui/TreeRail.jsx';
import EditorTable from './ui/EditorTable.jsx';
import CompareTable from './ui/CompareTable.jsx';
import PreviewPanel from './ui/PreviewPanel.jsx';
import SearchView from './ui/SearchView.jsx';
import ModalHost from './ui/ModalHost.jsx';

export default function App() {
  const s = useStudio();

  return (
    <div className="flex h-screen text-sm">
      <Sidebar
        dir={s.dir}
        files={s.files}
        active={s.active}
        compare={s.compare}
        search={s.search}
        dirty={s.dirty}
        onOpenCompare={s.openCompare}
        onOpenSearch={s.enterSearch}
        onNewFile={() => s.setModal({ kind: 'file', mode: 'new', name: '' })}
        onLoad={s.load}
        onRenameFile={(f) => s.setModal({ kind: 'file', mode: 'rename', orig: f, name: f })}
        onDeleteFile={s.deleteFile}
        onReorder={s.moveFile}
        nodeDragging={!!s.dragNode}
        onDropNodeToFile={s.dropNodeToFile}
      />

      {s.showTree && !s.compare && !s.search && s.tree && (
        <aside className="w-60 shrink-0">
          <TreeRail
            tree={s.tree}
            onMove={s.moveTreeNode}
            onSelect={s.setQuery}
            onNodeDragStart={s.startNodeDrag}
            onNodeDragEnd={s.endNodeDrag}
            onUngroup={s.ungroupGroup}
            onGroup={s.groupNode}
          />
        </aside>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        {s.search ? (
          <SearchView
            filesMap={s.searchMap}
            onJump={s.jumpTo}
            onReplace={s.doTextReplace}
            onRename={s.doRename}
            onClose={() => (s.files.length ? s.load(s.files[0]) : s.setMode('edit'))}
          />
        ) : (
          <>
        <Toolbar
          compare={s.compare}
          active={s.active}
          status={s.status}
          query={s.query}
          onQuery={s.setQuery}
          counts={{ rows: s.rows.length, all: s.allRows.length, cmp: s.cmpRows.length }}
          issueCount={Object.keys(s.issues).length}
          saveEnabled={s.compare ? !!s.cmpDirty : s.dirty}
          showTree={s.showTree}
          showPreview={s.showPreview}
          onAddToken={() => s.setModal({ kind: 'token', mode: 'add', name: '', type: 'color', value: '' })}
          onToggleTree={() => s.setShowTree((v) => !v)}
          onTogglePreview={() => s.setShowPreview((v) => !v)}
          onExportCss={s.openCss}
          onExportJson={s.downloadJson}
          onImport={() => s.setModal({ kind: 'import', text: '' })}
          onSave={s.save}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-auto">
            {!s.compare && (
              <EditorTable
                rows={s.rows}
                issues={s.issues}
                resolveValue={s.resolveValue}
                targets={s.aliasTargets}
                onValue={s.onValue}
                onRename={(name) => s.setModal({ kind: 'token', mode: 'rename', origPath: name, name })}
                onDelete={s.deleteToken}
              />
            )}
            {s.compare && (
              <CompareTable cmpRows={s.cmpRows} cmp={s.cmp} primitivesTree={s.primitivesTree} targets={s.compareTargets} onCmpValue={s.onCmpValue} />
            )}
          </div>

          {s.showPreview && <PreviewPanel tree={s.previewTree} bases={s.previewBases} label={s.previewLabel} />}
        </div>
          </>
        )}
      </main>

      <ModalHost
        modal={s.modal}
        active={s.active}
        setModal={s.setModal}
        onSubmitToken={s.submitToken}
        onSubmitFile={s.submitFile}
        onApplyImport={s.applyImport}
        onCopy={s.copyText}
        onWrite={s.doWrite}
        onApplyMove={s.applyMove}
        onApplyGroup={s.applyGroupWrap}
      />
    </div>
  );
}
