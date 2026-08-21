import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, Send, RefreshCw, ExternalLink, Building2 } from 'lucide-react';
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
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await apiFetch(`/api/admin/finance/van/pl?year=${year}`)); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const monthMap = Object.fromEntries(rows.map(r => [r.month, r]));
  const grid = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return monthMap[key] ?? { month: key, contractRevenue: 0, cardRevenue: 0, invoiceRevenue: 0, contractCost: 0, grossProfit: 0, profitRate: 0, contractCount: 0 };
  });

  const totals = grid.reduce((acc: any, r: any) => ({
    revenue:        acc.revenue        + r.contractRevenue,
    cost:           acc.cost           + r.contractCost,
    grossProfit:    acc.grossProfit    + r.grossProfit,
    cardRevenue:    acc.cardRevenue    + r.cardRevenue,
    invoiceRevenue: acc.invoiceRevenue + r.invoiceRevenue,
    count:          acc.count          + (r.contractCount ?? 0),
  }), { revenue: 0, cost: 0, grossProfit: 0, cardRevenue: 0, invoiceRevenue: 0, count: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          契約売上：その月に有効化された契約の月額合計。原価＝レンタル会社支払い、粗利＝SIN JAPAN手数料。
        </p>
        <div className="flex items-center gap-1">
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
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">月</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">契約売上</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground text-xs">うちカード</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground text-xs">うち請求書</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">原価</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">粗利</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">利益率</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">契約数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {grid.map((r: any, i) => {
                const isEmpty = r.contractRevenue === 0 && r.contractCost === 0;
                return (
                  <tr key={r.month} className={isEmpty ? 'opacity-40' : ''}>
                    <td className="px-5 py-3 font-medium">{MONTHS[i]}</td>
                    <td className="px-5 py-3 text-right font-semibold">{isEmpty ? '—' : yen(r.contractRevenue)}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">{isEmpty ? '—' : yen(r.cardRevenue)}</td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground">{isEmpty ? '—' : yen(r.invoiceRevenue)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : yen(r.contractCost)}</td>
                    <td className={`px-5 py-3 text-right font-semibold ${r.grossProfit < 0 ? 'text-red-600' : ''}`}>
                      {isEmpty ? '—' : yen(r.grossProfit)}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : pct(r.profitRate)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{isEmpty ? '—' : `${r.contractCount ?? 0}件`}</td>
                  </tr>
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
                <td className="px-5 py-3.5 text-right opacity-75">{totals.count}件</td>
              </tr>
            </tfoot>
          </table>
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
                    {!isDone(p) && (
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

// ─── レンタル会社支払い ────────────────────────────────────────────────────────
function RentalPayments() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const currentYear = now.getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiFetch(`/api/admin/finance/van/rental-payments?year=${year}&month=${month}`)); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const statementUrl = (rcId: number) =>
    `${import.meta.env.BASE_URL}api/admin/finance/van/rental-payment-statement?rentalCompanyId=${rcId}&year=${year}&month=${month}`;

  return (
    <div className="space-y-5">
      {/* 年月セレクター */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {[currentYear - 1, currentYear, currentYear + 1].map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${year === y ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {y}年
            </button>
          ))}
        </div>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="px-3 py-1.5 border border-border rounded-lg text-sm bg-background outline-none focus:border-foreground/50 cursor-pointer">
          {MONTHS.map((label, i) => (
            <option key={i} value={i + 1}>{label}</option>
          ))}
        </select>
        <button onClick={load} className="text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {/* 概要バナー */}
      {data && !loading && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">対象期間</p>
            <p className="font-medium">{data.billingPeriod}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">支払期限</p>
            <p className="font-semibold">{data.dueDate}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">支払いサイト</p>
            <p className="font-medium">{data.paymentCycle}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.companies?.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">対象の契約がありません</div>
      ) : (
        <div className="space-y-4">
          {data.companies.map((co: any) => (
            <div key={co.rentalCompanyId} className="rounded-xl border border-border overflow-hidden">
              {/* 会社ヘッダー */}
              <div className="flex items-center justify-between px-5 py-4 bg-muted/20 border-b border-border">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-semibold">{co.rentalCompanyName}</p>
                    <p className="text-xs text-muted-foreground">{[co.email, co.phone].filter(Boolean).join(' ／ ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">支払合計</p>
                    <p className="text-lg font-bold">{yen(co.totalAmount)}</p>
                  </div>
                  <a href={statementUrl(co.rentalCompanyId)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 transition whitespace-nowrap">
                    <ExternalLink className="h-3.5 w-3.5" />支払い明細
                  </a>
                </div>
              </div>
              {/* 契約一覧 */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">車両名</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">ナンバー</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-muted-foreground">利用者</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-muted-foreground">月額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {co.contracts.map((c: any) => (
                    <tr key={c.contractId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">{c.vehicleName}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{c.vehicleNumber}</td>
                      <td className="px-5 py-3 text-muted-foreground">{c.userName}</td>
                      <td className="px-5 py-3 text-right font-semibold">{yen(c.monthlyPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 全社合計 */}
          <div className="rounded-xl border border-foreground bg-foreground text-background px-5 py-4 flex items-center justify-between">
            <span className="font-bold">当月支払い合計</span>
            <span className="text-2xl font-bold">{yen(data.companies.reduce((s: number, co: any) => s + co.totalAmount, 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── メインページ ──────────────────────────────────────────────────────────────
const MAIN_TABS = [
  { key: 'pl',      label: 'PL（損益計算書）' },
  { key: 'invoice', label: '請求書消し込み' },
  { key: 'card',    label: 'カード消し込み' },
  { key: 'rental',  label: 'レンタル会社支払い' },
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
      {tab === 'rental'  && <RentalPayments />}
    </div>
  );
}
