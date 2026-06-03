import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { AppOutletContext } from '@renderer/lib/outletContext';
import { ImportModal } from './ImportModal';
import { CreateAccountModal } from './accounts/CreateAccountModal';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [importOpen, setImportOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

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
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-5 xl:gap-5 xl:px-7 xl:pb-8 xl:pt-6 [&>*]:shrink-0">
          <Outlet
            context={
              {
                refreshToken,
                openImport: () => {
                  setImportOpen(true);
                },
                openCreateAccount: () => {
                  setCreateAccountOpen(true);
                },
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>
      <ImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
        }}
        onImported={() => {
          setRefreshToken((t) => t + 1);
        }}
      />
      <CreateAccountModal
        open={createAccountOpen}
        onClose={() => {
          setCreateAccountOpen(false);
        }}
        onCreated={() => {
          setRefreshToken((t) => t + 1);
        }}
      />
    </div>
  );
}
