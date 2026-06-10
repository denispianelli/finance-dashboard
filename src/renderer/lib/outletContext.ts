/** Shared via react-router's `<Outlet context>` from AppShell to the routed pages.
 *  `refreshToken` bumps whenever data changes (e.g. after an import) so pages
 *  can refetch. */
export interface AppOutletContext {
  readonly refreshToken: number;
  /** Open the import-a-statement modal (Topbar). */
  readonly openImport: () => void;
  /** Open the create-account modal (account tabs "+ Ajouter" button). */
  readonly openCreateAccount: () => void;
}
