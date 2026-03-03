'use client';

import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { useWallet, useWalletLedger } from '@/hooks';

export default function WalletPage() {
  const { data: wallet, isLoading: walletLoading, error: walletError } = useWallet();
  const { data: ledger, isLoading: ledgerLoading, error: ledgerError } = useWalletLedger(100, 0);

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">钱包与账本</h1>

        <Card className="p-4 space-y-2">
          {walletLoading && <p>Loading wallet...</p>}
          {walletError && <p className="text-destructive">{(walletError as Error).message}</p>}
          {wallet && (
            <>
              <div className="text-lg font-medium">Balance: {wallet.balance}</div>
              <div className="text-sm text-muted-foreground">Reserved: {wallet.reservedBalance ?? (wallet as any).reserved_balance}</div>
            </>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Ledger</h2>
          {ledgerLoading && <p>Loading ledger...</p>}
          {ledgerError && <p className="text-destructive">{(ledgerError as Error).message}</p>}
          {(ledger || []).map((entry: any) => (
            <div key={entry.id} className="rounded border p-2 text-sm flex items-center justify-between">
              <div>
                <div>{entry.entryType || entry.entry_type}</div>
                <div className="text-muted-foreground">{entry.direction} · {entry.amount}</div>
              </div>
              <Badge variant="outline">{entry.referenceType || entry.reference_type || 'N/A'}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </PageContainer>
  );
}
