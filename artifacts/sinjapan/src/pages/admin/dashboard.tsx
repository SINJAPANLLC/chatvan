import React from 'react';
import { useGetVanDashboard } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import {
  Loader2, Car, FileText, CheckCircle2,
  AlertTriangle, ShieldAlert, Wrench, RotateCcw,
  CreditCard, Flame, TrendingUp, ScrollText,
} from 'lucide-react';

export default function Dashboard() {
  const { data: stats, isLoading } = useGetVanDashboard();

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fmt = (val: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);

  // リスクアイテム
  const risks: { label: string; count: number; icon: React.ReactNode; href: string; color: string; severity: 'high' | 'mid' | 'low' }[] = [
    {
      label: '事故・トラブル報告',
      count: stats.openIncidents ?? 0,
      icon: <Flame className="h-4 w-4" />,
      href: '/admin/incidents',
      color: 'text-red-600 bg-red-50 border-red-200',
      severity: 'high',
    },
    {
      label: '未決済契約',
      count: stats.unpaidContracts ?? 0,
      icon: <CreditCard className="h-4 w-4" />,
      href: '/admin/contracts',
      color: 'text-red-600 bg-red-50 border-red-200',
      severity: 'high',
    },
    {
      label: '決済失敗（7日以内）',
      count: stats.paymentFailures7d ?? 0,
      icon: <AlertTriangle className="h-4 w-4" />,
      href: '/admin/contracts',
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      severity: 'mid',
    },
    {
      label: '車両故障報告',
      count: stats.openBreakdowns ?? 0,
      icon: <Wrench className="h-4 w-4" />,
      href: '/admin/contracts',
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      severity: 'mid',
    },
    {
      label: '返却申請（未対応）',
      count: stats.pendingReturns ?? 0,
      icon: <RotateCcw className="h-4 w-4" />,
      href: '/admin/contracts',
      color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      severity: 'low',
    },
    {
      label: '保険期限（30日以内）',
      count: stats.insuranceAlerts ?? 0,
      icon: <ShieldAlert className="h-4 w-4" />,
      href: '/admin/contracts',
      color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      severity: 'low',
    },
  ];

  const totalRiskCount = risks.reduce((s, r) => s + r.count, 0);
  const highRisks = risks.filter(r => r.severity === 'high' && r.count > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
          <p className="text-muted-foreground mt-1">Chat VAN の最新の状況を確認します。</p>
        </div>
        {totalRiskCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            要対応 {totalRiskCount}件
          </div>
        )}
      </div>

      {/* ── KPI カード ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />新規相談
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.newConsultations}</div>
            <p className="text-xs text-muted-foreground mt-1">対応が必要な相談</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />契約中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeContracts}</div>
            <p className="text-xs text-muted-foreground mt-1">稼働中の車両</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Car className="h-3.5 w-3.5" />空き車両
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.availableVehicles}
              <span className="text-lg font-normal text-muted-foreground"> / {stats.totalVehicles}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">提案可能な車両</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-foreground text-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-background/70 flex items-center gap-1.5">
              <JpyIcon className="h-3.5 w-3.5" />今月の売上見込
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(stats.thisMonthRevenue)}</div>
            <p className="text-xs text-background/50 mt-1">契約中の月額料金合計</p>
          </CardContent>
        </Card>
      </div>

      {/* ── リスクパネル ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold">リスク・要対応</h2>
          {totalRiskCount === 0 && (
            <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              問題なし
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {risks.map((r) => (
            <Link key={r.label} href={r.href}>
              <div className={`border rounded-xl p-4 cursor-pointer hover:opacity-80 transition-opacity ${
                r.count > 0 ? r.color : 'bg-muted/30 border-border text-muted-foreground'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  {r.icon}
                  <span className={`text-2xl font-bold ${r.count > 0 ? '' : 'text-muted-foreground'}`}>
                    {r.count}
                  </span>
                </div>
                <p className="text-xs font-medium leading-tight">{r.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* 高リスク詳細バナー */}
        {highRisks.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {highRisks.map(r => (
              <Link key={r.label} href={r.href}>
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm hover:bg-red-100 transition-colors cursor-pointer">
                  {r.icon}
                  <span className="font-medium">{r.label}</span>
                  <span className="font-bold ml-auto">{r.count}件 →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── 詳細セクション ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 相談ステータス */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-muted-foreground" />相談ステータス
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="新規（未対応）" value={stats.newConsultations} />
            <Row label="ヒアリング中" value={stats.pendingReview} />
            <Row label="提案送信済" value={stats.proposalSent} />
            <Row label="審査・契約手続中" value={stats.activeApplications} />
          </CardContent>
        </Card>

        {/* 車両・契約 */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />車両・契約
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="稼働中" value={stats.activeContracts} />
            <Row label="間もなく返却予定" value={stats.returningSoon} accent={stats.returningSoon > 0} />
            <Row label="空き車両" value={`${stats.availableVehicles} / ${stats.totalVehicles}`} />
          </CardContent>
        </Card>

        {/* 売上 */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />売上
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="今月の売上見込" value={fmt(stats.thisMonthRevenue)} />
            <Row label="総売上（累積）" value={fmt(stats.totalRevenue)} />
            <Row label="未決済契約" value={stats.unpaidContracts ?? 0} accent={(stats.unpaidContracts ?? 0) > 0} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center pb-2.5 border-b border-border/40 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-red-600' : ''}`}>{value}</span>
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
