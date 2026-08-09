import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Car, FileText, AlertTriangle, RotateCcw, Building2 } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  new: '新規', hearing: 'ヒアリング中', proposed: '提案済み',
  approved: '承認', contracting: '契約手続き', active: '利用中',
  payment_issue: '未払い', return_pending: '返却予定', completed: '完了',
  cancelled: 'キャンセル',
};

export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const h = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch(API('/company/dashboard'), { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/me'), { headers: h }).then(r => r.ok ? r.json() : null),
    ]).then(([dash, me]) => {
      setData(dash);
      setMe(me);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const stats = data?.stats ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 会社名 */}
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">{me?.company_name ?? me?.name}</h1>
          <p className="text-sm text-muted-foreground">{me?.service_area}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '総車両数', value: stats.total_vehicles ?? 0, icon: Car, color: 'text-blue-600', href: '/company/vehicles' },
          { label: '稼働中', value: stats.rented_vehicles ?? 0, icon: Car, color: 'text-green-600', href: '/company/contracts' },
          { label: '未払い', value: stats.payment_issues ?? 0, icon: AlertTriangle, color: 'text-red-600', href: '/company/contracts' },
          { label: '返却予定', value: stats.return_pending ?? 0, icon: RotateCcw, color: 'text-orange-600', href: '/company/contracts' },
        ].map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <div className="border border-border rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent contracts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">直近の契約</h2>
          <Link href="/company/contracts">
            <span className="text-xs text-primary hover:underline cursor-pointer">すべて見る →</span>
          </Link>
        </div>
        <div className="border border-border rounded-xl overflow-hidden">
          {(data?.recentContracts ?? []).length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">契約はまだありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">契約ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ユーザー</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">車両</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.recentContracts ?? []).map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">#{c.id}</td>
                    <td className="px-4 py-3">{c.user_name}</td>
                    <td className="px-4 py-3">{c.maker} {c.model}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-muted">
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
    </div>
  );
}
