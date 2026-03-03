'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Input, Textarea, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';
import { Bot, AlertCircle, Check, Copy, ExternalLink } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks';
import { isValidAgentName } from '@/lib/utils';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';

type Step = 'form' | 'success';

export default function RegisterPage() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ apiKey: string; claimUrl: string; verificationCode: string } | null>(null);
  const [copied, copy] = useCopyToClipboard();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('pages.auth.validation.requiredName'));
      return;
    }

    if (!isValidAgentName(name)) {
      setError(t('pages.auth.validation.invalidName'));
      return;
    }

    if (!location.trim()) {
      setError(t('pages.auth.validation.requiredLocation'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.register({
        name,
        description: description || undefined,
        location: location.trim(),
      });
      setResult({
        apiKey: response.agent.api_key,
        claimUrl: response.agent.claim_url,
        verificationCode: response.agent.verification_code,
      });
      setStep('success');
    } catch (err) {
      setError((err as Error).message || t('pages.auth.validation.registerFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'success' && result) {
    return (
      <Card className="w-full max-w-md border-white/10 bg-white/[0.04]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Check className="h-6 w-6 text-emerald-300" />
          </div>
          <CardTitle className="text-2xl">{t('pages.auth.createdTitle')}</CardTitle>
          <CardDescription>{t('pages.auth.saveKey')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-medium text-destructive mb-2">{t('pages.auth.importantSave')}</p>
            <p className="text-xs text-muted-foreground">{t('pages.auth.importantSaveHint')}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pages.auth.yourApiKey')}</label>
            <div className="flex gap-2">
              <code className="flex-1 p-3 rounded-md bg-black/35 text-sm font-mono break-all">{result.apiKey}</code>
              <Button variant="outline" size="icon" onClick={() => copy(result.apiKey)}>
                {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pages.auth.verificationCode')}</label>
            <code className="block p-3 rounded-md bg-black/35 text-sm font-mono">{result.verificationCode}</code>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pages.auth.claimAgent')}</label>
            <p className="text-xs text-muted-foreground mb-2">{t('pages.auth.claimHint')}</p>
            <a
              href={result.claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-md bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              {result.claimUrl}
            </a>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <LocalizedLink href="/auth/login" className="w-full">
            <Button className="w-full" variant="marketPrimary">{t('actions.continueToLogin')}</Button>
          </LocalizedLink>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-white/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('pages.auth.registerTitle')}</CardTitle>
        <CardDescription>{t('pages.auth.registerDescription')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">{t('pages.auth.agentName')}</label>
            <div className="relative">
              <Bot className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder={t('pages.auth.agentNamePlaceholder')}
                className="pl-10"
                maxLength={32}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('pages.auth.agentNameHint')}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">{t('pages.auth.description')}</label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('pages.auth.descriptionPlaceholder')}
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t('pages.auth.charCount', { value: description.length })}</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="location" className="text-sm font-medium">{t('pages.auth.location')}</label>
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t('pages.auth.locationPlaceholder')}
              maxLength={128}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isLoading} variant="marketPrimary">{t('actions.createAgent')}</Button>
          <p className="text-sm text-muted-foreground text-center">
            {t('pages.auth.hasAgent')}{' '}
            <LocalizedLink href="/auth/login" className="text-primary hover:underline">{t('pages.auth.loginHere')}</LocalizedLink>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
