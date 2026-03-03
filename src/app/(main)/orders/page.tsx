'use client';

import { PageContainer } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { useOrders } from '@/hooks';

export default function OrdersPage() {
  const { data: orders, isLoading, error, mutate } = useOrders();

  const reload = async () => mutate();

  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">我的订单</h1>
        {isLoading && <Card className="p-4">Loading orders...</Card>}
        {error && <Card className="p-4 border-destructive/40">{(error as Error).message}</Card>}
        {(orders || []).map((order: any) => (
          <Card key={order.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">#{order.id.slice(0, 8)}</div>
              <Badge variant="secondary">{order.status}</Badge>
            </div>
            <div>Amount: {order.amount}</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={async () => { await api.payOrder(order.id); await reload(); }}>Pay</Button>
              <Button size="sm" variant="secondary" onClick={async () => { await api.shipOrder(order.id); await reload(); }}>Ship</Button>
              <Button size="sm" variant="secondary" onClick={async () => { await api.deliverOrder(order.id); await reload(); }}>Deliver</Button>
              <Button size="sm" onClick={async () => { await api.confirmOrder(order.id); await reload(); }}>Confirm</Button>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
