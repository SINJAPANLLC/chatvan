import React, { useEffect, useState } from 'react';
import { useGetVanDashboard } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import {
  Loader2, Car, FileText, CheckCircle2,
  AlertTriangle, Wrench, RotateCcw, CreditCard,
  Flame, Bell, ChevronLeft, ChevronRight, CalendarDays,
  Receipt, ShieldCheck, TrendingUp,
} from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

// ── 型 ────────────────────────────────────────────────────────────────────────
interface Notification { id: number; title: string; message: string; readStatus: boolean; createdAt: string; }
interface CalEvent { date: string; type: 'return' | 'delivery' | 'insurance' | 'incident'; label: string; id: number; }

// カレンダードット：予定の種類を色で区別
const EVENT_DOT: Record<string, string> = {
  return:    'bg-orange-500',
  delivery:  'bg-sky-500',
  insurance: 'bg-amber-500',
  incident:  'bg-rose-500',
};
const EVENT_ICON: Record<string, React.ReactNode> = {
  return:    <RotateCcw className="h-3 w-3" />,
  delivery:  <Car className="h-3 w-3" />,
  insurance: <AlertTriangle className="h-3 w-3" />,
  incident:  <Flame className="h-3 w-3" />,
};

// ── KPI カード ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, dark }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; dark?: boolean }) {
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

