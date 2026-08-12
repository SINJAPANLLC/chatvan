import React, { useEffect, useState, useRef } from 'react';
import { useListVanContracts, useGetMe } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Car, JapaneseYen, Calendar, CreditCard, ChevronRight, MessageSquare, BadgeCheck, AlertCircle, Clock, FileText, Pencil, ShieldCheck, PlusCircle } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

declare const Square: any;

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdr = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

const CARD_BRAND: Record<string, string> = {
  VISA: 'Visa', MASTERCARD: 'Mastercard', AMERICAN_EXPRESS: 'Amex',
  DISCOVER: 'Discover', JCB: 'JCB', CHINA_UNIONPAY: 'UnionPay',
};

// ─── カード管理セクション ────────────────────────────────────────────────────
function CardSection({ user, onUpdated }: { user: any; onUpdated: () => void }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);
  const cardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasCard = !!user?.squareCardId;

  useEffect(() => {
    if (!showForm) return;
    let card: any = null;
    let destroyed = false;
    setCardReady(false);
    setSquareError(null);

    const init = async () => {
      try {
        const cfg = await fetch(API('/config/payment'), { credentials: 'include', headers: hdr() }).then(r => r.ok ? r.json() : null);
        if (!cfg?.squareApplicationId) { setSquareError('Square設定が不足しています'); return; }
        const payments = Square.payments(cfg.squareApplicationId, cfg.squareLocationId);
        card = await payments.card({
          style: {
            input: { fontSize: '14px' },
            '.input-container': { borderColor: '#e2e8f0', borderRadius: '8px' },
            '.input-container.is-focus': { borderColor: '#1a202c' },
          },
        });
        if (destroyed) return;
        if (containerRef.current) await card.attach(containerRef.current);
        cardRef.current = card;
        setCardReady(true);
      } catch (e: any) {
        if (!destroyed) setSquareError(`フォームの初期化に失敗しました: ${e.message}`);
      }
    };

    if (typeof Square !== 'undefined') {
      init();
    } else {
      const s = document.createElement('script');
      s.src = 'https://web.squarecdn.com/v1/square.js';
      s.onload = init;
      s.onerror = () => { if (!destroyed) setSquareError('Square.jsの読み込みに失敗しました'); };
      document.head.appendChild(s);
    }
    return () => { destroyed = true; card?.destroy?.(); cardRef.current = null; };
  }, [showForm]);

  const handleSubmit = async () => {
    if (!cardRef.current) return;
    setSubmitting(true); setSquareError(null);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'トークン化に失敗しました');
      const r = await fetch(API('/square/register-card'), {
        method: 'POST', credentials: 'include', headers: hdr(),
        body: JSON.stringify({ sourceId: result.token }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'カードの登録に失敗しました');
      setShowForm(false);
      onUpdated();
      toast({ title: 'カード情報を更新しました' });
    } catch (e: any) {
      setSquareError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <CreditCard className="h-5 w-5" />お支払いカード
      </h2>

      <Card className="border-border shadow-sm">
        <CardContent className="p-5 space-y-4">
          {/* 登録済みカード表示 */}
          {hasCard && !showForm && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {CARD_BRAND[user.cardBrand] ?? user.cardBrand ?? 'カード'} ****{user.cardLast4}
                  </p>
                  {user.cardExpiry && (
                    <p className="text-xs text-muted-foreground">有効期限 {user.cardExpiry}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />変更
              </button>
            </div>
          )}

          {/* カード未登録 */}
          {!hasCard && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
            >
              <PlusCircle className="h-4 w-4" />クレジットカードを登録する
            </button>
          )}

          {/* Square カードフォーム */}
          {showForm && (
            <div className="space-y-4">
              <div ref={containerRef} className="min-h-[48px]" />
              {!cardReady && !squareError && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {squareError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{squareError}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />カード情報はSquareが直接処理します。当社サーバーには保存されません。
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 border border-border text-sm rounded-full hover:bg-muted transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!cardReady || submitting}
                  className="flex-1 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />登録中…</> : '登録する'}
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:          { label: '利用中',       color: 'bg-foreground text-background' },
  delivery_pending:{ label: '受け取り待ち', color: 'bg-amber-100 text-amber-800 border border-amber-300' },
  payment_issue:   { label: '支払い問題',   color: 'bg-red-100 text-red-800 border border-red-300' },
  return_pending:  { label: '解約申請中',   color: 'bg-orange-100 text-orange-800 border border-orange-300' },
  completed:       { label: '利用終了',     color: 'bg-muted text-muted-foreground' },
  cancelled:       { label: 'キャンセル',   color: 'bg-muted text-muted-foreground' },
};

type IDVStatus = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';

export default function MyPage() {
  const { data: user, isLoading: isUserLoading, refetch: refetchUser } = useGetMe();
  const [, setLocation] = useLocation();
  const [idvStatus, setIdvStatus] = useState<IDVStatus | null>(null);

  const { data: contracts, isLoading: isContractsLoading } = useListVanContracts({}, {
    query: { enabled: !!user }
  });

  React.useEffect(() => {
    if (!isUserLoading && !user) { setLocation('/login'); return; }
    if (!user) return;
    fetch(API('/van/my/identity-verification'), { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setIdvStatus((d?.status as IDVStatus) ?? 'not_started'))
      .catch(() => setIdvStatus('not_started'));
  }, [user, isUserLoading, setLocation]);

  if (isUserLoading || isContractsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const ACTIVE_STATUSES = ['active', 'delivery_pending', 'payment_issue', 'return_pending'];
  const activeContracts = contracts?.filter(c => ACTIVE_STATUSES.includes(c.status as string)) || [];
  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);
  const totalWithTax = (c: (typeof activeContracts)[0]) =>
    Math.floor((Number(c.monthlyPrice) + Number((c as any).sinJapanFee ?? 0)) * 1.1);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">マイページ</h1>
        <p className="text-muted-foreground">ようこそ、{user.name}さん</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Car className="h-5 w-5 mr-2" />
          現在の契約車両
        </h2>

        {activeContracts.length === 0 ? (
          <Card className="bg-muted border-dashed border-2 p-8 text-center">
            <p className="text-muted-foreground mb-4">現在ご利用中の車両はありません。</p>
            <Link href="/">
              <button className="px-6 py-2 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                新しい軽バンを探す
              </button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeContracts.map((contract) => {
              const st = STATUS_LABEL[contract.status] ?? { label: contract.status, color: 'bg-muted text-muted-foreground' };
              const appId = (contract as any).applicationId;
              return (
                <Card key={contract.id} className="overflow-hidden border-border shadow-sm">
                  <div className="flex flex-col sm:flex-row">
                    {/* 左: 車両サムネイル */}
                    <div className="sm:w-1/3 bg-muted flex items-center justify-center border-b sm:border-b-0 sm:border-r border-border/50 overflow-hidden min-h-[160px]">
                      {(() => {
                        const photos = JSON.parse((contract.vehicle as any)?.photos || '[]');
                        return photos[0]
                          ? <img src={`${import.meta.env.BASE_URL}api/storage${photos[0]}`} alt="車両写真" className="w-full h-full object-contain p-2" />
                          : <Car className="h-12 w-12 text-muted-foreground/50" />;
                      })()}
                    </div>

                    {/* 右: 契約情報 */}
                    <div className="sm:w-2/3 p-6 flex flex-col justify-between gap-5">
                      {/* 車名 + ステータス */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-base leading-tight">
                            {contract.vehicle?.maker} {contract.vehicle?.model}
                          </p>
                          {contract.vehicle?.year && (
                            <p className="text-xs text-muted-foreground mt-0.5">{contract.vehicle.year}年式</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(contract as any).paymentMethod === 'invoice'
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-foreground text-background"><FileText className="h-3 w-3" />請求書払い</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-foreground text-background"><CreditCard className="h-3 w-3" />カード払い</span>
                          }
                          <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <JapaneseYen className="h-3.5 w-3.5" />月額料金（税込）
                          </p>
                          <p className="font-bold text-xl">{formatPrice(totalWithTax(contract))}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />利用開始日
                          </p>
                          <p className="font-medium">
                            {contract.startDate ? format(new Date(contract.startDate), 'yyyy年M月d日') : '未定'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <CreditCard className="h-3.5 w-3.5" />次回支払日
                          </p>
                          {(contract as any).paymentMethod === 'invoice'
                            ? <p className="font-medium">末締め翌月末払い</p>
                            : <p className="font-medium">毎月 {contract.paymentDay}日</p>
                          }
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />最低利用期間
                          </p>
                          <p className="font-medium">{(contract as any).minimumTerm ?? 1}ヶ月</p>
                        </div>
                      </div>

                      {/* アクションボタン */}
                      <div className="flex flex-wrap gap-3">
                        {appId && (
                          <Link href={`/van/${appId}/status`}>
                            <button className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                              <FileText className="h-4 w-4" />
                              契約詳細・利用状況
                            </button>
                          </Link>
                        )}
                        <Link href={`/contract-chat/${contract.id}`}>
                          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm hover:bg-muted transition-colors">
                            <AlertCircle className="h-4 w-4" />
                            事故・トラブル報告
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* 本人確認ステータス */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <BadgeCheck className="h-5 w-5 mr-2" />本人確認
        </h2>
        <Link href="/identity-verification">
          <Card className="hover:bg-muted transition-colors cursor-pointer border-border shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border ${
                  idvStatus === 'verified'  ? 'bg-foreground border-foreground text-background' :
                  idvStatus === 'submitted' ? 'bg-muted border-border text-foreground' :
                  idvStatus === 'rejected'  ? 'bg-foreground/10 border-foreground text-foreground' :
                  'bg-muted border-border text-muted-foreground'
                }`}>
                  {idvStatus === 'verified'  ? <BadgeCheck className="h-5 w-5" /> :
                   idvStatus === 'submitted' ? <Clock className="h-5 w-5" /> :
                   idvStatus === 'rejected'  ? <AlertCircle className="h-5 w-5" /> :
                   <BadgeCheck className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-medium">免許証・本人確認</h3>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    {idvStatus === 'verified'  ? '確認済み' :
                     idvStatus === 'submitted' ? '確認待ち' :
                     idvStatus === 'rejected'  ? '否認 — 再提出が必要です' :
                     '未提出 — タップして提出する'}
                  </p>
                </div>
              </div>
              {idvStatus !== 'verified' && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
            </CardContent>
          </Card>
        </Link>
      </section>

      <CardSection user={user} onUpdated={() => refetchUser()} />

      {/* 法人請求書払い */}
      {(() => {
        const invoiceContracts = activeContracts.filter(c => (c as any).paymentMethod === 'invoice');
        if (invoiceContracts.length === 0) return null;
        const usedAmount = invoiceContracts.reduce((sum, c) => sum + totalWithTax(c), 0);
        const creditLimit = (user as any)?.invoiceCreditLimit ?? null;
        return (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />法人請求書払い
            </h2>
            <Card className="border-border shadow-sm">
              {/* 与信額・利用額 */}
              <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">与信額</p>
                  <p className="font-bold text-lg">
                    {creditLimit != null ? formatPrice(creditLimit) : <span className="text-muted-foreground text-sm">未設定</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">月次利用額</p>
                  <p className="font-bold text-lg">{formatPrice(usedAmount)}</p>
                  {creditLimit != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      残枠 {formatPrice(Math.max(0, creditLimit - usedAmount))}
                    </p>
                  )}
                </div>
              </div>
              {/* 契約一覧 */}
              <CardContent className="p-0 divide-y divide-border">
                {invoiceContracts.map(c => (
                  <div key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {c.vehicle?.maker} {c.vehicle?.model}
                        {c.vehicle?.year ? <span className="text-muted-foreground font-normal ml-1">{c.vehicle.year}年式</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        月額 {formatPrice(totalWithTax(c))} / 毎月{c.paymentDay}日請求
                      </p>
                    </div>
                    <span className="text-xs bg-muted px-2.5 py-1 rounded-full whitespace-nowrap">請求書払い中</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        );
      })()}

    </div>
  );
}
