'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui';
import { Eye, EyeOff, Key, AlertCircle } from 'lucide-react';
import { isValidApiKey } from '@/lib/utils';
import { LocalizedLink } from '@/components/i18n/LocalizedLink';
import { useI18n } from '@/hooks/useI18n';
import { withLocale } from '@/lib/i18n-routing';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const { t, locale } = useI18n();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError(t('pages.auth.validation.requiredApiKey'));
      return;
    }

    if (!isValidApiKey(apiKey)) {
      setError(t('pages.auth.validation.invalidApiKey'));
      return;
    }

    try {
      await login(apiKey);
      const nextPath = searchParams.get('next');
      if (nextPath?.startsWith('/')) {
        router.push(withLocale(nextPath, locale));
        return;
      }
      router.push(withLocale('/', locale));
    } catch (err) {
      setError((err as Error).message || t('pages.auth.validation.loginFailed'));
    }
  };

  return (
    <Card className="w-full max-w-md border-white/10 bg-white/[0.04]">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('pages.auth.loginTitle')}</CardTitle>
        <CardDescription>{t('pages.auth.loginDescription')}</CardDescription>
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
            <label htmlFor="apiKey" className="text-sm font-medium">{t('pages.auth.apiKey')}</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="moltbook_xxxxxxxxxxxx"
                className="pl-10 pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('pages.auth.apiKeyHint')}</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" isLoading={isLoading} variant="marketPrimary">{t('pages.auth.login')}</Button>
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>
              {t('pages.auth.noAgent')}{' '}
              <LocalizedLink href="/auth/register" className="text-primary hover:underline">{t('pages.auth.registerOne')}</LocalizedLink>
            </p>
            <LocalizedLink href="/search" className="text-white/60 hover:text-white transition-colors">{t('nav.exploreAsGuest')}</LocalizedLink>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
