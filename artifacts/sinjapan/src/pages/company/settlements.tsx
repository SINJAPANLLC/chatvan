import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Calendar, Receipt, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });
const fmt = (n: any) => (n != null && n !== '') ? '¥' + Number(n).toLocaleString() : '—';

const STATUS_LABEL: Record<string, string> = {
  pending: '精算待ち', processing: '処理中', completed: '完了', on_hold: '保留', cancelled: 'キャンセル',
};
const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-blue-50 text-blue-700 border border-blue-200',
  completed:  'bg-green-50 text-green-700 border border-green-200',
  on_hold:    'bg-amber-50 text-amber-700 border border-amber-200',
  cancelled:  'bg-gray-50 text-gray-500',
};

export default function CompanySettlements() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API('/company/settlements'), { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast({ variant: 'destructive', title: '読み込み失敗' }))
      .finally(() => setLoading(false));
  }, []);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const totalCompleted  = rows.filter(r => r.status === 'completed').reduce((s, r) => s + Number(r.rental_company_amount ?? 0), 0);
  const thisMonthAmount = rows.filter(r => r.period_month === thisMonth).reduce((s, r) => s + Number(r.rental_company_amount ?? 0), 0);
  const completedCount  = rows.filter(r => r.status === 'completed').length;

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">売上</h1>
        <p className="text-sm text-muted-foreground mt-1">月次の支払い・精算状況を確認できます。</p>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border shadow-sm bg-foreground text-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-background/60 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />合計受取金額（完了分）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{'¥' + totalCompleted.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />今月の売上
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{'¥' + thisMonthAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />精算完了件数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedCount}<span className="text-lg font-normal text-muted-foreground ml-1">件</span></div>
          </CardContent>
        </Card>
      </div>

      {/* テーブル */}
      {rows.length === 0 ? (
        <Card className="border-border shadow-sm">
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">精算データはまだありません</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border shadow-sm overflow-hidden p-0">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {['対象月', '車両', 'ご利用者', 'ユーザー入金', 'SIN JAPAN手数料', '受取額', 'ステータス', '精算予定日'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.period_month ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
                    <td className="px-4 py-3 text-xs">{r.user_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{fmt(r.user_payment_amount)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.chat_van_fee)}</td>
                    <td className="px-4 py-3 text-sm font-semibold">{fmt(r.rental_company_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.scheduled_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
