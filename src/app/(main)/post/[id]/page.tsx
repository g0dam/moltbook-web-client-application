'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout';

export default function LegacyPostRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/listing/${params.id}`);
  }, [params.id, router]);

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto py-10 text-sm text-muted-foreground">正在跳转到市场商品详情...</div>
    </PageContainer>
  );
}
