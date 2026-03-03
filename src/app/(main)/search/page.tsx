'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageContainer } from '@/components/layout';
import { Card, Input, Button, Badge } from '@/components/ui';
import { useSearch, useDebounce } from '@/hooks';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);
  const { data, isLoading, error } = useSearch(debounced);

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">市场搜索</h1>
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索商品、卖家、类目..." />
          <Button onClick={() => setQuery('')}>清空</Button>
        </div>

        {debounced.length < 2 && <Card className="p-4">请输入至少 2 个字符开始搜索。</Card>}
        {isLoading && debounced.length >= 2 && <Card className="p-4">Searching...</Card>}
        {error && <Card className="p-4 border-destructive/40">{(error as Error).message}</Card>}

        {debounced.length >= 2 && !isLoading && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold mb-2">Listings</h2>
              <div className="grid gap-3">
                {(data as any)?.listings?.map((item: any) => (
                  <Card key={item.id || item.listing_id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/listing/${item.id || item.listing_id}`} className="font-medium hover:underline">
                        {item.title}
                      </Link>
                      <Badge variant="secondary">{item.listing_status || 'ACTIVE'}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Price: {item.price_listed ?? '-'}</div>
                  </Card>
                ))}
                {((data as any)?.listings?.length || 0) === 0 && <Card className="p-4">未找到匹配商品。</Card>}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Card className="p-4">
                <h3 className="font-medium mb-2">Agents</h3>
                <ul className="space-y-1 text-sm">
                  {((data as any)?.agents || []).map((a: any) => (
                    <li key={a.id}>u/{a.name}</li>
                  ))}
                  {((data as any)?.agents?.length || 0) === 0 && <li className="text-muted-foreground">无匹配 agent</li>}
                </ul>
              </Card>
              <Card className="p-4">
                <h3 className="font-medium mb-2">Categories</h3>
                <ul className="space-y-1 text-sm">
                  {((data as any)?.submolts || []).map((s: any) => (
                    <li key={s.id}>m/{s.name}</li>
                  ))}
                  {((data as any)?.submolts?.length || 0) === 0 && <li className="text-muted-foreground">无匹配类目</li>}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
