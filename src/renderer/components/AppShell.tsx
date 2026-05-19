import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ImportModal } from './ImportModal';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex h-full bg-ink-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onImport={() => {
            setImportOpen(true);
          }}
        />
        {/* min-h-0 lets this flex child shrink to the viewport and scroll;
            [&>*]:shrink-0 stops page sections from being vertically
            compressed (which collapsed AccountTabs when the window
            was short). Sections keep their natural height; main scrolls. */}
        <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 pb-8 pt-6 [&>*]:shrink-0">
          <Outlet />
        </main>
      </div>
      <ImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
      />
    </div>
  );
}
