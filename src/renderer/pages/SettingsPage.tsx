import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <Card>
        <CardHeader>
          <CardTitle>À venir</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Gestion des comptes, modèle LLM, OCR, thème, backup.
        </CardContent>
      </Card>
    </div>
  );
}
