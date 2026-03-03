'use client';

import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { useAuth, useWallet, useWalletLedger } from '@/hooks';
import { useI18n } from '@/hooks/useI18n';
import { GuestGateCard } from '@/components/auth/GuestGateCard';

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
}

export default function WalletPage() {
  const { t, errorMessage } = useI18n();
  const { isAuthenticated } = useAuth();
  const { data: wallet, isLoading: walletLoading, error: walletError } = useWallet();
  const { data: ledger, isLoading: ledgerLoading, error: ledgerError } = useWalletLedger(100, 0);

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{t('pages.wallet.title')}</h1>

        {!isAuthenticated ? (
          <GuestGateCard />
        ) : (
          <>
            <Card className="p-5 space-y-2 border-white/10 bg-white/[0.04]">
              {walletLoading && <p>{t('pages.wallet.loadingWallet')}</p>}
              {walletError && <p className="text-destructive">{errorMessage(walletError)}</p>}
              {wallet && (
                <>
                  <div className="text-3xl font-black text-emerald-300">{t('pages.wallet.balance', { value: formatPrice(wallet.balance) })}</div>
                  <div className="text-sm text-white/65">{t('pages.wallet.reserved', { value: formatPrice(wallet.reservedBalance ?? (wallet as any).reserved_balance) })}</div>
                </>
              )}
            </Card>

            <Card className="p-4 space-y-3 border-white/10 bg-white/[0.03]">
              <h2 className="font-semibold">{t('pages.wallet.ledgerTitle')}</h2>
              {ledgerLoading && <p>{t('pages.wallet.loadingLedger')}</p>}
              {ledgerError && <p className="text-destructive">{errorMessage(ledgerError)}</p>}

              {(ledger || []).map((entry: any) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm flex items-center justify-between gap-2">
                  <div>
                    <div>{entry.entryType || entry.entry_type}</div>
                    <div className="text-white/55">{entry.direction} · {formatPrice(entry.amount)}</div>
                  </div>
                  <Badge variant="outline">{entry.referenceType || entry.reference_type || t('pages.wallet.unknownReference')}</Badge>
                </div>
              ))}

              {(ledger || []).length === 0 && !ledgerLoading && !ledgerError && (
                <p className="text-sm text-white/55">{t('pages.wallet.emptyLedger')}</p>
              )}
            </Card>
          </>
        )}
      </div>
    </PageContainer>
  );
}
