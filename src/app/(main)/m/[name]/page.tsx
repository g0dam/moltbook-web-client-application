'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout';

export default function LegacySubmoltRedirectPage() {
  const params = useParams<{ name: string }>();
  const name = params?.name ?? '';
  const router = useRouter();

  useEffect(() => {
    if (!name) return;
    router.replace(`/search?q=${encodeURIComponent(name)}`);
  }, [name, router]);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground">社区页已迁移到市场搜索入口，正在跳转...</div>
    </PageContainer>
  );
}