// ── 未対応一覧 ────────────────────────────────────────────────────────────────
function UnresolvedPanel({ stats }: { stats: any }) {
  const items = [
    { label: '事故・トラブル報告',   count: stats.openIncidents    ?? 0, icon: <Flame       className="h-4 w-4 text-foreground" />, href: '/admin/incidents', urgent: true  },
    { label: '未決済契約',           count: stats.unpaidContracts  ?? 0, icon: <CreditCard   className="h-4 w-4 text-foreground" />, href: '/admin/contracts', urgent: true  },
    { label: '決済失敗（7日以内）',  count: stats.paymentFailures7d ?? 0, icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />, href: '/admin/contracts', urgent: false },
    { label: '車両故障報告',          count: stats.openBreakdowns   ?? 0, icon: <Wrench       className="h-4 w-4 text-muted-foreground" />, href: '/admin/contracts', urgent: false },
    { label: '返却申請（未対応）',   count: stats.pendingReturns   ?? 0, icon: <RotateCcw    className="h-4 w-4 text-muted-foreground" />, href: '/admin/contracts', urgent: false },
    { label: '保険期限切れ・30日以内', count: stats.insuranceAlerts ?? 0, icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />, href: '/admin/contracts', urgent: false },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-foreground" />
          未対応一覧
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
              {item.icon}
              <span className="text-xs flex-1">{item.label}</span>
              <span className={`text-sm font-bold tabular-nums ${
                item.count > 0 ? 'text-foreground' : 'text-muted-foreground'
              }`}>
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API('/notifications'), { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setNotifications(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id: number) => {
    await fetch(API(`/notifications/${id}/read`), { method: 'PATCH', headers: authHeader() });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, readStatus: true } : n));
  };

  const unread = notifications.filter(n => !n.readStatus).length;

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
        ) : notifications.slice(0, 30).map(n => (
          <div
            key={n.id}
            onClick={() => !n.readStatus && markRead(n.id)}
            className={`px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
              n.readStatus ? 'text-muted-foreground hover:bg-muted/30' : 'bg-muted border border-border hover:bg-muted/70'
            }`}
          >
            <div className="flex items-start gap-2">
              {!n.readStatus && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${n.readStatus ? '' : 'text-foreground'}`}>{n.title}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-muted-foreground/70 mt-1">{new Date(n.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          </div>
        ))}
        {notifications.length > 30 && (
          <p className="text-center text-xs text-muted-foreground pt-2">最新30件を表示</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── カレンダーパネル ──────────────────────────────────────────────────────────
function CalendarPanel() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch(API('/van/dashboard/calendar'), { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setEvents(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const eventsByDate = events.reduce<Record<string, CalEvent[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});

  const dateStr = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const selectedEvents = selected ? (eventsByDate[selected] ?? []) : [];

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); setSelected(null); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); setSelected(null); };

  return (
    <Card className="border-border shadow-sm flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          カレンダー
          <div className="ml-auto flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 hover:bg-muted rounded-md transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs font-medium w-20 text-center">{year}年{month + 1}月</span>
            <button onClick={nextMonth} className="p-1 hover:bg-muted rounded-md transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 text-center">
              {['日','月','火','水','木','金','土'].map(d => (
                <span key={d} className="text-xs font-medium pb-1 text-muted-foreground">{d}</span>
              ))}
            </div>
            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = i + 1;
                const ds = dateStr(d);
                const dayEvents = eventsByDate[ds] ?? [];
                const isToday = ds === todayStr;
                const isSelected = ds === selected;
                return (
                  <button key={d} onClick={() => setSelected(isSelected ? null : ds)}
                    className={`flex flex-col items-center py-1 rounded-lg text-xs transition-colors ${
                      isSelected ? 'bg-foreground text-background' :
                      isToday    ? 'bg-muted font-bold border border-border' : 'hover:bg-muted'
                    }`}>
                    <span className="leading-tight">{d}</span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                        {dayEvents.slice(0, 3).map((e, ei) => (
                          <span key={ei} className={`h-1.5 w-1.5 rounded-full ${EVENT_DOT[e.type] ?? 'bg-foreground/50'} ${isSelected ? 'opacity-60' : ''}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* 凡例 */}
            <div className="flex gap-3 flex-wrap pt-1 border-t border-border/40">
              {Object.entries({ delivery: '納車', return: '返却', incident: '事故', insurance: '保険期限' }).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${EVENT_DOT[k]}`} />{label}
                </span>
              ))}
            </div>
            {/* 選択日のイベント詳細 */}
            {selected && (
              <div className="border-t border-border/40 pt-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{selected} のイベント</p>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">予定なし</p>
                ) : selectedEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${EVENT_DOT[e.type]}`} />
                    <span className="flex items-center gap-1">{EVENT_ICON[e.type]}{e.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 売上内訳 ──────────────────────────────────────────────────────────────────
function RevenueBreakdown({ stats, fmt }: { stats: any; fmt: (v: number) => string }) {
  const items = [
    {
      label: 'カード売上',
      value: fmt(stats.cardRevenue ?? 0),
      sub: 'Square決済累計',
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      label: '請求書売上',
      value: fmt(stats.invoiceRevenue ?? 0),
      sub: '振込・請求累計',
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: '黒ナンバー売上',
      value: fmt(stats.blackNumberRevenue ?? 0),
      sub: `利用中・完了 ${stats.blackNumberCount ?? 0}件`,
      icon: <Car className="h-4 w-4" />,
    },
    {
      label: '保険紹介',
      value: `${stats.insuranceCount ?? 0} 件`,
      sub: '紹介申請累計',
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      label: '今月の粗利',
      value: fmt(stats.thisMonthGrossProfit ?? 0),
      sub: `売上見込 ${fmt(stats.thisMonthRevenue ?? 0)}`,
      icon: <TrendingUp className="h-4 w-4" />,
      accent: true,
    },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <JpyIcon className="h-4 w-4 text-muted-foreground" />
        売上内訳
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map(item => (
          <div key={item.label} className={`border rounded-xl p-4 ${item.accent ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 border-border'}`}>
            <div className={`flex items-center gap-1.5 mb-2 ${item.accent ? 'text-background/70' : 'text-muted-foreground'}`}>
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${item.accent ? 'text-background' : 'text-foreground'}`}>{item.value}</p>
            <p className={`text-xs mt-0.5 ${item.accent ? 'text-background/60' : 'text-muted-foreground'}`}>{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── メイン ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: stats, isLoading } = useGetVanDashboard();

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground mt-1 text-sm">Chat VAN の最新の状況を確認します。</p>
      </div>

      {/* ── Row 1: KPI ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard icon={<FileText className="h-3.5 w-3.5" />}    label="新規相談" value={stats.newConsultations} sub="対応が必要な相談" />
        <KpiCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="契約中"   value={stats.activeContracts}  sub="利用中の契約" />
        <KpiCard icon={<Car className="h-3.5 w-3.5" />}          label="空き車両" value={`${stats.availableVehicles} / ${stats.totalVehicles}`} sub="提案可能な車両" />
      </div>

      {/* ── Row 1.5: 売上内訳 ─────────────────────────────────────────── */}
      <RevenueBreakdown stats={stats} fmt={fmt} />

      {/* ── Row 2: 3パネル ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UnresolvedPanel stats={stats} />
        <NotificationsPanel />
        <CalendarPanel />
      </div>
    </div>
  );
}

function JpyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 9.5V21m0-11.5L6 3m6 6.5L18 3M6 15h12M6 11h12" />
    </svg>
  );
}
