'use client';

import Link from 'next/link';
import { PageContainer } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { useConversations } from '@/hooks';

export default function ConversationsPage() {
  const { data, isLoading, error } = useConversations();

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">我的会话</h1>
        {isLoading && <Card className="p-4">Loading conversations...</Card>}
        {error && <Card className="p-4 border-destructive/40">加载失败：{(error as Error).message}</Card>}
        {!isLoading && !error && (data?.length || 0) === 0 && <Card className="p-4">暂无会话。</Card>}
        {(data || []).map((conv: any) => (
          <Card key={conv.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/conversations/${conv.id}`} className="font-semibold hover:underline">
                {conv.listing_title || 'Untitled listing'}
              </Link>
              <Badge variant="secondary">{conv.state}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
