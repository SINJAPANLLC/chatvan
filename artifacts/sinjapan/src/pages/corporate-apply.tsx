import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Building2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

const STATUS_LABEL: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending:   { label: '審査中', icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600' },
  approved:  { label: '承認済み', icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600' },
  rejected:  { label: '否決', icon: <XCircle className="h-4 w-4" />, color: 'text-red-600' },
  suspended: { label: '停止中', icon: <XCircle className="h-4 w-4" />, color: 'text-gray-500' },
};

export default function CorporateApply() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<any>(null);
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

  useEffect(() => {
    customFetch<any>('/api/corporate/status')
      .then(s => { setStatus(s); setLoading(false); })
      .catch(() => setLoading(false));
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
      setStatus({ ...status, creditStatus: 'pending' });
    } catch (e: any) {
      setError(e.message ?? '申請に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>;

  const st = STATUS_LABEL[status?.creditStatus];
  const showForm = !success && status?.creditStatus !== 'approved' && status?.creditStatus !== 'pending';

  return (
    <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
      <div className="w-full max-w-xl space-y-6 animate-in fade-in duration-500">

        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">請求書払い申請</h1>
            <p className="text-sm text-muted-foreground mt-0.5">審査通過後、請求書払い（掛け払い）が利用可能になります</p>
          </div>
        </div>

        {status?.creditStatus && status.creditStatus !== 'none' && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border border-border text-sm ${st?.color ?? ''}`}>
            {st?.icon}
            <span className="font-medium">{st?.label ?? status.creditStatus}</span>
            {status.creditStatus === 'approved' && (
              <span className="ml-auto text-muted-foreground">
                与信枠: {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(status.creditLimit)}
              </span>
            )}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-6 py-8 text-center">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <p className="font-semibold text-green-800">申請を受け付けました</p>
            <p className="text-sm text-green-700 mt-1">審査結果はメールでご連絡します（通常2〜3営業日）</p>
            <button onClick={() => setLocation('/')} className="mt-4 text-sm underline text-green-700">トップに戻る</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 bg-muted/30 border-b border-border/50 text-sm font-semibold">申請情報</div>
            <div className="p-5 space-y-4">
              {[
                { key: 'corporateNumber', label: '法人番号', placeholder: '1234567890123（13桁）', type: 'text' },
                { key: 'companyName',     label: '会社名',   placeholder: '株式会社○○',           type: 'text' },
                { key: 'phone',           label: '代表電話番号', placeholder: '03-0000-0000',    type: 'tel' },
                { key: 'billingAddress',  label: '請求書送付先住所', placeholder: '東京都千代田区…', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    required
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-foreground bg-background"
                  />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium mb-1.5">支払いサイト</label>
                <select
                  value={form.paymentTerms}
                  onChange={e => setForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-foreground bg-background"
                >
                  <option value="Net30">月末締め翌月末払い（Net30）</option>
                  <option value="Net60">月末締め翌々月末払い（Net60）</option>
                </select>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-border/50 bg-muted/10">
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {submitting ? '送信中…' : '申請する'}
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">審査通過後、管理者より与信枠が設定されます</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
