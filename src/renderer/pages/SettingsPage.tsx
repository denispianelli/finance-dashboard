import { AccountManager } from '../components/accounts/AccountManager';
import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <AccountManager />
      <Card>
        <Overline>À venir · Phase 2+</Overline>
        <CardTitle>Autres paramètres</CardTitle>
        <CardContent>Modèle LLM, OCR, thème, backup.</CardContent>
      </Card>
    </div>
  );
}
