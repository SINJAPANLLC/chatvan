import React from 'react';
import { useGetDashboardStats } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = stats as any;
  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

  const todayCards = [
    { label: '本日相談件数',     value: s.todayConsultations, unit: '件' },
    { label: '本日顧客承認件数', value: s.todayApproved,      unit: '件', black: true },
  ];

  const overallCards = [
    { label: '合計相談件数',   value: s.totalConsultations,          unit: '件' },
    { label: '合計顧客承認数', value: s.totalApproved,               unit: '件' },
    { label: '現在手配中件数', value: s.currentlyArranging,          unit: '件', highlight: true },
    { label: '総売上',         value: formatPrice(s.totalRevenue),   unit: '' },
    { label: '粗利益',         value: formatPrice(s.grossProfit),    unit: '' },
    { label: '利益率',         value: formatPercent(s.avgProfitRate),unit: '' },
  ];

  const StatCard = ({ label, value, unit, highlight, black }: { label: string; value: any; unit: string; highlight?: boolean; black?: boolean }) => (
    <Card className={`border-border shadow-sm ${highlight ? 'bg-primary text-primary-foreground' : black ? 'bg-foreground text-background' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm font-medium ${highlight ? 'text-primary-foreground/80' : black ? 'text-background/70' : 'text-muted-foreground'}`}>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}{unit}</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>

      {/* 本日 */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">本日</p>
        <div className="grid grid-cols-2 gap-4">
          {todayCards.map(c => <StatCard key={c.label} {...c} />)}
        </div>
      </div>

      {/* 全体 */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">全体</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {overallCards.map(c => <StatCard key={c.label} {...c} />)}
        </div>
      </div>
    </div>
  );
}
