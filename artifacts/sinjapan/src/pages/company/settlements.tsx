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

  const availableMonths = Array.from(new Set(rows.map(r => r.period_month).filter(Boolean))).sort().reverse() as string[];
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || availableMonths[0] || currentYM);
  const [companyInfo, setCompanyInfo]     = useState<any>(null);

  useEffect(() => { if (initialMonth) setSelectedMonth(initialMonth); }, [initialMonth]);

  useEffect(() => {
    fetch(API('/company/me'), { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setCompanyInfo(d))
      .catch(() => {});
  }, []);

  const monthRows    = rows.filter(r => (r.period_month ?? '').startsWith(selectedMonth));
  const totalPayout  = monthRows.reduce((s, r) => s + Number(r.rental_company_amount ?? 0), 0);
  const totalBlack   = monthRows.reduce((s, r) => s + Number(r.black_number_fee ?? 0), 0);
  const totalUser    = monthRows.reduce((s, r) => s + Number(r.user_payment_amount ?? 0), 0);
  const subtotal     = totalPayout + totalBlack;
  const tax          = Math.round(subtotal * 0.1);
  const totalWithTax = subtotal + tax;

  const fmtMonth = (ym: string) => { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月`; };

  // 末締め翌月末：選択月の翌月最終日
  const dueDate = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 0 + 1, 0, 0, 0);   // 翌月1日
    d.setMonth(d.getMonth() + 1);                 // さらに1ヶ月 → 翌々月1日
    d.setDate(0);                                  // 1日前 = 翌月末
    // 実は：翌月末 = new Date(y, m, 0) → mは0-indexed不要でOK
    const due = new Date(y, m, 0); // Date(y, m, 0) = 翌月0日 = 当月末 → need next month end
    // 末締め翌月末: issue month end = selectedMonth end, payment due = next month end
    const nextMonthEnd = new Date(y, m + 1, 0); // month is 0-based, m is already 1-based parsed value
    return format(nextMonthEnd, 'yyyy年M月d日');
  })();

  const issueDate = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const monthEnd = new Date(y, m, 0);
    return format(monthEnd, 'yyyy年M月d日');
  })();

  const yenPdf = (n: number) => `¥${new Intl.NumberFormat('ja-JP').format(Math.round(n))}`;

  const handlePrint = () => {
    const bankInfo  = companyInfo?.bank_information || companyInfo?.payment_info || '';
    const rcName    = companyInfo?.company_name || companyInfo?.name || '—';
    const rcAddress = companyInfo?.address || '';
    const rcPhone   = companyInfo?.company_phone || companyInfo?.phone || '';

    const rowsHtml = monthRows.map(r => `
      <tr>
        <td class="mono">${r.contract_number ?? '—'}</td>
        <td>${r.maker && r.model ? `${r.maker} ${r.model}` : '—'}</td>
        <td>${r.user_name ?? '—'}</td>
        <td class="right">${yenPdf(Number(r.rental_company_amount ?? 0))}</td>
        <td class="right">${Number(r.black_number_fee) > 0 ? yenPdf(Number(r.black_number_fee)) : '—'}</td>
        <td class="right">${yenPdf(Number(r.rental_company_amount ?? 0) + Number(r.black_number_fee ?? 0))}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
      <title>支払通知書 ${fmtMonth(selectedMonth)}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; padding: 32px 40px; }
        h1 { font-size: 22px; font-weight: 700; text-align: center; margin-bottom: 24px; letter-spacing: 0.1em; }
        .meta { display: flex; justify-content: flex-end; font-size: 11px; color: #444; margin-bottom: 20px; }
        .meta td { padding: 2px 6px; }
        .parties { display: flex; gap: 32px; margin-bottom: 24px; }
        .party { flex: 1; border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px 16px; }
        .party-title { font-size: 10px; color: #888; margin-bottom: 6px; font-weight: 600; letter-spacing: 0.05em; }
        .party-name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
        .party-detail { font-size: 10px; color: #555; line-height: 1.7; white-space: pre-wrap; }
        .period-box { background: #f4f4f5; border-radius: 6px; padding: 10px 16px; margin-bottom: 20px; font-size: 12px; }
        .period-box span { font-weight: 700; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #18181b; color: #fff; text-align: left; padding: 7px 10px; font-weight: 600; font-size: 10px; }
        th.right, td.right { text-align: right; }
        td { padding: 7px 10px; border-bottom: 1px solid #e4e4e7; font-size: 11px; }
        td.mono { font-family: monospace; font-size: 10px; color: #666; }
        tfoot td { background: #f4f4f5; font-weight: 600; }
        .totals { margin-left: auto; width: 280px; border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden; }
        .totals table { margin: 0; }
        .totals td { padding: 8px 14px; }
        .totals .total-row td { background: #18181b; color: #fff; font-weight: 700; font-size: 13px; }
        .bank-box { margin-top: 24px; border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px 16px; }
        .bank-title { font-size: 10px; color: #888; font-weight: 600; letter-spacing: 0.05em; margin-bottom: 6px; }
        .bank-content { font-size: 12px; white-space: pre-wrap; line-height: 1.8; }
        .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #aaa; }
      </style></head><body>
      <h1>支払通知書</h1>
      <table class="meta"><tbody>
        <tr><td>発行日</td><td>${issueDate}</td></tr>
        <tr><td>支払期日</td><td><strong>${dueDate}</strong>（末締め翌月末）</td></tr>
      </tbody></table>

      <div class="parties">
        <div class="party">
          <div class="party-title">お支払い元（発行者）</div>
          <div class="party-name">合同会社SIN JAPAN</div>
          <div class="party-detail">〒243-0415 神奈川県愛甲郡愛川町中津7287
TEL: 050-5526-9906
Email: info@sinjapan.jp</div>
        </div>
        <div class="party">
          <div class="party-title">お支払い先（協力会社）</div>
          <div class="party-name">${rcName}</div>
          <div class="party-detail">${[rcAddress, rcPhone ? 'TEL: ' + rcPhone : ''].filter(Boolean).join('\n')}</div>
        </div>
      </div>

      <div class="period-box">
        対象月：<span>${fmtMonth(selectedMonth)}</span>　／　契約件数：<span>${monthRows.length}件</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>契約番号</th>
            <th>車両</th>
            <th>ご利用者</th>
            <th class="right">月額受取</th>
            <th class="right">黒ナンバー取得費</th>
            <th class="right">小計</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>合計 ${monthRows.length}件</strong></td>
            <td class="right">${yenPdf(totalPayout)}</td>
            <td class="right">${totalBlack > 0 ? yenPdf(totalBlack) : '—'}</td>
            <td class="right"><strong>${yenPdf(subtotal)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="totals">
        <table>
          <tbody>
            <tr><td>小計</td><td class="right">${yenPdf(subtotal)}</td></tr>
            <tr><td>消費税（10%）</td><td class="right">${yenPdf(tax)}</td></tr>
          </tbody>
          <tfoot>
            <tr class="total-row"><td>税込合計</td><td class="right">${yenPdf(totalWithTax)}</td></tr>
          </tfoot>
        </table>
      </div>

      ${bankInfo ? `<div class="bank-box">
        <div class="bank-title">振込先口座情報</div>
        <div class="bank-content">${bankInfo}</div>
      </div>` : ''}

      <div class="footer">合同会社SIN JAPAN　／　info@sinjapan.jp　／　050-5526-9906</div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
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

      {/* 明細テーブル */}
      <div>
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

export default function CompanySettlements() {
  const { toast } = useToast();
  const [rows, setRows]       = useState<any[]>([]);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">売上</h1>
          <p className="text-muted-foreground text-sm mt-1">自社車両の月次売上・精算明細を確認します。</p>
        </div>
        <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DetailTable rows={rows} initialMonth="" />
      )}
    </div>
  );
}
