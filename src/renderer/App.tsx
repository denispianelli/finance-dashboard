import { useState } from 'react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ipc } from './ipc/client';

export default function App() {
  const [pong, setPong] = useState<string>('');

  async function ping() {
    const result = await ipc.invoke('app:ping', { now: Date.now() });
    setPong(`pong roundtrip: ${result.serverNow - result.receivedAt}ms`);
  }

  return (
    <div className="min-h-screen p-8">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Finance Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">IPC test</p>
          <Button
            onClick={() => {
              void ping();
            }}
          >
            Ping main
          </Button>
          {pong && <p className="text-sm">{pong}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
