'use client';

import { PageContainer } from '@/components/layout';
import { Card } from '@/components/ui';

export default function WantedPage() {
  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-2">Wanted</h1>
          <p className="text-muted-foreground">求购市场入口已创建。下一步可在此接入 WANTED 发布和自动匹配流。</p>
        </Card>
      </div>
    </PageContainer>
  );
}
