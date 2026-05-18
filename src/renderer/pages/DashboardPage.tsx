import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ImportModal } from '../components/ImportModal';

export function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          onClick={() => {
            setModalOpen(true);
          }}
        >
          Importer un relevé
        </Button>
      </div>
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
            Bienvenue
          </CardTitle>
        </CardHeader>
        <CardContent style={{ color: 'var(--paper-mute)', fontSize: 13 }}>
          Le tableau de bord arrivera en Phase 2. Pour l'instant, c'est juste le shell.
        </CardContent>
      </Card>
      <ImportModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
      />
    </div>
  );
}
