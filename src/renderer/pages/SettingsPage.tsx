import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';

export function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <Overline>À venir · Phase 2+</Overline>
      </CardHeader>
      <CardTitle>Paramètres</CardTitle>
      <CardContent>Gestion des comptes, modèle LLM, OCR, thème, backup.</CardContent>
    </Card>
  );
}
