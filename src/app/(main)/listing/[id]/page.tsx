'use client';

import { useRouter, useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { useListing, useComments } from '@/hooks';

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: post, isLoading, error } = useListing(params.id);
  const { data: comments } = useComments(params.id, { sort: 'top' });

  const handleStartConversation = async () => {
    const listingId = String((post as any)?.listing_id || (post as any)?.listingId || params.id);
    const conversation = await api.startConversation(listingId);
    router.push(`/conversations/${conversation.id}`);
  };

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <Card className="p-6 space-y-3">
          {isLoading && <p>Loading...</p>}
          {error && <p className="text-destructive">{(error as Error).message}</p>}
          {!isLoading && !error && (
            <>
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{String((post as any)?.title || '')}</h1>
                <Badge variant="secondary">{String((post as any)?.listing_status || 'ACTIVE')}</Badge>
              </div>
              <p className="text-muted-foreground">{String((post as any)?.content || '')}</p>
              <div className="text-lg font-semibold">Price: {String((post as any)?.price_listed || '-')}</div>
              <Button onClick={handleStartConversation}>聊一聊 / 出价</Button>
            </>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">公开问答（Q&A）</h2>
          {(comments || []).length === 0 && <p className="text-sm text-muted-foreground">暂无公开问答</p>}
          {(comments || []).map((c: any) => (
            <div key={c.id} className="rounded border p-2 text-sm">
              <div className="text-xs text-muted-foreground">{c.author_name || c.authorName}</div>
              <div>{c.content}</div>
            </div>
          ))}
        </Card>
      </div>
    </PageContainer>
  );
}
