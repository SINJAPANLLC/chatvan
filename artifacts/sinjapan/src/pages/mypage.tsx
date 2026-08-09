import React, { useState } from 'react';
import { useListVanContracts, useGetMe } from '@workspace/api-client-react';
import { Loader2, Car, JapaneseYen, Calendar, CreditCard, ChevronRight, Shield, AlertTriangle, RotateCcw, Phone } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, string> = {
  hearing: '相談受付中',
  vehicle_search: '車両確認中',
  proposal_sent: '提案送信済',
  proposal_accepted: '提案確定',
  kyc_pending: '本人確認待ち',
  screening: '審査中',
  contract_pending: '契約待ち',
  contracting: '契約手続き中',
  active: '利用中',
  pending_delivery: '納車待ち',
  return_scheduled: '返却予定',
  completed: '完了',
  rejected: '却下',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending_delivery: 'bg-blue-100 text-blue-800',
  return_scheduled: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-700',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function MyPage() {
  const { data: user, isLoading: isUserLoading } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ incidentType: 'accident', description: '', location: '', hasInjuries: false, policeContacted: false, canDrive: true });
  const [returnForm, setReturnForm] = useState({ returnDate: '', returnLocation: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const { data: contracts, isLoading: isContractsLoading } = useListVanContracts({}, {
    query: { enabled: !!user }
  });

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      setLocation('/login');
    }
  }, [user, isUserLoading, setLocation]);

  if (isUserLoading || isContractsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const activeContracts = contracts?.filter(c => !['completed', 'cancelled'].includes(c.status)) || [];
  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);

  const handleIncidentSubmit = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/van/incidents', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ ...incidentForm, contractId: activeContracts[0]?.id }) });
      if (!r.ok) throw new Error('送信に失敗しました');
      toast({ title: '報告を受け付けました。スタッフが確認します。' });
      setShowIncidentModal(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message });
    } finally { setSubmitting(false); }
  };

  const handleReturnSubmit = async () => {
    setSubmitting(true);
    try {
      const contract = activeContracts[0];
      const r = await fetch('/api/van/returns', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ ...returnForm, contractId: contract?.id, vehicleId: contract?.vehicleId }),
      });
      if (!r.ok) throw new Error('送信に失敗しました');
      toast({ title: '返却申請を受け付けました。担当者からご連絡します。' });
      setShowReturnModal(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">マイページ</h1>
        <p className="text-muted-foreground">ようこそ、{user.name}さん</p>
      </div>

      {/* Active Contracts */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Car className="h-5 w-5" /> 現在の契約車両
        </h2>

        {activeContracts.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <Car className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">現在ご利用中の車両はありません。</p>
            <Link href="/">
              <button className="px-6 py-2 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                新しい軽バンを探す
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {activeContracts.map((contract) => {
              const vehicle = (contract as any).vehicle;
              const isActive = contract.status === 'active';
              return (
                <div key={contract.id} className="border border-border rounded-xl overflow-hidden shadow-sm">
                  <div className="flex flex-col sm:flex-row">
                    {/* Vehicle info */}
                    <div className="sm:w-1/3 bg-muted p-6 flex flex-col justify-center items-center border-b sm:border-b-0 sm:border-r border-border/50">
                      {vehicle?.imageUrl ? (
                        <img src={vehicle.imageUrl} alt={`${vehicle?.maker} ${vehicle?.model}`} className="w-full h-32 object-cover rounded-lg mb-3" />
                      ) : (
                        <Car className="h-14 w-14 text-muted-foreground/30 mb-3" />
                      )}
                      <span className="font-bold text-lg text-center">{vehicle?.maker} {vehicle?.model}</span>
                      {vehicle?.licensePlate && <span className="text-sm text-muted-foreground mt-0.5">{vehicle.licensePlate}</span>}
                      <span className={`inline-block mt-2 px-3 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[contract.status] || 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABELS[contract.status] || contract.status}
                      </span>
                    </div>

                    {/* Contract details */}
                    <div className="sm:w-2/3 p-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><JapaneseYen className="h-3.5 w-3.5"/>月額料金</p>
                          <p className="font-bold text-lg">{formatPrice(contract.monthlyPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="h-3.5 w-3.5"/>利用開始日</p>
                          <p className="font-medium text-sm">{contract.startDate ? format(new Date(contract.startDate), 'yyyy年MM月dd日') : '未定'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5"/>次回決済日</p>
                          <p className="font-medium text-sm">{(contract as any).nextPaymentDate ? format(new Date((contract as any).nextPaymentDate), 'yyyy年MM月dd日') : '確認中'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Shield className="h-3.5 w-3.5"/>保険</p>
                          <p className="font-medium text-sm">加入済み</p>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {isActive && (
                        <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
                          <button
                            onClick={() => setShowIncidentModal(true)}
                            className="flex-1 py-2 border border-red-200 text-red-700 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> 事故・故障を報告
                          </button>
                          <button
                            onClick={() => setShowReturnModal(true)}
                            className="flex-1 py-2 border border-border text-foreground rounded-lg text-xs font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> 返却を申請
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Menu */}
      <section>
        <h2 className="text-lg font-semibold mb-4">アカウントメニュー</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/">
            <div className="hover:bg-muted transition-colors cursor-pointer border border-border rounded-xl p-5 flex items-center justify-between group">
              <div className="flex items-center">
                <div className="h-10 w-10 bg-background border border-border rounded-full flex items-center justify-center mr-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                  <Car className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium">Chat VANに相談</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">新しい車両を探す</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>

          <Link href="/settings">
            <div className="hover:bg-muted transition-colors cursor-pointer border border-border rounded-xl p-5 flex items-center justify-between group">
              <div className="flex items-center">
                <div className="h-10 w-10 bg-background border border-border rounded-full flex items-center justify-center mr-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium">お支払い・登録情報</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">カード情報・パスワード変更</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>

          <div className="hover:bg-muted transition-colors cursor-pointer border border-border rounded-xl p-5 flex items-center justify-between group" onClick={() => window.open('tel:0120000000')}>
            <div className="flex items-center">
              <div className="h-10 w-10 bg-background border border-border rounded-full flex items-center justify-center mr-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium">サポートに連絡</h3>
                <p className="text-xs text-muted-foreground mt-0.5">平日 9:00〜18:00</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </section>

      {/* Incident Modal */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-700">事故・故障を報告</h2>
            <p className="text-xs text-muted-foreground">緊急の場合は警察(110)・救急(119)に先に連絡してください。</p>
            <div className="space-y-1">
              <label className="text-sm font-medium">種別</label>
              <div className="flex gap-2">
                {[{ v: 'accident', l: '事故' }, { v: 'breakdown', l: '故障' }, { v: 'other', l: 'その他' }].map(t => (
                  <button key={t.v} onClick={() => setIncidentForm(f => ({ ...f, incidentType: t.v }))}
                    className={`flex-1 py-2 text-sm rounded-md border ${incidentForm.incidentType === t.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border'}`}>
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">状況を教えてください</label>
              <textarea value={incidentForm.description} onChange={e => setIncidentForm(f => ({ ...f, description: e.target.value }))}
                rows={3} placeholder="何が起きているか詳しく教えてください" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">現在地・場所</label>
              <input value={incidentForm.location} onChange={e => setIncidentForm(f => ({ ...f, location: e.target.value }))}
                placeholder="〇〇県〇〇市〇〇付近など" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            {incidentForm.incidentType === 'accident' && (
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incidentForm.hasInjuries} onChange={e => setIncidentForm(f => ({ ...f, hasInjuries: e.target.checked }))} />
                  けが人あり
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incidentForm.policeContacted} onChange={e => setIncidentForm(f => ({ ...f, policeContacted: e.target.checked }))} />
                  警察に連絡済み
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={incidentForm.canDrive} onChange={e => setIncidentForm(f => ({ ...f, canDrive: e.target.checked }))} />
                  自走可能
                </label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowIncidentModal(false)} className="flex-1 py-2 border border-border rounded-md text-sm">キャンセル</button>
              <button onClick={handleIncidentSubmit} disabled={!incidentForm.description || submitting}
                className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm font-medium disabled:opacity-50">
                {submitting ? '送信中...' : '報告する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">返却を申請</h2>
            <p className="text-xs text-muted-foreground">申請後、担当スタッフから日程調整のご連絡をします。</p>
            <div className="space-y-1">
              <label className="text-sm font-medium">希望返却日</label>
              <input type="date" value={returnForm.returnDate} onChange={e => setReturnForm(f => ({ ...f, returnDate: e.target.value }))}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">返却場所</label>
              <input value={returnForm.returnLocation} onChange={e => setReturnForm(f => ({ ...f, returnLocation: e.target.value }))}
                placeholder="希望の返却場所をご記入ください" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">返却理由（任意）</label>
              <textarea value={returnForm.reason} onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))}
                rows={2} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowReturnModal(false)} className="flex-1 py-2 border border-border rounded-md text-sm">キャンセル</button>
              <button onClick={handleReturnSubmit} disabled={!returnForm.returnDate || submitting}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {submitting ? '送信中...' : '返却を申請する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
