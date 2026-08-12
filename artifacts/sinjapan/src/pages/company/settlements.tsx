import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, TrendingUp, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, isValid } from 'date-fns';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const yen = (n: number) => `¥ ${new Intl.NumberFormat('ja-JP').format(Math.round(n))}`;

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: '精算待ち', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  processing: { label: '処理中',   cls: 'bg-blue-50 text-blue-700 border-blue-200'     },
  completed:  { label: '完了',     cls: 'bg-green-100 text-green-700 border-green-200' },
  on_hold:    { label: '保留',     cls: 'bg-gray-100 text-gray-600 border-gray-200'    },
  cancelled:  { label: 'キャンセル',cls: 'bg-red-50 text-red-700 border-red-200'       },
};

// ─── 月次サマリーテーブル ───────────────────────────────────────────────────────
function MonthlyTable({ rows }: { rows: any[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  // year に対応する12か月グリッドを rows から集計
  const grid = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const month_rows = rows.filter(r => (r.period_month ?? '').startsWith(key));
    const amount  = month_rows.reduce((s, r) => s + Number(r.rental_company_amount ?? 0), 0);
    const count   = month_rows.length;
    const done    = month_rows.filter(r => r.status === 'completed').length;
    return { key, amount, count, done };
  });

  const totals = grid.reduce((acc, r) => ({
    amount: acc.amount + r.amount,
    count:  acc.count  + r.count,
    done:   acc.done   + r.done,
  }), { amount: 0, count: 0, done: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${year === y ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {y}年
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">月</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">受取額</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">件数</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">完了</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {grid.map((r, i) => {
              const isEmpty = r.amount === 0 && r.count === 0;
              return (
                <tr key={r.key} className={isEmpty ? 'opacity-40' : ''}>
                  <td className="px-5 py-3 font-medium">{MONTHS[i]}</td>
                  <td className="px-5 py-3 text-right font-semibold">{isEmpty ? '—' : yen(r.amount)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : `${r.count}件`}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : `${r.done}件`}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-foreground text-background">
              <td className="px-5 py-3.5 font-bold">合計</td>
              <td className="px-5 py-3.5 text-right font-bold">{yen(totals.amount)}</td>
              <td className="px-5 py-3.5 text-right opacity-75">{totals.count}件</td>
              <td className="px-5 py-3.5 text-right opacity-75">{totals.done}件</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── 明細テーブル ──────────────────────────────────────────────────────────────
function DetailTable({ rows }: { rows: any[] }) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const filtered = rows.filter(r => {
    if (filter === 'pending')   return r.status !== 'completed';
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  const pendingCount   = rows.filter(r => r.status !== 'completed').length;
  const completedCount = rows.filter(r => r.status === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {[
          { key: 'pending',   label: '精算待ち', count: pendingCount   },
          { key: 'completed', label: '完了',     count: completedCount },
          { key: 'all',       label: '全て'                            },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key as any)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${filter === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">対象月</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">車両</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">ご利用者</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">ユーザー入金</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">手数料</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">受取額</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">ステータス</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">精算予定日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  <Receipt className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                  精算データはまだありません
                </td>
              </tr>
            ) : filtered.map(r => {
              const st = STATUS[r.status] ?? STATUS.pending;
              return (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.period_month ? (() => { const [y,m] = String(r.period_month).split('-'); return m ? `${y}年${Number(m)}月` : r.period_month; })() : '—'}</td>
                  <td className="px-5 py-3.5">{r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{r.user_name ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right">{r.user_payment_amount != null ? yen(Number(r.user_payment_amount)) : '—'}</td>
                  <td className="px-5 py-3.5 text-right text-muted-foreground">{r.chat_van_fee != null ? yen(Number(r.chat_van_fee)) : '—'}</td>
                  <td className="px-5 py-3.5 text-right font-semibold">{r.rental_company_amount != null ? yen(Number(r.rental_company_amount)) : '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.scheduled_date ? (() => { try { const p = parseISO(r.scheduled_date); return isValid(p) ? format(p, 'yyyy/MM/dd') : r.scheduled_date; } catch { return r.scheduled_date; } })() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── メインページ ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'monthly', label: '月次売上' },
  { key: 'detail',  label: '明細'     },
];

export default function CompanySettlements() {
  const { toast } = useToast();
  const [tab, setTab] = useState('monthly');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(API('/company/settlements'), { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast({ variant: 'destructive', title: '読み込みに失敗しました' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">売上</h1>
          <p className="text-muted-foreground text-sm mt-1">自社車両の月次売上・精算明細を確認します。</p>
        </div>
        <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'monthly' && <MonthlyTable rows={rows} />}
          {tab === 'detail'  && <DetailTable  rows={rows} />}
        </>
      )}
    </div>
  );
}
