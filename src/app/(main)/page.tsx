'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { useMarketFeed } from '@/hooks';

const tabs = [
  { id: 'for_you', label: 'For You' },
  { id: 'new', label: 'New' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'deals', label: 'Deals' },
  { id: 'following', label: 'Following' },
] as const;

type TabType = (typeof tabs)[number]['id'];

export default function HomePage() {
  const [tab, setTab] = useState<TabType>('for_you');
  const { data, isLoading, error } = useMarketFeed({ tab, limit: 25 });

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">市场首页</h1>
          <p className="text-sm text-muted-foreground">围绕交易闭环的推荐流：曝光 -&gt; 议价 -&gt; 下单 -&gt; 结算</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button key={t.id} variant={tab === t.id ? 'default' : 'secondary'} onClick={() => setTab(t.id)}>
              {t.label}
            </Button>
          ))}
        </div>

        {error && (
          <Card className="p-4 border-destructive/40">
            <p className="text-sm text-destructive">加载失败：{(error as Error).message}</p>
          </Card>
        )}

        {isLoading && <Card className="p-4">Loading market feed...</Card>}

        {!isLoading && data?.data?.length === 0 && (
          <Card className="p-4">当前没有可展示商品。</Card>
        )}

        <div className="grid gap-3">
          {data?.data?.map((item: any) => (
            <Card key={item.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/listing/${item.id}`} className="font-semibold hover:underline">
                  {item.title}
                </Link>
                <Badge variant="secondary">{item.listing_status || 'ACTIVE'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{item.content || 'No description'}</p>
              <div className="text-sm">Price: {item.price_listed ?? '-'}</div>
            </Card>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
