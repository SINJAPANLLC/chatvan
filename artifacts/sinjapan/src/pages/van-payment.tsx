import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, CreditCard, Building2, CheckCircle2, ShieldCheck, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

declare const Square: any;

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${BASE_URL}api${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token')}`, 'Content-Type': 'application/json' });

const BANK_INFO = { bank: '三菱UFJ銀行', branch: '渋谷支店', type: '普通', number: '1234567', name: 'シンジャパン（カ' };

async function getPaymentConfig() {
  const r = await fetch(apiUrl('/config/payment'), { headers: authHeader() });
  return r.ok ? r.json() : null;
}

export default function VanPayment() {
  const [, params] = useRoute('/van/:id/payment');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [method, setMethod] = useState<'transfer' | 'card'>('card');
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);
  const cardRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });
  const contract = (application as any)?.contract as any;

  // Square SDK 初期化
  useEffect(() => {
    if (method !== 'card' || !contract) return;
    let card: any = null;
    let destroyed = false;

    const initSquare = async () => {
      try {
        const config = await getPaymentConfig();
        if (!config?.squareApplicationId) { setSquareError('Square設定が不足しています'); return; }
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
        if (!destroyed) setSquareError(`カードフォームの初期化に失敗しました: ${e.message}`);
      }
    };

    if (typeof Square !== 'undefined') {
      initSquare();
    } else {
      const script = document.createElement('script');
      script.src = 'https://web.squarecdn.com/v1/square.js';
      script.onload = initSquare;
      script.onerror = () => { if (!destroyed) setSquareError('Square.js の読み込みに失敗しました'); };
      document.head.appendChild(script);
    }
    return () => { destroyed = true; card?.destroy?.(); cardRef.current = null; setCardReady(false); };
  }, [method, contract]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center min-h-[50vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (!contract) {
    return <div className="flex-1 flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">契約情報が見つかりません</p></div>;
  }

  const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
  const tax   = Math.floor(monthlyBase * 0.1);
  const total = monthlyBase + tax;
  const fmt   = (n: number) => `¥${Math.floor(n).toLocaleString()}`;

  const handleCardPay = async () => {
    if (!cardRef.current) return;
    setSubmitting(true); setSquareError(null);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'カードのトークン化に失敗しました');
      const r = await fetch(apiUrl(`/van/contracts/${contract.id}/square-charge`), {
        method: 'POST', headers: authHeader(),
        body: JSON.stringify({ sourceId: result.token }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? '決済処理に失敗しました');
      setDone(true);
    } catch (e: any) {
      setSquareError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransferConfirm = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/van/contracts/${contract.id}/pay`), {
        method: 'POST', headers: authHeader(),
        body: JSON.stringify({ method: 'transfer' }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? '処理に失敗しました'); }
      setDone(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label}をコピーしました` }));
  };

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-foreground flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-background" />
        </div>
        <h1 className="text-2xl font-bold mb-2">お支払い完了</h1>
        <p className="text-muted-foreground mb-8">
          {method === 'transfer' ? '振込確認後、ご利用開始のご連絡をいたします。' : 'カード決済が完了しました。担当者からご連絡いたします。'}
        </p>
        <button onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
          進捗を確認する
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
      <button onClick={() => setLocation(`/van/${applicationId}/status`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">お支払い</h1>
        <p className="text-sm text-muted-foreground">最初の月額料金をお支払いください</p>
      </div>

      {/* 請求内訳 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">ご請求内訳</div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">月額料金</span><span>{fmt(monthlyBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">消費税（10%）</span><span>{fmt(tax)}</span></div>
          <div className="flex justify-between pt-3 border-t border-border font-bold text-base">
            <span>合計</span><span className="text-xl">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* 支払い方法選択 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">お支払い方法</div>
        <div className="p-4 space-y-3">
          <div onClick={() => setMethod('card')}
            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'card' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}>
            <CreditCard className={`h-5 w-5 mr-3 shrink-0 ${method === 'card' ? '' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <span className="font-medium text-sm">クレジットカード</span>
              <p className="text-xs text-muted-foreground mt-0.5">Visa / Mastercard / JCB</p>
            </div>
            {method === 'card' && <CheckCircle2 className="h-5 w-5 ml-2 shrink-0" />}
          </div>
          <div onClick={() => setMethod('transfer')}
            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'transfer' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}>
            <Building2 className={`h-5 w-5 mr-3 shrink-0 ${method === 'transfer' ? '' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <span className="font-medium text-sm">銀行振込</span>
              <p className="text-xs text-muted-foreground mt-0.5">振込確認後に利用開始（1〜2営業日）</p>
            </div>
            {method === 'transfer' && <CheckCircle2 className="h-5 w-5 ml-2 shrink-0" />}
          </div>
        </div>
      </div>

      {/* Square カードフォーム */}
      {method === 'card' && (
        <div className="rounded-xl border border-border overflow-hidden mb-6">
          <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />カード情報
          </div>
          <div className="p-5">
            <div ref={cardContainerRef} id="van-card-container" className="min-h-[100px]" />
            {!cardReady && !squareError && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />カードフォームを読み込み中…
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />カード情報はSquareが直接処理します。当社サーバーには保存されません。
            </p>
          </div>
        </div>
      )}

      {/* 銀行振込情報 */}
      {method === 'transfer' && (
        <div className="rounded-xl border border-border overflow-hidden mb-6">
          <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">振込先口座</div>
          <div className="p-5 space-y-3 text-sm">
            {[
              { label: '金融機関', value: BANK_INFO.bank },
              { label: '支店',     value: BANK_INFO.branch },
              { label: '口座種別', value: BANK_INFO.type },
              { label: '口座番号', value: BANK_INFO.number, copy: true },
              { label: '口座名義', value: BANK_INFO.name, copy: true },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-muted-foreground">{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.value}</span>
                  {row.copy && (
                    <button onClick={() => copy(row.value, row.label)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              振込人名義は「お名前（申込番号 #{String(applicationId).padStart(6, '0')}）」でお振込みください。
            </p>
          </div>
        </div>
      )}

      {squareError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{squareError}</div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 justify-center">
        <ShieldCheck className="h-3.5 w-3.5" />お支払い情報は安全に管理されます
      </div>

      {method === 'card' ? (
        <button onClick={handleCardPay} disabled={submitting || !cardReady}
          className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : `${fmt(total)} をカード払いで確定する`}
        </button>
      ) : (
        <button onClick={handleTransferConfirm} disabled={submitting}
          className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : `振込手続きを完了する（${fmt(total)}）`}
        </button>
      )}
    </div>
  );
}
