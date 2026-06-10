import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { AppOutletContext } from '@renderer/lib/outletContext';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { useNetWorthSummary } from '@renderer/hooks/useNetWorthSummary';
import { useSidebarCollapse } from '@renderer/hooks/useSidebarCollapse';
import { ipc } from '@renderer/ipc/client';
import { ImportModal } from './ImportModal';
import { CreateAccountModal } from './accounts/CreateAccountModal';
import { CategorizationPrompt } from './model/CategorizationPrompt';
import { ModelDownloadIndicator } from './model/ModelDownloadIndicator';
import { shouldShowCategorizationPrompt } from './model/triggerLogic';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [importOpen, setImportOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const onApplied = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);
  const bg = useBackgroundCategorization({ onApplied });
  const { netWorth, monthDelta } = useNetWorthSummary(refreshToken);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapse();

  const modelStatus = useModelStatus();
  const startModelDownload = () => {
    void ipc.invoke('model:download:start', {});
  };

  const [optOut, setOptOut] = useState(false);
  // Track the refreshToken value at which the user last dismissed the banner.
  // A new import bumps refreshToken, which re-arms the banner without needing
  // an effect (avoids the react-hooks/set-state-in-effect lint rule).
  const [dismissedAtToken, setDismissedAtToken] = useState<number | null>(null);
  const dismissed = dismissedAtToken === refreshToken;

  useEffect(() => {
    void ipc.invoke('settings:getCategorizeOptOut', {}).then((r) => {
      setOptOut(r.value);
    });
  }, []);

  const showCategorizationPrompt = shouldShowCategorizationPrompt({
    state: modelStatus.state,
    pendingCount: bg.pending,
    optOut,
    dismissedThisSession: dismissed,
  });

  // When the model finishes downloading, kick off the categorization pass automatically.
  const prevModelState = useRef(modelStatus.state);
  useEffect(() => {
    if (prevModelState.current !== 'ready' && modelStatus.state === 'ready') {
      void bg.run();
    }
    prevModelState.current = modelStatus.state;
  }, [modelStatus.state, bg]);

  // Keep the pending count current (on mount, and after each import / edit) so the
  // model-install banner can size its message. This is a cheap COUNT — it never
  // loads the model.
  const refresh = bg.refresh;
  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return (
    <div className="flex h-full bg-ink-1">
      <Sidebar
        onImport={() => {
          setImportOpen(true);
        }}
        netWorth={netWorth}
        monthDelta={monthDelta}
        collapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onImport={() => {
            setImportOpen(true);
          }}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          categorizing={bg.running}
          categorizeRemaining={bg.remaining}
        />
        <ModelDownloadIndicator status={modelStatus} onResume={startModelDownload} />
        {showCategorizationPrompt && (
          <div className="px-5 pt-3 xl:px-7">
            <CategorizationPrompt
              pendingCount={bg.pending}
              onInstall={startModelDownload}
              onDismiss={() => {
                setDismissedAtToken(refreshToken);
              }}
              onOptOut={(value) => {
                setOptOut(value);
                void ipc.invoke('settings:setCategorizeOptOut', { value });
                if (value) setDismissedAtToken(refreshToken);
              }}
            />
          </div>
        )}
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
          // Kick off the LLM pass over what the deterministic cascade left
          // uncategorized. Non-blocking: rows stay editable during the pass.
          void bg.run();
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
