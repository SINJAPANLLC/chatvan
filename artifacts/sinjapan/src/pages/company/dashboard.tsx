import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Car, FileText, TrendingUp, Bell, Plus,
  Truck, RotateCcw, AlertTriangle, CheckCircle,
  Loader2, Clock,
} from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

const fmt = (v: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(v);

const CONTRACT_STATUS_LABELS: Record<string, string> = {
  new: '新規', hearing: 'ヒアリング中', proposed: '提案済み',
  approved: '承認', contracting: '契約手続き', active: '利用中',
  payment_issue: '未払い', return_pending: '返却予定',
  pending_payment: '決済待ち', delivery_pending: '納車待ち',
  completed: '完了', cancelled: 'キャンセル',
};

// ── KPI カード ────────────────────────────────────────────────────────────────
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
        <div className={`text-3xl font-bold tabular-nums ${dark ? 'text-background' : ''}`}>{value}</div>
        {sub && <p className={`text-xs mt-1 ${dark ? 'text-background/50' : 'text-muted-foreground'}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── 対応一覧パネル ────────────────────────────────────────────────────────────
function ActionPanel({ stats }: { stats: any }) {
  const items = [
    { label: '受取確認待ち',   count: stats.delivery_pending ?? 0, icon: <Truck        className="h-4 w-4" />, href: '/company/contracts' },
    { label: '返却予定',       count: stats.return_pending   ?? 0, icon: <RotateCcw    className="h-4 w-4" />, href: '/company/contracts' },
    { label: '決済待ち',       count: stats.pending_payment  ?? 0, icon: <AlertTriangle className="h-4 w-4" />, href: '/company/contracts' },
    { label: '審査中の車両',   count: stats.reviewing_vehicles ?? 0, icon: <Car         className="h-4 w-4" />, href: '/company/vehicles' },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          対応が必要なこと
          {total > 0
            ? <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-foreground text-background rounded-full">{total}件</span>
            : <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-muted text-muted-foreground rounded-full">問題なし</span>
          }
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-1">
        {items.map(item => (
          <Link key={item.label} href={item.href}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
              item.count > 0 ? 'bg-muted hover:bg-muted/70' : 'hover:bg-muted/50'
            }`}>
              <span className={item.count > 0 ? 'text-foreground' : 'text-muted-foreground'}>{item.icon}</span>
              <span className="text-xs flex-1">{item.label}</span>
              <span className={`text-sm font-bold tabular-nums ${item.count > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                {item.count}
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 通知パネル ────────────────────────────────────────────────────────────────
function NotificationsPanel() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API('/company/notifications'), { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setNotifications(Array.isArray(d) ? d.slice(0, 20) : []))
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id: number) => {
    await fetch(API(`/company/notifications/${id}/read`), { method: 'PATCH', headers: authHeader() });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" />
          通知
          {unread > 0 && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 bg-foreground text-background rounded-full">{unread}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-72 space-y-1 pr-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : notifications.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">通知はありません</p>
        ) : notifications.map(n => (
          <div key={n.id} onClick={() => !n.read && markRead(n.id)}
            className={`px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
              n.read ? 'text-muted-foreground hover:bg-muted/30' : 'bg-muted border border-border hover:bg-muted/70'
            }`}>
            <div className="flex items-start gap-2">
              {!n.read && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${n.read ? '' : 'text-foreground'}`}>{n.title}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-muted-foreground/70 mt-1">
                  {new Date(n.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 直近の契約パネル ──────────────────────────────────────────────────────────
function RecentContractsPanel({ contracts }: { contracts: any[] }) {
  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          直近の契約
          <Link href="/company/contracts">
            <span className="ml-auto text-xs text-muted-foreground hover:text-foreground cursor-pointer">すべて見る →</span>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-1">
        {contracts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">契約はまだありません</p>
        ) : contracts.map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{c.user_name ?? '—'}</p>
              <p className="text-xs text-muted-foreground truncate">{c.maker} {c.model}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 車両内訳 ──────────────────────────────────────────────────────────────────
function VehicleBreakdown({ stats }: { stats: any }) {
  const items = [
    { label: '空き',     value: stats.available_vehicles   ?? 0, icon: <Car className="h-4 w-4" /> },
    { label: '稼働中',   value: stats.rented_vehicles      ?? 0, icon: <CheckCircle className="h-4 w-4" />, accent: true },
    { label: '審査中',   value: stats.reviewing_vehicles   ?? 0, icon: <Clock className="h-4 w-4" /> },
    { label: '合計',     value: stats.total_vehicles       ?? 0, icon: <Car className="h-4 w-4" /> },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Car className="h-4 w-4 text-muted-foreground" />車両内訳
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(item => (
          <div key={item.label} className={`border rounded-xl p-4 ${item.accent ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 border-border'}`}>
            <div className={`flex items-center gap-1.5 mb-2 ${item.accent ? 'text-background/70' : 'text-muted-foreground'}`}>
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${item.accent ? 'text-background' : 'text-foreground'}`}>{item.value}</p>
            <p className={`text-xs mt-0.5 ${item.accent ? 'text-background/60' : 'text-muted-foreground'}`}>台</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── メイン ────────────────────────────────────────────────────────────────────
export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(API('/company/dashboard'), { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/me'),        { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch(API('/company/settlements'),{ headers: authHeader() }).then(r => r.ok ? r.json() : []),
    ]).then(([dash, me, sett]) => {
      setData(dash);
      setMe(me);
      setSettlements(Array.isArray(sett) ? sett : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const stats = data?.stats ?? {};
  const contracts = data?.recentContracts ?? [];

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = settlements
    .filter((s: any) => (s.period_month ?? '').startsWith(thisMonth))
    .reduce((sum: number, s: any) => sum + Number(s.rental_company_amount ?? s.company_amount ?? 0), 0);

  // 対応一覧用の追加stats
  const actionStats = {
    delivery_pending:   contracts.filter((c: any) => c.application_status === 'delivery_pending').length,
    return_pending:     contracts.filter((c: any) => c.application_status === 'return_pending').length,
    pending_payment:    contracts.filter((c: any) => c.status === 'pending_payment').length,
    reviewing_vehicles: stats.reviewing_vehicles ?? 0,
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{me?.name ?? me?.company_name ?? 'ダッシュボード'}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {me?.status === 'active'
              ? '承認済みパートナー'
              : me?.status === 'prospect' ? '審査中' : ''}
          </p>
        </div>
        <Link href="/company/vehicles">
          <button className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 shrink-0">
            <Plus className="h-4 w-4" />車両を登録
          </button>
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard icon={<Car       className="h-3.5 w-3.5" />} label="総車両数" value={stats.total_vehicles   ?? 0} sub={`稼働中 ${stats.rented_vehicles ?? 0} 台`} />
        <KpiCard icon={<FileText  className="h-3.5 w-3.5" />} label="契約中"   value={stats.active_contracts ?? 0} sub={`返却予定 ${stats.return_pending ?? 0} 件`} />
        <KpiCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="今月の売上" value={monthlyRevenue > 0 ? fmt(monthlyRevenue) : '—'} sub="確定済み金額" dark />
      </div>

      {/* 車両内訳 */}
      <VehicleBreakdown stats={stats} />

      {/* 3パネル行 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionPanel stats={actionStats} />
        <NotificationsPanel />
        <RecentContractsPanel contracts={contracts} />
      </div>

      {/* 審査中バナー */}
      {me?.status === 'prospect' && (
        <div className="border border-border bg-muted/40 rounded-xl p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">審査中です</p>
            <p className="text-xs text-muted-foreground mt-0.5">管理者が申請内容を確認しています。承認完了後にすべての機能が使えるようになります。</p>
          </div>
        </div>
      )}
    </div>
  );
}
