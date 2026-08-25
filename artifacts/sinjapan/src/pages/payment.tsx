import React, { useEffect, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetShipment, getGetShipmentQueryKey } from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Loader2, CreditCard, Receipt, CheckCircle, ShieldCheck } from 'lucide-react';

declare const Square: any;

async function getPaymentConfig() {
  return customFetch<{ squareApplicationId: string; squareLocationId: string; squareEnvironment: string }>('/api/config/payment');
}

async function squareCharge(shipmentId: number, sourceId: string) {
  return customFetch<{ paymentId: string; status: string }>('/api/square/charge', {
    method: 'POST',
    body: JSON.stringify({ shipmentId, sourceId }),
  });
}

async function invoiceCheckout(shipmentId: number) {
  return customFetch<any>('/api/payments', {
    method: 'POST',
    body: JSON.stringify({ shipmentId, amount: 0, paymentMethod: 'invoice' }),
  });
}

async function getCorporateStatus() {
  try {
    return await customFetch<any>('/api/corporate/status');
  } catch {
    return null;
  }
}

export default function Payment() {
  const [, params] = useRoute('/payment/:id');
  const shipmentId = Number(params?.id);
  const [, setLocation] = useLocation();

  const [method, setMethod] = useState<'card' | 'invoice'>('card');
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [corporate, setCorporate] = useState<any>(null);
  const [loadingCorporate, setLoadingCorporate] = useState(true);
  const [paid, setPaid] = useState(false);
  const cardRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const { data: shipment, isLoading } = useGetShipment(shipmentId, {
    query: { enabled: !!shipmentId, queryKey: getGetShipmentQueryKey(shipmentId) },
  });

  useEffect(() => {
    getCorporateStatus().then(s => { setCorporate(s); setLoadingCorporate(false); });
  }, []);

  // Square Web Payments SDK 初期化
  useEffect(() => {
    if (method !== 'card' || !shipment) return;
    let card: any = null;
    let destroyed = false;

    const initSquare = async () => {
      try {
        const config = await getPaymentConfig();
        if (!config.squareApplicationId) { setError('Square設定が不足しています'); return; }
        const payments = Square.payments(config.squareApplicationId, config.squareLocationId);
        card = await payments.card({
          style: {
            input: { fontSize: '14px' },
            '.input-container': { borderColor: '#e2e8f0', borderRadius: '8px' },
            '.input-container.is-focus': { borderColor: '#1a202c' },
          },
        });
        if (destroyed) return;
        if (cardContainerRef.current) await card.attach(cardContainerRef.current);
        cardRef.current = card;
        setCardReady(true);
      } catch (e: any) {
        if (!destroyed) setError(`Square 初期化エラー: ${e.message}`);
      }
    };

    if (typeof Square !== 'undefined') {
      initSquare();
    } else {
      const existing = document.querySelector('script[src*="square"]');
      if (existing) {
        existing.addEventListener('load', initSquare);
      } else {
        const script = document.createElement('script');
        script.src = 'https://web.squarecdn.com/v1/square.js';
        script.onload = initSquare;
        script.onerror = () => { if (!destroyed) setError('Square.js の読み込みに失敗しました'); };
        document.head.appendChild(script);
      }
    }

    return () => {
      destroyed = true;
      card?.destroy?.();
      cardRef.current = null;
      setCardReady(false);
    };
  }, [method, shipment]);

  if (isLoading || loadingCorporate) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!shipment) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">案件が見つかりません</div>;
  }

  // 決済完了画面
  if (paid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mb-6">
          <CheckCircle className="h-8 w-8 text-background" />
        </div>
        <h1 className="text-2xl font-bold mb-2">決済が完了しました</h1>
          <p className="text-muted-foreground mb-8">決済が完了しました。受け取り案内をお待ちください。</p>
        <button
          onClick={() => setLocation(`/shipment/${shipmentId}`)}
          className="px-6 py-3 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
        >
          配送状況を確認する
        </button>
      </div>
    );
  }

  const basePrice = Number(shipment.customerPrice) || 0;
  const tax = Math.round(basePrice * 0.1);
  const total = basePrice + tax;
  const fmt = (n: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);

  const isApprovedCorporate = corporate?.creditStatus === 'approved';
  const canUseInvoice = isApprovedCorporate && (corporate?.creditAvailable ?? 0) >= total;

  const handleCardPay = async () => {
    if (!cardRef.current) return;
    setSubmitting(true); setError(null);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'カードのトークン化に失敗しました');
      await squareCharge(shipmentId, result.token);
      setPaid(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvoicePay = async () => {
    setSubmitting(true); setError(null);
    try {
      await invoiceCheckout(shipmentId);
      setPaid(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
      <div className="w-full max-w-xl space-y-6 animate-in fade-in duration-500">

        <div>
          <h1 className="text-2xl font-bold tracking-tight">お支払い</h1>
          <p className="text-muted-foreground mt-1 text-sm">受け取り前に行う決済手続きです</p>
        </div>

        {/* 請求内訳 */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold">ご請求内訳</div>
          <div className="p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">配送費（案件 #{String(shipmentId).padStart(6, '0')}）</span>
              <span>{fmt(basePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">消費税（10%）</span>
              <span>{fmt(tax)}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-border font-bold text-base">
              <span>合計</span>
              <span className="text-xl">{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* 支払い方法選択 */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold">お支払い方法</div>
          <div className="p-4 space-y-3">
            <div
              onClick={() => setMethod('card')}
              className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'card' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}
            >
              <CreditCard className={`h-5 w-5 mr-3 ${method === 'card' ? '' : 'text-muted-foreground'}`} />
              <span className="font-medium">クレジットカード</span>
              {method === 'card' && <CheckCircle className="h-5 w-5 ml-auto" />}
            </div>

            <div
              onClick={() => isApprovedCorporate && setMethod('invoice')}
              className={`flex items-center p-4 rounded-lg border transition-all ${
                isApprovedCorporate
                  ? `cursor-pointer ${method === 'invoice' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`
                  : 'border-border/40 opacity-40 cursor-not-allowed'
              }`}
            >
              <Receipt className={`h-5 w-5 mr-3 ${method === 'invoice' ? '' : 'text-muted-foreground'}`} />
              <div className="flex-1">
                <span className="font-medium">請求書払い</span>
                {isApprovedCorporate ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    与信残高: {fmt(corporate.creditAvailable)} / {fmt(corporate.creditLimit)}
                    {!canUseInvoice && <span className="text-red-500 ml-2">（残高不足）</span>}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    法人の審査が必要です →{' '}
                    <a href="/corporate-apply" className="underline text-foreground">申請する</a>
                  </p>
                )}
              </div>
              {method === 'invoice' && <CheckCircle className="h-5 w-5 ml-2" />}
            </div>
          </div>
        </div>

        {/* カードフォーム */}
        {method === 'card' && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />カード情報
            </div>
            <div className="p-5">
              <div ref={cardContainerRef} id="card-container" className="min-h-[100px]" />
              {!cardReady && !error && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />カードフォームを読み込み中…
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                カード情報はSquareが直接処理します。当社サーバーには保存されません。
              </p>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        {method === 'card' ? (
          <button
            onClick={handleCardPay}
            disabled={submitting || !cardReady}
            className="w-full py-3 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : `${fmt(total)} を支払う`}
          </button>
        ) : (
          <button
            onClick={handleInvoicePay}
            disabled={submitting || !canUseInvoice}
            className="w-full py-3 rounded-full bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : '請求書払いで確定する'}
          </button>
        )}
      </div>
    </div>
  );
}
