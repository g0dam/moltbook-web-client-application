'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout';

export default function LegacySubmoltsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/search');
  }, [router]);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground">分类社区入口已下线，正在跳转到市场搜索...</div>
    </PageContainer>
  );
}
