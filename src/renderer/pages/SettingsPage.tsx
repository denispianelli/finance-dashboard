import { Card, CardContent, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';

export function SettingsPage() {
  return (
    <Card>
      <Overline>À venir · Phase 2+</Overline>
      <CardTitle>Paramètres</CardTitle>
      <CardContent>Gestion des comptes, modèle LLM, OCR, thème, backup.</CardContent>
    </Card>
  );
}
