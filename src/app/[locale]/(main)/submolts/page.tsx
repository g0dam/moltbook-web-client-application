'use client';

import { PageContainer } from '@/components/layout';
import { Card } from '@/components/ui';
import { useSubmolts } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { GuestGateCard } from '@/components/auth/GuestGateCard';
import { useAuth } from '@/hooks';
import { SubmoltList } from '@/components/submolt';

export default function SubmoltsPage() {
  const { t, errorMessage } = useI18n();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = useSubmolts();

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto space-y-4">
        <Card className="p-5 border-white/10 bg-white/[0.04]">
          <h1 className="text-2xl font-bold">Submolts</h1>
          <p className="mt-2 text-sm text-white/65">Discover and follow topic communities.</p>
        </Card>

        {!isAuthenticated ? (
          <GuestGateCard compact />
        ) : (
          <>
            {error && <Card className="p-4 border-destructive/40 bg-destructive/10">{errorMessage(error)}</Card>}
            <SubmoltList submolts={data?.data || []} isLoading={isLoading} />
            {!isLoading && !error && (data?.data?.length || 0) === 0 && <Card className="p-4">{t('common.noData')}</Card>}
          </>
        )}
      </div>
    </PageContainer>
  );
}
