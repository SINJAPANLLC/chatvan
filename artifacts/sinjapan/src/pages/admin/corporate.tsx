import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle, XCircle, PauseCircle, Pencil, X, Save } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  none:      { label: '未申請',   cls: 'bg-muted text-muted-foreground' },
  pending:   { label: '審査中',   cls: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: '承認済み', cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '否決',     cls: 'bg-red-100 text-red-700' },
  suspended: { label: '停止中',   cls: 'bg-gray-100 text-gray-600' },
};

const PAYMENT_TERMS_OPTIONS = [
  '月末締め翌月末払い',
  '月末締め翌々月末払い',
  '20日締め翌月末払い',
  'Net30',
  'Net60',
  'Net90',
];

type EditForm = { companyName: string; email: string; corporateNumber: string; paymentTerms: string };

export default function AdminCorporate() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [creditInputs, setCreditInputs] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // 編集モーダル
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ companyName: '', email: '', corporateNumber: '', paymentTerms: '月末締め翌月末払い' });
  const [editLoading, setEditLoading] = useState(false);

  const reload = () => {
    setLoading(true);
    customFetch<any[]>('/api/admin/corporate').then(setUsers).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const fmt = (n: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);

  const doAction = async (userId: number, endpoint: string, body?: object) => {
    setActionLoading(userId);
    try {
      await customFetch(`/api/admin/corporate/${userId}/${endpoint}`, {
        method: 'PATCH',
        body: JSON.stringify(body ?? {}),
      });
      reload();
    } catch (e: any) {
      alert(e.message ?? 'エラーが発生しました');
    } finally { setActionLoading(null); }
  };

  const openEdit = (u: any) => {
    setEditForm({
      companyName:     u.companyName     ?? '',
      email:           u.email           ?? '',
      corporateNumber: u.corporateNumber ?? '',
      paymentTerms:    u.paymentTerms    || '月末締め翌月末払い',
    });
    setEditUserId(u.id);
  };

  const saveEdit = async () => {
    if (!editUserId) return;
    setEditLoading(true);
    try {
      await customFetch(`/api/admin/corporate/${editUserId}/info`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditUserId(null);
      reload();
    } catch (e: any) {
      alert(e.message ?? '更新に失敗しました');
    } finally { setEditLoading(false); }
  };

  const filtered = users.filter(u =>
    activeTab === 'all' ? true :
    activeTab === 'pending' ? u.creditStatus === 'pending' :
    u.creditStatus === 'approved'
  );

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold tracking-tight">法人口座管理</h1>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([['pending', '審査中'], ['approved', '承認済み'], ['all', 'すべて']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {label}
            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {tab === 'all' ? users.length : users.filter(u => u.creditStatus === tab).length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">該当する申請はありません</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => {
            const st = STATUS_CONFIG[u.creditStatus] ?? STATUS_CONFIG.none;
            const isLoading = actionLoading === u.id;
            return (
              <div key={u.id} className="rounded-xl border border-border p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-semibold">{u.companyName ?? u.name}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                    {u.corporateNumber && <p className="text-xs text-muted-foreground">法人番号: {u.corporateNumber}</p>}
                    <p className="text-xs text-muted-foreground">支払いサイト: {u.paymentTerms || '月末締め翌月末払い'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                    <button onClick={() => openEdit(u)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {u.creditStatus === 'approved' && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      { label: '与信枠', val: u.creditLimit },
                      { label: '使用中', val: u.creditUsed },
                      { label: '残高',   val: u.creditLimit - u.creditUsed },
                    ].map(item => (
                      <div key={item.label} className="bg-muted/30 rounded-lg px-3 py-2">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="font-semibold">{fmt(item.val)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {u.creditStatus === 'pending' && (
                    <>
                      <div className="flex gap-0">
                        <input type="number" placeholder="与信枠（円）"
                          value={creditInputs[u.id] ?? ''}
                          onChange={e => setCreditInputs(p => ({ ...p, [u.id]: e.target.value }))}
                          className="w-36 px-3 py-1.5 text-sm border border-border rounded-l-lg focus:outline-none bg-background" />
                        <button disabled={isLoading || !creditInputs[u.id]}
                          onClick={() => doAction(u.id, 'approve', { creditLimit: Number(creditInputs[u.id]), paymentTerms: u.paymentTerms || '月末締め翌月末払い' })}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-foreground text-background rounded-r-lg hover:opacity-90 disabled:opacity-40">
                          <CheckCircle className="h-3.5 w-3.5" />承認
                        </button>
                      </div>
                      <button disabled={isLoading} onClick={() => doAction(u.id, 'reject')}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border text-muted-foreground rounded-lg hover:bg-muted disabled:opacity-40">
                        <XCircle className="h-3.5 w-3.5" />却下
                      </button>
                    </>
                  )}
                  {u.creditStatus === 'approved' && (
                    <>
                      <div className="flex gap-0">
                        <input type="number" placeholder="新しい与信枠（円）"
                          value={creditInputs[u.id] ?? ''}
                          onChange={e => setCreditInputs(p => ({ ...p, [u.id]: e.target.value }))}
                          className="w-40 px-3 py-1.5 text-sm border border-border rounded-l-lg focus:outline-none bg-background" />
                        <button disabled={isLoading || !creditInputs[u.id]}
                          onClick={() => doAction(u.id, 'credit-limit', { creditLimit: Number(creditInputs[u.id]) })}
                          className="px-3 py-1.5 text-sm bg-foreground text-background rounded-r-lg hover:opacity-90 disabled:opacity-40">
                          更新
                        </button>
                      </div>
                      <button disabled={isLoading} onClick={() => doAction(u.id, 'suspend')}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border text-muted-foreground rounded-lg hover:bg-muted disabled:opacity-40">
                        <PauseCircle className="h-3.5 w-3.5" />停止
                      </button>
                    </>
                  )}
                  {(u.creditStatus === 'rejected' || u.creditStatus === 'suspended') && (
                    <div className="flex gap-0">
                      <input type="number" placeholder="与信枠（円）"
                        value={creditInputs[u.id] ?? ''}
                        onChange={e => setCreditInputs(p => ({ ...p, [u.id]: e.target.value }))}
                        className="w-36 px-3 py-1.5 text-sm border border-border rounded-l-lg focus:outline-none bg-background" />
                      <button disabled={isLoading || !creditInputs[u.id]}
                        onClick={() => doAction(u.id, 'approve', { creditLimit: Number(creditInputs[u.id]), paymentTerms: u.paymentTerms || '月末締め翌月末払い' })}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-foreground text-background rounded-r-lg hover:opacity-90 disabled:opacity-40">
                        再承認
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 編集モーダル */}
      {editUserId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditUserId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">会社情報の編集</h2>
              <button onClick={() => setEditUserId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {([
                { key: 'companyName',     label: '会社名',   type: 'text', placeholder: '合同会社SIN JAPAN' },
                { key: 'email',           label: 'メール',   type: 'email', placeholder: 'info@example.jp' },
                { key: 'corporateNumber', label: '法人番号', type: 'text', placeholder: '1234567890123' },
              ] as const).map(({ key, label, type, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium">{label}</label>
                  <input type={type} placeholder={placeholder}
                    value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/50 bg-background" />
                </div>
              ))}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">支払いサイト</label>
                <select value={editForm.paymentTerms}
                  onChange={e => setEditForm(f => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:border-foreground/50 bg-background cursor-pointer">
                  {PAYMENT_TERMS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditUserId(null)} className="flex-1 py-2 text-sm border border-border rounded-lg hover:bg-muted">キャンセル</button>
              <button onClick={saveEdit} disabled={editLoading}
                className="flex-1 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {editLoading ? <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" /> : <Save className="h-4 w-4" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
