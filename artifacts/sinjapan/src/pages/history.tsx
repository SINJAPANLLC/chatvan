import React, { useState } from 'react';
import { Link } from 'wouter';
import { useListShipments } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Package, ChevronRight, Loader2, CreditCard, X } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const BLACK = 'bg-foreground text-background border-foreground';
const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  '顧客承認':      { label: '顧客承認',      cls: BLACK },
  '受付完了':      { label: '受付完了',      cls: BLACK },
  '手配中':        { label: '手配中',        cls: BLACK },
  '配車確定':      { label: '配車確定',      cls: BLACK },
  '集荷完了':      { label: '集荷完了',      cls: BLACK },
  '配送中':        { label: '配送中',        cls: BLACK },
  '納品完了':      { label: '決済待ち',      cls: BLACK },
  '請求完了':      { label: '支払い完了',    cls: 'bg-green-100 text-green-700 border-green-200' },
  'キャンセル':    { label: 'キャンセル',    cls: 'bg-red-100 text-red-600 border-red-200' },
  'キャンセル申請中': { label: 'キャンセル申請中', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {status === '納品完了' && <CreditCard className="h-3 w-3" />}
      {s.label}
    </span>
  );
}

const IMMEDIATE_CANCEL = ['受付中', 'ヒアリング中', '見積提示'];
const CAN_REQUEST_CANCEL = ['顧客承認', '受付完了', '手配中', '配車確定', '集荷完了', '配送中', '納品完了'];

function useCancelAction(onDone: () => void) {
  const { toast } = useToast();
  const [acting, setActing] = useState<number | null>(null);
  const request = async (id: number, status: string) => {
    setActing(id);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/shipments/${id}/cancel-request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const label = IMMEDIATE_CANCEL.includes(status) ? 'キャンセルしました' : 'キャンセル申請を送りました';
      toast({ title: label });
      onDone();
    } catch {
      toast({ variant: 'destructive', title: '操作に失敗しました' });
    } finally { setActing(null); }
  };
  return { acting, request };
}

export default function History() {
  const { data: shipments, isLoading } = useListShipments({});
  const queryClient = useQueryClient();
  const reload = () => queryClient.invalidateQueries();
  const { acting, request } = useCancelAction(reload);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">利用履歴</h1>
      </div>

      {(!shipments?.items || shipments.items.length === 0) ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl bg-muted/20">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">履歴がありません</h3>
          <p className="text-muted-foreground mt-2 mb-6">まだ配送依頼がありません。</p>
          <Link href="/">
            <Button>新規依頼を作成</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.items.map((shipment) => (
            <Card key={shipment.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row md:items-center">
                  <div className="p-4 md:p-6 flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1">
                      <p className="text-xs text-muted-foreground mb-1">
                        {format(new Date(shipment.createdAt), 'yyyy年MM月dd日', { locale: ja })}
                      </p>
                      <StatusBadge status={shipment.status} />
                    </div>
                    
                    <div className="md:col-span-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-8">集荷</span>
                        <span className="text-sm truncate" title={shipment.pickupAddress || ''}>{shipment.pickupAddress || '未定'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-8">納品</span>
                        <span className="text-sm truncate" title={shipment.deliveryAddress || ''}>{shipment.deliveryAddress || '未定'}</span>
                      </div>
                    </div>

                    <div className="md:col-span-1 text-right flex flex-col justify-center">
                      <p className="font-bold text-lg">
                        {shipment.customerPrice ? new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(shipment.customerPrice) : '見積中'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-muted/30 border-t md:border-t-0 md:border-l border-border p-4 flex gap-2 md:flex-col md:w-36 justify-center shrink-0">
                    {shipment.status === '納品完了' && (
                      <Link href={`/payment/${shipment.id}`} className="w-full">
                        <Button className="w-full h-9 px-3 text-xs">
                          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                          決済へ進む
                        </Button>
                      </Link>
                    )}
                    <Link href={`/shipment/${shipment.id}`} className="w-full">
                      <Button variant="ghost" className="w-full justify-between h-9 px-3">
                        詳細
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </Link>
                    {(IMMEDIATE_CANCEL.includes(shipment.status) || CAN_REQUEST_CANCEL.includes(shipment.status)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={acting === shipment.id}
                        onClick={() => request(shipment.id, shipment.status)}
                        className="w-full h-9 px-3 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        {acting === shipment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 mr-1" />}
                        {IMMEDIATE_CANCEL.includes(shipment.status) ? 'キャンセル' : 'キャンセル申請'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
