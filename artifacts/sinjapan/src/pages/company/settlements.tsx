import { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const fmt = (n: any) => (n != null && n !== '') ? '¥' + Number(n).toLocaleString() : '—';

const STATUS_LABEL: Record<string, string> = {
  pending: '精算待ち', processing: '処理中', completed: '完了', on_hold: '保留', cancelled: 'キャンセル',
};

export default function CompanySettlements() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API('/company/settlements'), { headers: { Authorization: `Bearer ${tok()}` } })
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
      <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h1 className="text-xl font-bold">売上</h1>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: TrendingUp, label: '合計受取金額（完了分）', value: '¥' + totalCompleted.toLocaleString() },
          { icon: Calendar,   label: '今月の売上',             value: '¥' + thisMonthAmount.toLocaleString() },
          { icon: Receipt,    label: '精算完了件数',           value: completedCount + ' 件' },
        ].map((c, i) => (
          <div key={i} className="border border-border rounded-xl p-4 bg-card">
            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center mb-3">
              <c.icon className="h-4 w-4 text-foreground" />
            </div>
            <p className="text-2xl font-bold tracking-tight">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* テーブル */}
      {rows.length === 0 ? (
        <div className="border border-border rounded-xl p-12 text-center space-y-2">
          <TrendingUp className="h-7 w-7 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">精算データはまだありません</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {['対象月', '車両', 'ご利用者', 'ユーザー入金', 'SIN JAPAN手数料', '受取額', 'ステータス', '精算予定日'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{r.period_month ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.user_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{fmt(r.user_payment_amount)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.chat_van_fee)}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{fmt(r.rental_company_amount)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.scheduled_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
