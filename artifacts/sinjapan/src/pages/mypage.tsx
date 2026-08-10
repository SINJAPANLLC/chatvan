import React, { useEffect, useState } from 'react';
import { useListVanContracts, useGetMe } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Car, JapaneseYen, Calendar, CreditCard, ChevronRight, MessageSquare, BadgeCheck, AlertCircle, Clock, FileText } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:          { label: '利用中',       color: 'bg-foreground text-background' },
  delivery_pending:{ label: '受け取り待ち', color: 'bg-amber-100 text-amber-800 border border-amber-300' },
  payment_issue:   { label: '支払い問題',   color: 'bg-red-100 text-red-800 border border-red-300' },
  return_pending:  { label: '解約申請中',   color: 'bg-orange-100 text-orange-800 border border-orange-300' },
  completed:       { label: '利用終了',     color: 'bg-muted text-muted-foreground' },
  cancelled:       { label: 'キャンセル',   color: 'bg-muted text-muted-foreground' },
};

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';

type IDVStatus = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';

export default function MyPage() {
  const { data: user, isLoading: isUserLoading } = useGetMe();
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

  const activeContracts = contracts?.filter(c => c.status !== 'completed' && c.status !== 'cancelled') || [];
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
                    <div className="sm:w-1/3 bg-muted p-6 flex flex-col justify-center items-center border-b sm:border-b-0 sm:border-r border-border/50">
                      <Car className="h-12 w-12 text-muted-foreground/50 mb-2" />
                      <span className="font-bold text-lg text-center">
                        {contract.vehicle?.maker} {contract.vehicle?.model}
                      </span>
                      {contract.vehicle?.year && (
                        <span className="text-xs text-muted-foreground mt-0.5">{contract.vehicle.year}年式</span>
                      )}
                      <span className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-semibold rounded-full ${st.color}`}>
                        {st.label}
                      </span>
                    </div>

                    {/* 右: 契約情報 */}
                    <div className="sm:w-2/3 p-6 flex flex-col justify-between gap-5">
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
                          <p className="font-medium">毎月 {contract.paymentDay}日</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />最低利用期間
                          </p>
                          <p className="font-medium">{(contract as any).minimumTerm ?? 1}ヶ月</p>
                        </div>
                      </div>

                      {/* アクションボタン */}
                      <div className="flex flex-wrap gap-2">
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
                            <MessageSquare className="h-4 w-4" />
                            担当者にメッセージ
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
                  idvStatus === 'verified'  ? 'bg-green-50 border-green-300 text-green-600' :
                  idvStatus === 'submitted' ? 'bg-amber-50 border-amber-300 text-amber-600' :
                  idvStatus === 'rejected'  ? 'bg-red-50 border-red-300 text-red-600' :
                  'bg-muted border-border text-muted-foreground'
                }`}>
                  {idvStatus === 'verified'  ? <BadgeCheck className="h-5 w-5" /> :
                   idvStatus === 'submitted' ? <Clock className="h-5 w-5" /> :
                   idvStatus === 'rejected'  ? <AlertCircle className="h-5 w-5" /> :
                   <BadgeCheck className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-medium">免許証・本人確認</h3>
                  <p className={`text-xs mt-0.5 ${
                    idvStatus === 'verified'  ? 'text-green-600' :
                    idvStatus === 'submitted' ? 'text-amber-600' :
                    idvStatus === 'rejected'  ? 'text-red-600'   :
                    'text-muted-foreground'
                  }`}>
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

    </div>
  );
}
