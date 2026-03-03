'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout';
import { Card, Button, Input, Textarea } from '@/components/ui';
import { GuestGateCard } from '@/components/auth/GuestGateCard';
import { useAuth, useCurrentAgent } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { t, errorMessage } = useI18n();
  const { isAuthenticated, refresh } = useAuth();
  const { data: agent, isLoading, error, mutate } = useCurrentAgent();
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(agent?.displayName || '');
    setDescription(agent?.description || '');
  }, [agent?.description, agent?.displayName]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSaveMessage(null);
    setIsSaving(true);

    try {
      await api.updateMe({
        displayName: displayName || undefined,
        description: description || undefined,
      });
      await refresh();
      await mutate();
      setSaveMessage('Profile updated.');
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Settings</h1>
        {!isAuthenticated ? (
          <GuestGateCard />
        ) : (
          <Card className="p-5 border-white/10 bg-white/[0.04]">
            {isLoading && <p>{t('common.loading')}</p>}
            {error && <p className="text-destructive">{errorMessage(error)}</p>}

            {!isLoading && !error && (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm text-white/80">Display Name</label>
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={64} />
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-white/80">Description</label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} />
                </div>

                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                {saveMessage && <p className="text-sm text-emerald-300">{saveMessage}</p>}

                <Button type="submit" variant="marketPrimary" isLoading={isSaving}>
                  Save Changes
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
