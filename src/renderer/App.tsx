import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';

export default function App() {
  return (
    <div className="min-h-screen p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Finance Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Phase 0 — Foundation. shadcn/ui + dark theme.</p>
          <Button>Test button</Button>
        </CardContent>
      </Card>
    </div>
  );
}
