import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CreditCard, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface VanPayment {
  id: number;
  contractId: number;
  userId: number;
  amount: string;
  currency: string;
  paymentType: string;
  billingPeriod?: string;
  status: string;
  paymentProvider?: string;
  paidAt?: string;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  contract?: { user?: { name?: string }; vehicle?: { maker?: string; model?: string } };
}

const STATUS_LABELS: Record<string, string> = {
  pending: '決済待ち', authorized: 'オーソリ済', paid: '決済完了', failed: '決済失敗',
  retrying: '再決済中', overdue: '期限超過', refunded: '返金済', partially_refunded: '一部返金', cancelled: 'キャンセル',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  authorized: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  retrying: 'bg-orange-100 text-orange-800',
  overdue: 'bg-red-200 text-red-900',
  refunded: 'bg-gray-100 text-gray-800',
  partially_refunded: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-gray-100 text-gray-600',
};
const TYPE_LABELS: Record<string, string> = {
  initial: '初月', monthly: '月次', additional: '追加請求', refund: '返金',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminPaymentsVan() {
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payments = [], isLoading } = useQuery<VanPayment[]>({
    queryKey: ['admin-van-payments'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/payments', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30000,
  });

  const failed = payments.filter(p => ['failed', 'retrying', 'overdue'].includes(p.status));
  const filtered = statusFilter === 'all' ? payments : payments.filter(p => p.status === statusFilter);

  const stats = {
    paid: payments.filter(p => p.status === 'paid').length,
    failed: failed.length,
    pending: payments.filter(p => p.status === 'pending').length,
    totalPaid: payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0),
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">決済管理</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: '決済完了', value: stats.paid, icon: CheckCircle, color: 'text-green-600' },
          { label: '決済失敗', value: stats.failed, icon: XCircle, color: 'text-red-600' },
          { label: '決済待ち', value: stats.pending, icon: AlertCircle, color: 'text-yellow-600' },
          { label: '今月売上', value: `¥${stats.totalPaid.toLocaleString()}`, icon: CreditCard, color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Failure Alert */}
      {failed.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-900">決済失敗 {failed.length} 件</p>
            <p className="text-sm text-red-700">対応が必要なユーザーがいます。各案件の詳細を確認してください。</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'pending', 'paid', 'failed', 'retrying', 'overdue'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {s === 'all' ? 'すべて' : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>決済記録がありません</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">ユーザー / 車両</th>
                <th className="text-left px-4 py-3 font-medium">種別</th>
                <th className="text-left px-4 py-3 font-medium">対象月</th>
                <th className="text-right px-4 py-3 font-medium">金額</th>
                <th className="text-left px-4 py-3 font-medium">ステータス</th>
                <th className="text-left px-4 py-3 font-medium">決済日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.contract?.user?.name || `ユーザーID: ${p.userId}`}</p>
                    <p className="text-xs text-muted-foreground">{p.contract?.vehicle ? `${p.contract.vehicle.maker} ${p.contract.vehicle.model}` : `契約ID: ${p.contractId}`}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[p.paymentType] || p.paymentType}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.billingPeriod || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">¥{Number(p.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString('ja-JP') : (p.dueDate || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
