'use client';

import { useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { api } from '@/lib/api';

export default function ExperimentsPage() {
  const [result, setResult] = useState<string>('');

  const loadScenario = async () => {
    const scenario = await api.loadScenario({ name: 'default-market-scenario', config: { buyers: 100, sellers: 60 } });
    setResult(JSON.stringify(scenario));
  };

  const exportEvents = async () => {
    const events = await api.exportEvents({ limit: 50 });
    setResult(JSON.stringify(events));
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Admin Experiments</h1>
        <Card className="p-4 flex gap-2">
          <Button onClick={loadScenario}>Load Scenario</Button>
          <Button variant="secondary" onClick={exportEvents}>Export Events</Button>
        </Card>
        <Card className="p-4">
          <pre className="text-xs whitespace-pre-wrap">{result || 'No output yet'}</pre>
        </Card>
      </div>
    </PageContainer>
  );
}
