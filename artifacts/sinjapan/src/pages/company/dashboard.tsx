import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Car, FileText, TrendingUp, RotateCcw, AlertTriangle,
  Clock, CheckCircle, Plus, Loader2,
} from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  new: '新規', hearing: 'ヒアリング中', proposed: '提案済み',
  approved: '承認', contracting: '契約手続き', active: '利用中',
  payment_issue: '未払い', return_pending: '返却予定', completed: '完了',
  cancelled: 'キャンセル', pending_payment: '決済待ち',
  delivery_pending: '納車待ち',
};

const CONTRACT_STATUS_STYLES: Record<string, string> = {
  active:          'bg-green-50 text-green-700 border border-green-200',
  payment_issue:   'bg-red-50 text-red-700 border border-red-200',
  return_pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  delivery_pending:'bg-sky-50 text-sky-700 border border-sky-200',
  completed:       'bg-gray-50 text-gray-500 border border-gray-200',
  cancelled:       'bg-gray-50 text-gray-400 border border-gray-200',
  pending_payment: 'bg-pink-50 text-pink-700 border border-pink-200',
};

function KpiCard({ icon, label, value, sub, dark }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; dark?: boolean;
}) {
  return (
    <Card className={`border-border shadow-sm ${dark ? 'bg-foreground text-background' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-xs font-medium flex items-center gap-1.5 ${dark ? 'text-background/60' : 'text-muted-foreground'}`}>
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${dark ? 'text-background' : ''}`}>{value}</div>
        {sub && <p className={`text-xs mt-1 ${dark ? 'text-background/50' : 'text-muted-foreground'}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(API('/company/dashboard'), { headers: authH() }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/me'), { headers: authH() }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/settlements'), { headers: authH() }).then(r => r.ok ? r.json() : []),
    ]).then(([dash, me, sett]) => {
      setData(dash);
      setMe(me);
      setSettlements(Array.isArray(sett) ? sett.slice(0, 3) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const stats = data?.stats ?? {};
  const contracts = data?.recentContracts ?? [];

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = settlements
    .filter((s: any) => (s.period_month ?? '').startsWith(thisMonth))
    .reduce((sum: number, s: any) => sum + Number(s.rental_company_amount ?? s.company_amount ?? 0), 0);

  // 要対応リスト
  const actionItems = [
    { label: '返却予定', count: stats.return_pending ?? 0, icon: <RotateCcw className="h-4 w-4" />, href: '/company/contracts' },
    { label: '審査中車両', count: stats.reviewing_vehicles ?? 0, icon: <Car className="h-4 w-4" />, href: '/company/vehicles' },
  ].filter(i => i.count > 0);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{me?.name ?? me?.company_name ?? 'ダッシュボード'}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            {me?.status === 'active'
              ? <><CheckCircle className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">承認済みパートナー</span></>
              : <><Clock className="h-3.5 w-3.5 text-amber-600" /><span className="text-amber-600">審査中</span></>
            }
          </p>
        </div>
        <Link href="/company/vehicles">
          <button className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition flex items-center gap-2">
            <Plus className="h-4 w-4" />車両を登録
          </button>
        </Link>
      </div>

      {/* 審査中バナー */}
      {me?.status === 'prospect' && (
        <Card className="border-amber-200 bg-amber-50 shadow-none">
          <CardContent className="py-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">審査中です</p>
              <p className="text-xs text-amber-700 mt-0.5">管理者が申請内容を確認しています。承認完了後にすべての機能が使えるようになります。</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIカード */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          icon={<Car className="h-3.5 w-3.5" />}
          label="総車両数"
          value={stats.total_vehicles ?? 0}
          sub={`稼働中 ${stats.rented_vehicles ?? 0} 台`}
          dark
        />
        <KpiCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="契約中"
          value={stats.active_contracts ?? 0}
          sub={`返却予定 ${stats.return_pending ?? 0} 件`}
        />
        <KpiCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="今月の売上"
          value={monthlyRevenue > 0 ? `¥${monthlyRevenue.toLocaleString()}` : '—'}
          sub="確定済み金額"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 直近の契約 */}
        <div className="lg:col-span-2">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" />直近の契約</span>
                <Link href="/company/contracts">
                  <span className="text-xs font-normal text-muted-foreground hover:text-foreground cursor-pointer">すべて見る →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {contracts.length === 0 ? (
                <div className="py-10 text-center">
                  <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">契約はまだありません</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-y border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">ユーザー</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">車両</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">ステータス</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {contracts.map((c: any) => (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.user_name ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{c.maker} {c.model}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${CONTRACT_STATUS_STYLES[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* サイドパネル */}
        <div className="space-y-4">
          {/* 要対応 */}
          {actionItems.length > 0 && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />要対応
                  <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-foreground text-background rounded-full">
                    {actionItems.reduce((s, i) => s + i.count, 0)}件
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {actionItems.map(item => (
                  <Link key={item.label} href={item.href}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors cursor-pointer">
                      {item.icon}
                      <span className="text-sm flex-1">{item.label}</span>
                      <span className="text-sm font-semibold">{item.count}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 直近の売上 */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />直近の売上</span>
                <Link href="/company/settlements">
                  <span className="text-xs font-normal text-muted-foreground hover:text-foreground cursor-pointer">すべて見る →</span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {settlements.length === 0 ? (
                <div className="py-8 text-center">
                  <TrendingUp className="h-5 w-5 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">売上データなし</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {settlements.map((s: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">{s.period_month ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{s.maker} {s.model}</p>
                      </div>
                      <p className="text-sm font-semibold">
                        ¥{Number(s.rental_company_amount ?? s.company_amount ?? 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
