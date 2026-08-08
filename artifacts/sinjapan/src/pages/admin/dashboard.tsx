import React from 'react';
import { useGetVanDashboard } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Car, Calendar, FileText, CheckCircle2 } from 'lucide-react';

export default function Dashboard() {
  const { data: stats, isLoading } = useGetVanDashboard();

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground mt-1">Chat VAN の最新の状況を確認します。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              新規相談
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.newConsultations}</div>
            <p className="text-xs text-muted-foreground mt-1">対応が必要な相談</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              契約中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeContracts}</div>
            <p className="text-xs text-muted-foreground mt-1">現在稼働中の車両</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
              <Car className="h-4 w-4 mr-2" />
              空き車両数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.availableVehicles} <span className="text-lg font-normal text-muted-foreground">/ {stats.totalVehicles}</span></div>
            <p className="text-xs text-muted-foreground mt-1">現在提案可能な車両</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-foreground text-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-background/80 flex items-center">
              <JapaneseYenIcon className="h-4 w-4 mr-2" />
              今月の売上見込
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatPrice(stats.thisMonthRevenue)}</div>
            <p className="text-xs text-background/60 mt-1">契約中の月額料金合計</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">相談ステータス</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">要確認（確認中）</span>
                <span className="font-semibold">{stats.pendingReview}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">提案送信済</span>
                <span className="font-semibold">{stats.proposalSent}</span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-sm text-muted-foreground">アクティブな案件合計</span>
                <span className="font-semibold">{stats.activeApplications}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">車両・契約情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">間もなく返却予定</span>
                <span className="font-semibold">{stats.returningSoon}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">総売上（累積）</span>
                <span className="font-semibold">{formatPrice(stats.totalRevenue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JapaneseYenIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}>
      <path d="M12 9.5V21m0-11.5L6 3m6 6.5L18 3M6 15h12M6 11h12" />
    </svg>
  );
}
