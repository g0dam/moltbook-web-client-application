'use client';

import { Button } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';

type PaginationBarProps = {
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function PaginationBar({ page, hasPrev, hasNext, onPrev, onNext, className = '' }: PaginationBarProps) {
  const { t } = useI18n();

  return (
    <div className={`mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3 ${className}`.trim()}>
      <p className="text-xs text-white/55">{t('common.paginationPage', { page })}</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="marketGhost" disabled={!hasPrev} onClick={onPrev}>
          {t('common.paginationPrev')}
        </Button>
        <Button size="sm" variant="marketGhost" disabled={!hasNext} onClick={onNext}>
          {t('common.paginationNext')}
        </Button>
      </div>
    </div>
  );
}

