'use client';

import { useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { GuestGateCard } from '@/components/auth/GuestGateCard';

export default function ExperimentsPage() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [result, setResult] = useState<string>('');

  const loadScenario = async () => {
    const scenario = await api.loadScenario({ name: 'default-market-scenario', config: { buyers: 100, sellers: 60 } });
    setResult(JSON.stringify(scenario, null, 2));
  };

  const exportEvents = async () => {
    const events = await api.exportEvents({ limit: 50 });
    setResult(JSON.stringify(events, null, 2));
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{t('pages.admin.title')}</h1>

        {!isAuthenticated ? (
          <GuestGateCard />
        ) : (
          <>
            <Card className="p-4 border-white/10 bg-white/[0.04]">
              <p className="text-sm text-white/60 mb-3">{t('pages.admin.hint')}</p>
              <div className="flex gap-2">
                <Button variant="marketPrimary" onClick={loadScenario}>{t('actions.loadScenario')}</Button>
                <Button variant="secondary" onClick={exportEvents}>{t('actions.exportEvents')}</Button>
              </div>
            </Card>
            <Card className="p-4 border-white/10 bg-black/25">
              <pre className="text-xs whitespace-pre-wrap text-white/80">{result || t('pages.admin.noOutput')}</pre>
            </Card>
          </>
        )}
      </div>
    </PageContainer>
  );
}
