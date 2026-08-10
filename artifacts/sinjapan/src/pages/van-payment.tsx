import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, CreditCard, Building2, CheckCircle2, ShieldCheck, FileText as LicenseIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BLACK_NUMBER_FEE = 19800;

declare const Square: any;

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token')}`,
  'Content-Type': 'application/json',
});

async function getPaymentConfig() {
  const r = await fetch(apiUrl('/config/payment'), { credentials: 'include', headers: authHeader() });
  return r.ok ? r.json() : null;
}

async function getCorporateStatus() {
  const r = await fetch(apiUrl('/corporate/status'), { credentials: 'include', headers: authHeader() });
  return r.ok ? r.json() : null;
}

// ─── 法人請求書払いフォーム ───────────────────────────────────────────────────
type CorporateStatus = { creditStatus?: string; isCompany?: boolean };

function InvoiceForm({
  applicationId,
  contractId,
  onDone,
}: {
  applicationId: number;
  contractId: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CorporateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    corporateNumber: '',
    companyName: '',
    phone: '',
    billingAddress: '',
  });

  useEffect(() => {
    getCorporateStatus().then(s => { setStatus(s); setLoading(false); });
  }, []);

  const handleApply = async () => {
    if (!form.corporateNumber || !form.companyName) {
      toast({ variant: 'destructive', title: '必須項目を入力してください' });
      return;
    }
    setSubmitting(true);
    try {
      // 1. 法人口座申請
      const r1 = await fetch(apiUrl('/corporate/apply'), {
        method: 'POST', credentials: 'include', headers: authHeader(),
        body: JSON.stringify({ ...form, paymentTerms: 'Net30' }),
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok) throw new Error(d1.error ?? '申請に失敗しました');

      // 2. 契約の支払い方法を invoice で記録
      const r2 = await fetch(apiUrl(`/van/contracts/${contractId}/pay`), {
        method: 'POST', credentials: 'include', headers: authHeader(),
        body: JSON.stringify({ method: 'invoice' }),
      });
      if (!r2.ok) { const d2 = await r2.json().catch(() => ({})); throw new Error(d2.error ?? '処理に失敗しました'); }

      onDone();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground p-5">
      <Loader2 className="h-4 w-4 animate-spin" />確認中…
    </div>
  );

  // 審査済みの場合はそのまま進める
  if (status?.creditStatus === 'approved') {
    return (
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-foreground bg-muted border border-border rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />法人口座が承認済みです。請求書払いでご利用いただけます。
        </div>
        <button onClick={handleApply} disabled={submitting}
          className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : '法人請求書払いで確定する'}
        </button>
      </div>
    );
  }

  // 審査中
  if (status?.creditStatus === 'pending') {
    return (
      <div className="p-5">
        <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          現在審査中です。承認後にご利用いただけます（2〜3営業日以内にご連絡します）。
        </div>
      </div>
    );
  }

  // 未申請 → フォーム表示
  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-muted-foreground">審査通過後、翌月末払いの請求書をご登録メールへ送付します。</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">法人番号 <span className="text-red-500">*</span></label>
          <input
            type="text" maxLength={13} placeholder="1234567890123（13桁）"
            value={form.corporateNumber}
            onChange={e => setForm(f => ({ ...f, corporateNumber: e.target.value.replace(/\D/g, '') }))}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">会社名 <span className="text-red-500">*</span></label>
          <input
            type="text" placeholder="合同会社〇〇"
            value={form.companyName}
            onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">担当者電話番号</label>
          <input
            type="tel" placeholder="03-1234-5678"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">請求書送付先住所</label>
          <input
            type="text" placeholder="東京都渋谷区〇〇 1-2-3"
            value={form.billingAddress}
            onChange={e => setForm(f => ({ ...f, billingAddress: e.target.value }))}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
          />
        </div>
      </div>
      <button onClick={handleApply} disabled={submitting}
        className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />申請中…</> : '法人請求書払いを申請する'}
      </button>
      <p className="text-xs text-muted-foreground text-center">※ 審査の結果によりご利用いただけない場合があります</p>
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────
export default function VanPayment() {
  const [, params] = useRoute('/van/:id/payment');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [method, setMethod] = useState<'invoice' | 'card'>('card');
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);

  // オプション選択（契約データが来たら初期化）
  const [blackNumber, setBlackNumber] = useState(false);
  const [insuranceReferral, setInsuranceReferral] = useState(false);
  const [optionsInitialized, setOptionsInitialized] = useState(false);
  const [optionsUpdating, setOptionsUpdating] = useState(false);

  const cardRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const { data: application, isLoading, refetch } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });
  const contract = (application as any)?.contract as any;

  // 契約データ初回取得時にオプション状態を初期化
  useEffect(() => {
    if (contract && !optionsInitialized) {
      setBlackNumber(!!contract.blackNumberRequested);
      setInsuranceReferral(!!contract.insuranceReferralRequested);
      setOptionsInitialized(true);
    }
  }, [contract, optionsInitialized]);

  // オプション変更をサーバーに保存
  const updateOptions = async (newBlackNumber: boolean, newInsurance: boolean) => {
    if (!contract) return;
    setOptionsUpdating(true);
    try {
      const r = await fetch(apiUrl(`/van/contracts/${contract.id}/options`), {
        method: 'PATCH', credentials: 'include', headers: authHeader(),
        body: JSON.stringify({ blackNumberRequested: newBlackNumber, insuranceReferralRequested: newInsurance }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? '更新に失敗しました');
      }
      await refetch();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setOptionsUpdating(false);
    }
  };

  const handleBlackNumberChange = (checked: boolean) => {
    setBlackNumber(checked);
    updateOptions(checked, insuranceReferral);
  };

  const handleInsuranceChange = (checked: boolean) => {
    setInsuranceReferral(checked);
    updateOptions(blackNumber, checked);
  };

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
      // 本番 or サンドボックスで読み込み先を切り替え
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
  const monthlyTax  = Math.floor(monthlyBase * 0.1);
  const monthlyTotal = monthlyBase + monthlyTax;
  // ローカル選択状態から金額を計算（DBの値より優先）
  const optionsFee  = blackNumber ? BLACK_NUMBER_FEE : 0;
  const total = monthlyTotal + optionsFee;
  const fmt   = (n: number) => `¥${Math.floor(n).toLocaleString()}`;

  const handleCardPay = async () => {
    if (!cardRef.current) return;
    setSubmitting(true); setSquareError(null);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'カードのトークン化に失敗しました');
      const r = await fetch(apiUrl(`/van/contracts/${contract.id}/square-charge`), {
        method: 'POST', credentials: 'include', headers: authHeader(),
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

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-foreground flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-background" />
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {method === 'invoice' ? '申請を受け付けました' : 'お支払い完了'}
        </h1>
        <p className="text-muted-foreground mb-8">
          {method === 'invoice'
            ? '審査結果を2〜3営業日以内にメールでご連絡します。'
            : 'カード決済が完了しました。担当者からご連絡いたします。'}
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

      {/* オプション選択 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center justify-between">
          <span>オプション（任意）</span>
          {optionsUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="divide-y divide-border">
          {/* 黒ナンバー */}
          <label className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={blackNumber}
              onChange={e => handleBlackNumberChange(e.target.checked)}
              disabled={optionsUpdating}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-foreground"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <LicenseIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  黒ナンバー代理取得
                </span>
                <span className="text-sm font-medium shrink-0">+¥19,800</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">提携行政書士が申請手続きを代行します。初回のみ加算。</p>
              <p className="text-xs text-gray-900 font-medium mt-0.5">※ 取得手続きのため納車まで数日〜1週間程度お時間をいただきます。</p>
              {blackNumber && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <span className="font-medium">必要書類（郵送にてお送りください）</span><br />・住民票（発行3ヶ月以内）
                </div>
              )}
            </div>
          </label>
          {/* 保険紹介 */}
          <label className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <input
              type="checkbox"
              checked={insuranceReferral}
              onChange={e => handleInsuranceChange(e.target.checked)}
              disabled={optionsUpdating}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-foreground"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                  保険紹介
                </span>
                <span className="text-sm text-muted-foreground shrink-0">担当者より案内</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">黒・黄ナンバー対応の保険をご紹介します。</p>
            </div>
          </label>
        </div>
      </div>

      {/* 請求内訳 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">ご請求内訳（初回）</div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">月額料金（税抜）</span><span>{fmt(monthlyBase)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">消費税（10%）</span><span>{fmt(monthlyTax)}</span></div>
          {blackNumber && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <LicenseIcon className="h-3.5 w-3.5" />黒ナンバー代理取得
              </span>
              <span>{fmt(optionsFee)}</span>
            </div>
          )}
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
          <div onClick={() => setMethod('invoice')}
            className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${method === 'invoice' ? 'border-foreground ring-1 ring-foreground bg-foreground/5' : 'border-border hover:border-foreground/40'}`}>
            <Building2 className={`h-5 w-5 mr-3 shrink-0 ${method === 'invoice' ? '' : 'text-muted-foreground'}`} />
            <div className="flex-1">
              <span className="font-medium text-sm">法人請求書払い</span>
              <p className="text-xs text-muted-foreground mt-0.5">法人のみ・審査あり・翌月末払い</p>
            </div>
            {method === 'invoice' && <CheckCircle2 className="h-5 w-5 ml-2 shrink-0" />}
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

      {/* 法人請求書払いフォーム */}
      {method === 'invoice' && (
        <div className="rounded-xl border border-border overflow-hidden mb-6">
          <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" />法人情報の入力
          </div>
          <InvoiceForm
            applicationId={applicationId}
            contractId={contract.id}
            onDone={() => setDone(true)}
          />
        </div>
      )}

      {squareError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">{squareError}</div>
      )}

      {method === 'card' && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 justify-center">
            <ShieldCheck className="h-3.5 w-3.5" />お支払い情報は安全に管理されます
          </div>
          <button onClick={handleCardPay} disabled={submitting || !cardReady}
            className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />処理中…</> : `${fmt(total)} をカード払いで確定する`}
          </button>
        </>
      )}
    </div>
  );
}
