import React, { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Building2, CheckCircle, Clock, XCircle, ChevronRight, FileText, AlertCircle } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:   { label: '審査中',   cls: 'bg-black text-white', icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: '承認済み', cls: 'bg-green-100 text-green-700',   icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected:  { label: '否決',     cls: 'bg-red-100 text-red-700',       icon: <XCircle className="h-3.5 w-3.5" /> },
  suspended: { label: '停止中',   cls: 'bg-gray-100 text-gray-600',     icon: <XCircle className="h-3.5 w-3.5" /> },
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft:   { label: '下書き',   cls: 'bg-muted text-muted-foreground' },
  sent:    { label: '送付済み', cls: 'bg-blue-100 text-blue-700' },
  paid:    { label: '入金済み', cls: 'bg-green-100 text-green-700' },
  overdue: { label: '期限超過', cls: 'bg-red-100 text-red-700' },
};

export default function Invoices() {
  const [corporate, setCorporate] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    corporateNumber: '',
    companyName: '',
    phone: '',
    billingAddress: '',
    paymentTerms: 'Net30',
  });

  const fmt = (n: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);

  useEffect(() => {
    const loadAll = async () => {
      try {
        const status = await customFetch<any>('/api/corporate/status');
        setCorporate(status);
        if (status?.creditStatus === 'approved') {
          const invList = await customFetch<any[]>('/api/invoices');
          setInvoices(invList);
        }
      } catch {
        // not logged in — handled gracefully
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await customFetch('/api/corporate/apply', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSuccess(true);
      setCorporate((prev: any) => ({ ...prev, creditStatus: 'pending' }));
    } catch (e: any) {
      const msg: string = e.message ?? '申請に失敗しました';
      setError(msg.replace(/^HTTP\s+\d+[^:]*:\s*/i, ''));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>;
  }

  const st = STATUS_BADGE[corporate?.creditStatus];
  const isApproved  = corporate?.creditStatus === 'approved';
  const isPending   = corporate?.creditStatus === 'pending';
  const showForm    = !success && !isPending && !isApproved;

  return (
    <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
      <div className="w-full max-w-xl space-y-6 animate-in fade-in duration-500">

        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">請求書払い申請</h1>
              <p className="text-sm text-muted-foreground mt-0.5">審査通過後、掛け払いが利用可能になります</p>
            </div>
          </div>
          {st && (
            <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap ${st.cls}`}>
              {st.icon}{st.label}
            </span>
          )}
        </div>

        {/* 承認済み：与信情報 */}
        {isApproved && (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />与信情報
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              {[
                { label: '与信枠', val: corporate.creditLimit },
                { label: '使用中', val: corporate.creditUsed },
                { label: '利用可能残高', val: corporate.creditAvailable },
              ].map(item => (
                <div key={item.label} className="px-4 py-4 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="font-bold mt-1">{fmt(item.val ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border/50 text-xs text-muted-foreground">
              支払いサイト: {corporate.paymentTerms}
            </div>
          </div>
        )}

        {/* 審査中メッセージ */}
        {(isPending || success) && (
          <div className="rounded-xl border border-black bg-black px-5 py-5 flex gap-3">
            <Clock className="h-5 w-5 text-white shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">審査中です</p>
              <p className="text-sm text-white/70 mt-0.5">通常2〜3営業日で審査結果をメールでご連絡します</p>
            </div>
          </div>
        )}

        {/* 否決メッセージ */}
        {corporate?.creditStatus === 'rejected' && !showForm && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            審査の結果、今回はご利用いただけませんでした。内容を修正して再申請できます。
          </div>
        )}

        {/* 申請フォーム */}
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold">申請情報</div>
            <div className="p-5 space-y-4">
              {[
                { key: 'corporateNumber', label: '法人番号',         placeholder: '1234567890123（13桁）', type: 'text' },
                { key: 'companyName',     label: '会社名',           placeholder: '株式会社○○',           type: 'text' },
                { key: 'phone',           label: '代表電話番号',     placeholder: '03-0000-0000',         type: 'tel' },
                { key: 'billingAddress',  label: '請求書送付先住所', placeholder: '東京都千代田区…',       type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1.5">{f.label}</label>
                  <input type={f.type} required placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-foreground bg-background" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1.5">支払いサイト</label>
                <select value={form.paymentTerms} onChange={e => setForm(p => ({ ...p, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-foreground bg-background">
                  <option value="Net30">月末締め翌月末払い（Net30）</option>
                  <option value="Net60">月末締め翌々月末払い（Net60）</option>
                </select>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border/50 bg-muted/10">
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {submitting ? '送信中…' : '申請する'}
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">審査通過後、Chat VANより与信枠が設定されます</p>
            </div>
          </form>
        )}

        {/* 承認済み：請求書一覧 */}
        {isApproved && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />請求書一覧
            </h2>
            {invoices.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-muted/20 px-6 py-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">請求書はまだありません</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {invoices.map(inv => {
                  const s = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                  return (
                    <Link key={inv.id} href={`/invoices/${inv.id}`}>
                      <div className="flex items-center px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inv.periodStart} 〜 {inv.periodEnd}
                            {inv.dueDate && <span className="ml-2">支払期限: {inv.dueDate}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                          <span className="font-bold text-sm">{fmt(inv.totalAmount)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
