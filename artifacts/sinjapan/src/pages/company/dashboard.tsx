import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Car, FileText, AlertTriangle, RotateCcw, TrendingUp, CheckCircle, Clock, Plus } from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  new: '新規', hearing: 'ヒアリング中', proposed: '提案済み',
  approved: '承認', contracting: '契約手続き', active: '利用中',
  payment_issue: '未払い', return_pending: '返却予定', completed: '完了',
  cancelled: 'キャンセル',
};

const CONTRACT_STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  payment_issue: 'bg-red-100 text-red-700',
  return_pending: 'bg-orange-100 text-orange-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch(API('/company/dashboard'), { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/me'), { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/settlements'), { headers: h }).then(r => r.ok ? r.json() : []),
    ]).then(([dash, me, sett]) => {
      setData(dash);
      setMe(me);
      setSettlements(Array.isArray(sett) ? sett.slice(0, 3) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const stats = data?.stats ?? {};
  const contracts = data?.recentContracts ?? [];

  // 今月の売上合計
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = settlements
    .filter((s: any) => (s.period_month ?? '').startsWith(thisMonth))
    .reduce((sum: number, s: any) => sum + Number(s.company_amount ?? s.monthly_price ?? 0), 0);

  const kpiCards = [
    {
      label: '総車両数',
      value: stats.total_vehicles ?? 0,
      sub: `稼働中 ${stats.rented_vehicles ?? 0} 台`,
      icon: Car,
      href: '/company/vehicles',
      accent: 'bg-blue-50 text-blue-600 border-blue-100',
      iconBg: 'bg-blue-100',
    },
    {
      label: '契約中',
      value: stats.active_contracts ?? 0,
      sub: `返却予定 ${stats.return_pending ?? 0} 件`,
      icon: FileText,
      href: '/company/contracts',
      accent: 'bg-green-50 text-green-600 border-green-100',
      iconBg: 'bg-green-100',
    },
    {
      label: '今月の売上',
      value: monthlyRevenue > 0 ? `¥${monthlyRevenue.toLocaleString()}` : '—',
      sub: '確定済み金額',
      icon: TrendingUp,
      href: '/company/settlements',
      accent: 'bg-violet-50 text-violet-600 border-violet-100',
      iconBg: 'bg-violet-100',
    },
    {
      label: '未払い',
      value: stats.payment_issues ?? 0,
      sub: '対応が必要',
      icon: AlertTriangle,
      href: '/company/contracts',
      accent: stats.payment_issues > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100',
      iconBg: stats.payment_issues > 0 ? 'bg-red-100' : 'bg-gray-100',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">

      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{me?.company_name ?? me?.name ?? 'ダッシュボード'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {me?.status === 'active' ? (
              <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="h-3.5 w-3.5" />承認済みパートナー</span>
            ) : me?.status === 'prospect' ? (
              <span className="inline-flex items-center gap-1 text-amber-600"><Clock className="h-3.5 w-3.5" />審査中</span>
            ) : (
              <span className="text-muted-foreground">{me?.status ?? ''}</span>
            )}
          </p>
        </div>
        <Link href="/company/vehicles">
          <button className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90">
            <Plus className="h-4 w-4" />車両を登録
          </button>
        </Link>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, sub, icon: Icon, href, accent, iconBg }) => (
          <Link key={label} href={href}>
            <div className={`border rounded-xl p-4 cursor-pointer hover:shadow-sm transition-all group ${accent}`}>
              <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              <p className="text-xs font-medium mt-0.5">{label}</p>
              <p className="text-xs opacity-70 mt-0.5">{sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* 下段：直近の契約 + 売上サマリー */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 直近の契約 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">直近の契約</h2>
            <Link href="/company/contracts">
              <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">すべて見る →</span>
            </Link>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            {contracts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
                契約はまだありません
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">ユーザー</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">車両</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">ステータス</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contracts.map((c: any) => (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">{c.user_name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.maker} {c.model}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CONTRACT_STATUS_COLOR[c.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 直近の売上 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">直近の売上</h2>
            <Link href="/company/settlements">
              <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">すべて見る →</span>
            </Link>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            {settlements.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-30" />
                売上データなし
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
                      ¥{Number(s.company_amount ?? s.monthly_price ?? 0).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 審査中バナー */}
      {me?.status === 'prospect' && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">審査中です</p>
            <p className="text-xs text-amber-700 mt-0.5">管理者が申請内容を確認しています。承認完了後にすべての機能が使えるようになります。</p>
          </div>
        </div>
      )}

    </div>
  );
}
