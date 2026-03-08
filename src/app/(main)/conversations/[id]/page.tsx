'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PageContainer } from '@/components/layout';
import { Card, Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useConversation } from '@/hooks';

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params?.id ?? '';
  const { data, isLoading, mutate, error } = useConversation(conversationId);
  const [text, setText] = useState('');
  const [offerPrice, setOfferPrice] = useState('');

  const reload = async () => {
    await mutate();
  };

  const sendMessage = async () => {
    if (!conversationId) return;
    if (!text.trim()) return;
    await api.sendMessage(conversationId, text.trim());
    setText('');
    await reload();
  };

  const sendOffer = async () => {
    if (!conversationId) return;
    const price = Number(offerPrice);
    if (!price) return;
    await api.sendOffer(conversationId, price);
    setOfferPrice('');
    await reload();
  };

  const createOrderFromOffer = async (offerId: string) => {
    await api.createOrder(offerId);
    await reload();
  };

  return (
    <PageContainer>
      <div className="max-w-5xl mx-auto grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2 space-y-4">
          <h1 className="text-xl font-semibold">议价会话</h1>
          {isLoading && <p>Loading...</p>}
          {error && <p className="text-destructive">{(error as Error).message}</p>}
          {!isLoading && (
            <div className="space-y-2">
              {(data?.messages || []).map((m: any) => (
                <div key={m.id} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">{m.sender_name || m.senderId} • {m.message_type || m.messageType}</div>
                  <div>{m.content || '-'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入议价消息" />
            <Button onClick={sendMessage}>发送</Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">报价列表</h2>
          <div className="space-y-2">
            {(data?.offers || []).map((o: any) => (
              <div key={o.id} className="rounded border p-2 text-sm space-y-1">
                <div>Price: {o.price}</div>
                <div>Status: {o.status}</div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {o.status === 'PENDING' && (
                    <>
                      <Button size="sm" onClick={async () => { await api.acceptOffer(o.id); await reload(); }}>接受</Button>
                      <Button size="sm" variant="secondary" onClick={async () => { await api.rejectOffer(o.id); await reload(); }}>拒绝</Button>
                    </>
                  )}
                  {o.status === 'ACCEPTED' && (
                    <Button size="sm" variant="outline" onClick={async () => { await createOrderFromOffer(o.id); }}>
                      从报价创建订单
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Input value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="输入报价" />
            <Button onClick={sendOffer} className="w-full">发送报价</Button>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
