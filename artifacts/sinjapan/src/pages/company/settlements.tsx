import { useState, useEffect } from 'react';
import { Receipt, TrendingUp, Calendar, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const fmt = (n: any) => (n != null && n !== '') ? '¥' + Number(n).toLocaleString() : '—';

const STATUS_LABEL: Record<string, string> = {
  pending: '精算待ち', processing: '処理中', completed: '完了', on_hold: '保留', cancelled: 'キャンセル',
};
const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  completed:  'bg-green-100 text-green-700',
  on_hold:    'bg-amber-100 text-amber-700',
  cancelled:  'bg-zinc-100 text-zinc-600',
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
  const totalCompleted = rows.filter(r => r.status === 'completed').reduce((s, r) => s + Number(r.rental_company_amount || 0), 0);
  const thisMonthPending = rows.filter(r => r.period_month === thisMonth && r.status === 'pending').reduce((s, r) => s + Number(r.rental_company_amount || 0), 0);
  const completedCount = rows.filter(r => r.status === 'completed').length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />支払い明細
        </h1>
        <p className="text-sm text-muted-foreground mt-1">月次の支払い・精算状況を確認できます。</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: TrendingUp, label: '合計受取金額（完了分）', value: '¥' + totalCompleted.toLocaleString(), color: 'text-green-600' },
          { icon: Calendar,   label: '今月予定額',             value: '¥' + thisMonthPending.toLocaleString(), color: 'text-amber-600' },
          { icon: Receipt,    label: '精算完了件数',           value: completedCount + ' 件',                  color: 'text-blue-600' },
        ].map((c, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="p-2.5 bg-muted rounded-xl">
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          精算データはまだありません
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['対象月','契約番号','車両','ご利用者','ユーザー入金','SIN JAPAN手数料','受取額','ステータス','精算予定日'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{r.period_month}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.contract_number || '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.user_name || '—'}</td>
                  <td className="px-4 py-3 text-xs">{fmt(r.user_payment_amount)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(r.chat_van_fee)}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{fmt(r.rental_company_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.scheduled_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
