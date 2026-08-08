import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ─── helpers ─────────────────────────────────────────────────────────────────
const yen = (n: number) => `¥ ${new Intl.NumberFormat('ja-JP').format(Math.round(n))}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft:   { label: '下書き',   cls: 'bg-muted text-muted-foreground border-border' },
  sent:    { label: '送付済み', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  paid:    { label: '入金済み', cls: 'bg-green-100 text-green-700 border-green-200' },
  overdue: { label: '期限超過', cls: 'bg-red-100 text-red-700 border-red-200' },
};

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  '未決済':       { label: '未決済',       cls: 'bg-muted text-muted-foreground border-border' },
  '決済処理中':   { label: '決済処理中',   cls: 'bg-muted text-muted-foreground border-border' },
  '決済完了':     { label: '決済完了',     cls: 'bg-foreground text-background border-foreground' },
  '入金確認済み': { label: '消し込み済み', cls: 'bg-muted text-muted-foreground border-border' },
  '請求書発行済み':{ label: '請求書',      cls: 'bg-muted text-foreground border-foreground' },
  '返金済み':     { label: '返金済み',     cls: 'bg-muted text-muted-foreground border-border' },
};

// ─── sub-components ───────────────────────────────────────────────────────────

function DrillDown({ year, month, label, onClose }: { year: number; month: string; label: string; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/admin/finance/pl/shipments?year=${year}&month=${month}`)
      .then(setRows).finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div className="mt-1 mb-2">
      <div className="rounded-xl border border-border bg-muted/30 shadow-inner overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground">{label}の案件明細</span>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">✕ 閉じる</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">確定済み案件はありません</p>
        ) : (
          <table className="w-full text-xs min-w-[680px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">案件#</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">顧客</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">運送会社</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">区間</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">売上</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">原価</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">粗利</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground font-mono">#{s.id}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{s.companyName || s.userName || '—'}</div>
                    {s.companyName && <div className="text-muted-foreground">{s.userName}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{s.carrierName || '未手配'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">
                    {s.pickupAddress && s.deliveryAddress ? `${s.pickupAddress} → ${s.deliveryAddress}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold">{yen(s.customerPrice)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{yen(s.carrierCost)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${s.grossProfit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {yen(s.grossProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PLTable({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await apiFetch(`/api/admin/finance/pl?year=${year}`)); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); setOpenMonth(null); }, [load]);

  // 12ヶ月分のデータを埋める
  const monthMap = Object.fromEntries(rows.map(r => [r.month, r]));
  const grid = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return monthMap[key] ?? { month: key, revenue: 0, cost: 0, grossProfit: 0, profitRate: 0, cardRevenue: 0, invoiceRevenue: 0, confirmedShipments: 0 };
  });

  const totals = grid.reduce((acc, r) => ({
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.cost,
    grossProfit: acc.grossProfit + r.grossProfit,
    confirmedShipments: acc.confirmedShipments + r.confirmedShipments,
    cardRevenue: acc.cardRevenue + r.cardRevenue,
    invoiceRevenue: acc.invoiceRevenue + r.invoiceRevenue,
  }), { revenue: 0, cost: 0, grossProfit: 0, confirmedShipments: 0, cardRevenue: 0, invoiceRevenue: 0 });

  return (
    <div className="space-y-4">
      {/* 年選択 */}
      <div className="flex items-center gap-2">
        {years.map(y => (
          <button key={y} onClick={() => setYear(y)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${year === y ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            {y}年
          </button>
        ))}
        <button onClick={load} className="ml-2 text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-0">
          <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">月</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">売上</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground text-xs">うちカード</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground text-xs">うち請求書</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">原価</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">粗利</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">利益率</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">確定件数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {grid.map((r, i) => {
                  const isEmpty = r.revenue === 0 && r.cost === 0;
                  const monthKey = String(i + 1).padStart(2, '0');
                  const isOpen = openMonth === r.month;
                  return (
                    <React.Fragment key={r.month}>
                      <tr
                        onClick={() => !isEmpty && setOpenMonth(isOpen ? null : r.month)}
                        className={`transition-colors ${isEmpty ? 'opacity-40' : 'cursor-pointer hover:bg-muted/30'} ${isOpen ? 'bg-muted/20' : ''}`}
                      >
                        <td className="px-5 py-3 font-medium">
                          <span className="flex items-center gap-1.5">
                            {!isEmpty && (
                              <span className={`text-xs text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''} inline-block`}>▶</span>
                            )}
                            {MONTHS[i]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold">{isEmpty ? '—' : yen(r.revenue)}</td>
                        <td className="px-5 py-3 text-right text-xs text-muted-foreground">{isEmpty ? '—' : yen(r.cardRevenue)}</td>
                        <td className="px-5 py-3 text-right text-xs text-muted-foreground">{isEmpty ? '—' : yen(r.invoiceRevenue)}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : yen(r.cost)}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${r.grossProfit < 0 ? 'text-red-600' : ''}`}>
                          {isEmpty ? '—' : yen(r.grossProfit)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : pct(r.profitRate)}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : `${r.confirmedShipments}件`}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="px-4 py-0">
                            <DrillDown
                              year={year}
                              month={monthKey}
                              label={`${year}年${MONTHS[i]}`}
                              onClose={() => setOpenMonth(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-foreground text-background">
                  <td className="px-5 py-3.5 font-bold">合計</td>
                  <td className="px-5 py-3.5 text-right font-bold">{yen(totals.revenue)}</td>
                  <td className="px-5 py-3.5 text-right text-sm opacity-75">{yen(totals.cardRevenue)}</td>
                  <td className="px-5 py-3.5 text-right text-sm opacity-75">{yen(totals.invoiceRevenue)}</td>
                  <td className="px-5 py-3.5 text-right opacity-75">{yen(totals.cost)}</td>
                  <td className="px-5 py-3.5 text-right font-bold">{yen(totals.grossProfit)}</td>
                  <td className="px-5 py-3.5 text-right opacity-75">
                    {totals.revenue > 0 ? pct(Math.round(totals.grossProfit / totals.revenue * 1000) / 10) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right opacity-75">{totals.confirmedShipments}件</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 請求書消し込み ────────────────────────────────────────────────────────────
function InvoiceReconcile() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'overdue' | 'paid'>('all');
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setInvoices(await apiFetch('/api/admin/finance/invoices')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);

  const counts: Record<string, number> = {};
  for (const i of invoices) counts[i.status] = (counts[i.status] || 0) + 1;

  const act = async (id: number, endpoint: string) => {
    setActing(id);
    try {
      await apiFetch(`/api/admin/invoices/${id}/${endpoint}`, { method: 'PATCH', body: '{}' });
      toast({ title: '更新しました' });
      load();
    } catch { toast({ variant: 'destructive', title: '操作に失敗しました' }); }
    finally { setActing(null); }
  };

  const FILTER_TABS = [
    { key: 'all', label: '全て' }, { key: 'draft', label: '下書き' },
    { key: 'sent', label: '送付済み' }, { key: 'overdue', label: '期限超過' }, { key: 'paid', label: '入金済み' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key as any)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${filter === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {t.key !== 'all' && (counts[t.key] ?? 0) > 0 && (
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">請求書番号</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">顧客</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">対象期間</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">金額</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">支払期限</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">ステータス</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">入金日</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">請求書はありません</td></tr>
            ) : filtered.map(inv => {
              const st = INV_STATUS[inv.status] ?? INV_STATUS.draft;
              const isAct = acting === inv.id;
              return (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{inv.companyName || inv.userName}</div>
                    {inv.companyName && <div className="text-xs text-muted-foreground">{inv.userName}</div>}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{inv.periodStart} 〜 {inv.periodEnd}</td>
                  <td className="px-5 py-3.5 text-right font-semibold">{yen(inv.totalAmount)}</td>
                  <td className="px-5 py-3.5 text-sm">{inv.dueDate || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">
                    {inv.paidAt ? format(new Date(inv.paidAt), 'yyyy/MM/dd') : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2 justify-end">
                      {inv.status === 'draft' && (
                        <Button size="sm" variant="outline" disabled={isAct} onClick={() => act(inv.id, 'send')} className="gap-1 text-xs">
                          {isAct ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}送付済み
                        </Button>
                      )}
                      {(inv.status === 'sent' || inv.status === 'overdue') && (
                        <Button size="sm" disabled={isAct} onClick={() => act(inv.id, 'paid')} className="gap-1 text-xs bg-green-600 hover:bg-green-700 text-white">
                          {isAct ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}入金済み
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── カード消し込み ────────────────────────────────────────────────────────────
function CardReconcile() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const [acting, setActing] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try { setPayments(await apiFetch('/api/admin/finance/card-payments')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const isDone = (p: any) => p.paymentStatus === '入金確認済み';

  const filtered = payments.filter(p => {
    if (filter === 'pending') return !isDone(p);
    if (filter === 'done')    return isDone(p);
    return true;
  });

  const pendingCount = payments.filter(p => !isDone(p)).length;

  const reconcile = async (id: number) => {
    setActing(id);
    try {
      await apiFetch(`/api/admin/finance/card-payments/${id}/reconcile`, { method: 'PATCH', body: '{}' });
      toast({ title: '消し込みしました' });
      load();
    } catch { toast({ variant: 'destructive', title: '操作に失敗しました' }); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {[
          { key: 'pending', label: '未消し込み', count: pendingCount },
          { key: 'done',    label: '消し込み済み' },
          { key: 'all',     label: '全て' },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key as any)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${filter === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className="ml-1 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">案件ID</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">顧客</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">区間</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">支払方法</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">金額</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">ステータス</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">決済日</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={8} className="py-12 text-center text-muted-foreground text-sm">データはありません</td></tr>
            ) : filtered.map(p => {
              const st = PAY_STATUS[p.paymentStatus] ?? PAY_STATUS['未決済'];
              const isAct = acting === p.id;
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">#{p.shipmentId}</td>
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{p.companyName || p.userName || '—'}</div>
                    {p.companyName && <div className="text-xs text-muted-foreground">{p.userName}</div>}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[180px] truncate">
                    {p.pickupAddress && p.deliveryAddress ? `${p.pickupAddress} → ${p.deliveryAddress}` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-xs">{p.paymentMethod}</td>
                  <td className="px-5 py-3.5 text-right font-semibold">{yen(p.totalAmount)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">
                    {p.paidAt ? format(new Date(p.paidAt), 'yyyy/MM/dd') : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    {p.paymentStatus !== '消し込み済み' && (
                      <Button size="sm" disabled={isAct} onClick={() => reconcile(p.id)} className="gap-1 text-xs">
                        {isAct ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        消し込み
                      </Button>
                    )}
                  </td>
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
const MAIN_TABS = [
  { key: 'pl',      label: 'PL（損益計算書）' },
  { key: 'invoice', label: '請求書消し込み' },
  { key: 'card',    label: 'カード消し込み' },
];

export default function AdminFinance() {
  const [tab, setTab] = useState('pl');
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">PL / BS / CF</h1>

      <div className="flex gap-1 border-b border-border">
        {MAIN_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pl'      && <PLTable year={year} setYear={setYear} />}
      {tab === 'invoice' && <InvoiceReconcile />}
      {tab === 'card'    && <CardReconcile />}
    </div>
  );
}
