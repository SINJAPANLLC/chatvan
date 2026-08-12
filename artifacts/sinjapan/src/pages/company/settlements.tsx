import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, FileDown } from 'lucide-react';
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
function MonthlyTable({ rows, onMonthClick }: { rows: any[]; onMonthClick: (key: string) => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const grid = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const month_rows = rows.filter(r => (r.period_month ?? '').startsWith(key));
    const amount = month_rows.reduce((s, r) => s + Number(r.rental_company_amount ?? 0) + Number(r.black_number_fee ?? 0), 0);
    const count  = month_rows.length;
    const done   = month_rows.filter(r => r.status === 'completed').length;
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
                <tr key={r.key}
                  className={`transition-colors ${isEmpty ? 'opacity-40' : 'cursor-pointer hover:bg-muted/30'}`}
                  onClick={() => !isEmpty && onMonthClick(r.key)}>
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
              <td className="px-5 py-3.5 text-right">{totals.count}件</td>
              <td className="px-5 py-3.5 text-right">{totals.done}件</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">行をクリックすると明細を確認できます</p>
    </div>
  );
}

// ─── 明細テーブル ──────────────────────────────────────────────────────────────
function DetailTable({ rows, initialMonth }: { rows: any[]; initialMonth: string }) {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 利用可能な月一覧（データがある月）
  const availableMonths = Array.from(new Set(rows.map(r => r.period_month).filter(Boolean))).sort().reverse() as string[];
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || availableMonths[0] || currentYM);
  const printRef = useRef<HTMLDivElement>(null);

  // 親からinitialMonthが変わったら追従
  useEffect(() => { if (initialMonth) setSelectedMonth(initialMonth); }, [initialMonth]);

  const monthRows = rows.filter(r => (r.period_month ?? '').startsWith(selectedMonth));
  const totalPayout  = monthRows.reduce((s, r) => s + Number(r.rental_company_amount ?? 0), 0);
  const totalBlack   = monthRows.reduce((s, r) => s + Number(r.black_number_fee ?? 0), 0);
  const totalUser    = monthRows.reduce((s, r) => s + Number(r.user_payment_amount ?? 0), 0);
  const subtotal     = totalPayout + totalBlack;
  const totalWithTax = Math.round(subtotal * 1.1);

  const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月`; };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
      <title>売上明細 ${fmtMonth(selectedMonth)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #666; font-size: 11px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f4f4f5; text-align: left; padding: 8px 10px; font-weight: 600; border-bottom: 2px solid #e4e4e7; font-size: 11px; }
        td { padding: 8px 10px; border-bottom: 1px solid #e4e4e7; }
        .right { text-align: right; }
        tfoot td { font-weight: 700; background: #18181b; color: #fff; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; border: 1px solid; }
        .pending { background:#fefce8; color:#854d0e; border-color:#fde047; }
        .completed { background:#f0fdf4; color:#166534; border-color:#86efac; }
      </style></head><body>
      <h1>売上明細</h1>
      <div class="sub">対象月：${fmtMonth(selectedMonth)}　印刷日：${format(new Date(), 'yyyy/MM/dd')}</div>
      ${el.innerHTML}
    </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  return (
    <div className="space-y-4">
      {/* 月セレクター + PDF ボタン */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">対象月</span>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-foreground">
            {availableMonths.length === 0
              ? <option value={currentYM}>{fmtMonth(currentYM)}</option>
              : availableMonths.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
        <button
          onClick={handlePrint}
          disabled={monthRows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40">
          <FileDown className="h-4 w-4" />
          PDF出力
        </button>
      </div>

      {/* サマリーカード */}
      {monthRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: '件数',           value: `${monthRows.length}件` },
            { label: '月額受取合計',   value: yen(totalPayout) },
            { label: '黒ナンバー合計', value: yen(totalBlack) },
            { label: '小計',           value: yen(subtotal) },
            { label: '税込合計',       value: yen(totalWithTax), bold: true },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
              <div className={`text-lg ${c.bold ? 'font-bold' : 'font-semibold'}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 明細テーブル（PDF用） */}
      <div ref={printRef}>
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">契約番号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">車両</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ご利用者</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">月額受取</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">黒ナンバー取得費</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {monthRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    この月の明細データはありません
                  </td>
                </tr>
              ) : monthRows.map(r => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">{r.contract_number ?? '—'}</td>
                  <td className="px-4 py-3.5">{r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{r.user_name ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right font-semibold">{yen(Number(r.rental_company_amount ?? 0))}</td>
                  <td className="px-4 py-3.5 text-right text-muted-foreground">
                    {Number(r.black_number_fee) > 0 ? yen(Number(r.black_number_fee)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {monthRows.length > 0 && (
              <tfoot>
                <tr className="bg-foreground text-background">
                  <td colSpan={3} className="px-4 py-3.5 font-bold">合計 {monthRows.length}件</td>
                  <td className="px-4 py-3.5 text-right font-bold">{yen(totalPayout)}</td>
                  <td className="px-4 py-3.5 text-right font-bold">{totalBlack > 0 ? yen(totalBlack) : '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
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
  const [tab, setTab]               = useState('monthly');
  const [rows, setRows]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [jumpMonth, setJumpMonth]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(API('/company/settlements'), { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast({ variant: 'destructive', title: '読み込みに失敗しました' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMonthClick = (key: string) => {
    setJumpMonth(key);
    setTab('detail');
  };

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
          {tab === 'monthly' && <MonthlyTable rows={rows} onMonthClick={handleMonthClick} />}
          {tab === 'detail'  && <DetailTable  rows={rows} initialMonth={jumpMonth} />}
        </>
      )}
    </div>
  );
}
