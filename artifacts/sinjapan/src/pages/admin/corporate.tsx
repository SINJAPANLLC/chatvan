import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle, XCircle, PauseCircle } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  none:      { label: '未申請', cls: 'bg-muted text-muted-foreground' },
  pending:   { label: '審査中', cls: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: '承認済み', cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '否決', cls: 'bg-red-100 text-red-700' },
  suspended: { label: '停止中', cls: 'bg-gray-100 text-gray-600' },
};

export default function AdminCorporate() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [creditInputs, setCreditInputs] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);

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
    } finally {
      setActionLoading(null);
    }
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
                  <div>
                    <p className="font-semibold">{u.companyName ?? u.name}</p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                    {u.corporateNumber && <p className="text-xs text-muted-foreground mt-0.5">法人番号: {u.corporateNumber}</p>}
                    <p className="text-xs text-muted-foreground">支払いサイト: {u.paymentTerms}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                </div>

                {u.creditStatus === 'approved' && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      { label: '与信枠', val: u.creditLimit },
                      { label: '使用中', val: u.creditUsed },
                      { label: '残高', val: u.creditLimit - u.creditUsed },
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
                          onClick={() => doAction(u.id, 'approve', { creditLimit: Number(creditInputs[u.id]) })}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-r-lg hover:bg-green-700 disabled:opacity-40">
                          <CheckCircle className="h-3.5 w-3.5" />承認
                        </button>
                      </div>
                      <button disabled={isLoading} onClick={() => doAction(u.id, 'reject')}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
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
                        onClick={() => doAction(u.id, 'approve', { creditLimit: Number(creditInputs[u.id]) })}
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
    </div>
  );
}
