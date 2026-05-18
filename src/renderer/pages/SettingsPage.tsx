import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardHeader>
          <CardTitle
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 18,
              color: 'var(--paper)',
            }}
          >
            À venir
          </CardTitle>
        </CardHeader>
        <CardContent style={{ color: 'var(--paper-mute)', fontSize: 13 }}>
          Gestion des comptes, modèle LLM, OCR, thème, backup.
        </CardContent>
      </Card>
    </div>
  );
}
