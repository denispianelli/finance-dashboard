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
        <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-7 pb-8 pt-6">
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
