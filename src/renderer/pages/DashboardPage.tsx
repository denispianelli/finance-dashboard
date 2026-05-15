import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Le tableau de bord arrivera en Phase 2. Pour l'instant, c'est juste le shell.
        </CardContent>
      </Card>
    </div>
  );
}
