import React, { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, CreditCard, Building2, CheckCircle2, ShieldCheck, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${BASE_URL}api${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token')}`, 'Content-Type': 'application/json' });

// 振込先情報
const BANK_INFO = {
  bank: '三菱UFJ銀行',
  branch: '渋谷支店',
  type: '普通',
  number: '1234567',
  name: 'シンジャパン（カ',
};

export default function VanPayment() {
  const [, params] = useRoute('/van/:id/payment');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [method, setMethod] = useState<'transfer' | 'card'>('transfer');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  const contract = (application as any)?.contract as any;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">契約情報が見つかりません</p>
      </div>
    );
  }

  const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
  const tax   = Math.floor(monthlyBase * 0.1);
  const total = monthlyBase + tax;
  const fmt   = (n: number) => `¥${Math.floor(n).toLocaleString()}`;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/van/contracts/${contract.id}/pay`), {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ method }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? '決済処理に失敗しました');
      }
      setDone(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label}をコピーしました` }));
  };

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-foreground flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-background" />
        </div>
        <h1 className="text-2xl font-bold mb-2">お支払い手続き完了</h1>
        <p className="text-muted-foreground mb-2">
          {method === 'transfer'
            ? '振込確認後、ご利用開始のご連絡をいたします。'
            : 'お支払いが確認されました。ご利用を開始できます。'}
        </p>
        <p className="text-sm text-muted-foreground mb-8">担当者からお引き渡しのご連絡をお待ちください。</p>
        <button
          onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
        >
          進捗を確認する
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8">
      <button
        onClick={() => setLocation(`/van/${applicationId}/status`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
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
          <div className="flex justify-between">
            <span className="text-muted-foreground">月額料金</span>
            <span>{fmt(monthlyBase)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">消費税（10%）</span>
            <span>{fmt(tax)}</span>
          </div>
          <div className="flex justify-between pt-3 border-t border-border font-bold text-base">
            <span>合計</span>
            <span className="text-xl">{fmt(total)}</span>
          </div>
          {contract.startDate && (
            <p className="text-xs text-muted-foreground pt-1">対象期間: {contract.startDate} 〜 1ヶ月分</p>
          )}
        </div>
      </div>

      {/* 支払い方法選択 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">お支払い方法</div>
        <div className="p-4 space-y-3">
          {/* 銀行振込 */}
          <div
            onClick={() => setMethod('transfer')}
            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'transfer' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}
          >
            <Building2 className={`h-5 w-5 mr-3 flex-shrink-0 ${method === 'transfer' ? '' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <span className="font-medium text-sm">銀行振込</span>
              <p className="text-xs text-muted-foreground mt-0.5">振込確認後に利用開始となります（1〜2営業日）</p>
            </div>
            {method === 'transfer' && <CheckCircle2 className="h-5 w-5 ml-2 flex-shrink-0" />}
          </div>

          {/* クレジットカード（近日対応） */}
          <div
            onClick={() => setMethod('card')}
            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'card' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}
          >
            <CreditCard className={`h-5 w-5 mr-3 flex-shrink-0 ${method === 'card' ? '' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <span className="font-medium text-sm">クレジットカード</span>
              <p className="text-xs text-muted-foreground mt-0.5">Visa / Mastercard / JCB 対応</p>
            </div>
            {method === 'card' && <CheckCircle2 className="h-5 w-5 ml-2 flex-shrink-0" />}
          </div>
        </div>
      </div>

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
                    <button onClick={() => copyText(row.value, row.label)} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                振込人名義は「お名前（申込番号 #{String(applicationId).padStart(6, '0')}）」でお振込みください。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 justify-center">
        <ShieldCheck className="h-3.5 w-3.5" />
        お支払い情報は安全に管理されます
      </div>

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {submitting
          ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</>
          : method === 'transfer'
            ? `振込手続きを完了する（${fmt(total)}）`
            : `${fmt(total)} をカード払いで確定する`}
      </button>
    </div>
  );
}
