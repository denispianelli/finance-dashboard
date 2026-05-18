import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ImportModal } from '../components/ImportModal';

export function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
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
          <CardTitle>Bienvenue</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
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
