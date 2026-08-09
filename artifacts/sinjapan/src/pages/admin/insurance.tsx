import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Shield, AlertTriangle, CheckCircle, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InsurancePolicy {
  id: number;
  vehicleId?: number;
  contractId?: number;
  insurer?: string;
  policyNumber?: string;
  startDate?: string;
  expiryDate?: string;
  liabilityPerson?: string;
  liabilityProperty?: string;
  vehicleCoverage?: string;
  personalAccident?: string;
  deductible?: string;
  driverRestriction?: string;
  ageRestriction?: string;
  commercialUseAllowed?: boolean;
  policyFilePath?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  vehicle?: { maker?: string; model?: string; licensePlate?: string };
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expiring_soon: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
};
const STATUS_LABELS: Record<string, string> = {
  active: '有効', expiring_soon: '期限間近', expired: '期限切れ', cancelled: 'キャンセル',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const daysUntilExpiry = (expiry?: string) => {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

export default function AdminInsurance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<InsurancePolicy>>({});

  const { data: policies = [], isLoading } = useQuery<InsurancePolicy[]>({
    queryKey: ['admin-insurance'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/insurance', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch('/api/van/admin/insurance', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(data) });
      if (!r.ok) throw new Error('作成に失敗しました');
      return r.json();
    },
    onSuccess: () => { toast({ title: '保険情報を登録しました' }); qc.invalidateQueries({ queryKey: ['admin-insurance'] }); setShowModal(false); setForm({}); },
    onError: (e: any) => toast({ variant: 'destructive', title: e.message }),
  });

  const expiring = policies.filter(p => {
    const days = daysUntilExpiry(p.expiryDate);
    return days !== null && days <= 30 && days > 0;
  });
  const expired = policies.filter(p => p.status === 'expired');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">保険管理</h1>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
          <Plus className="h-4 w-4" /> 保険情報を追加
        </button>
      </div>

      {/* Alerts */}
      {(expired.length > 0 || expiring.length > 0) && (
        <div className="space-y-2 mb-6">
          {expired.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-900 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <strong>期限切れ {expired.length} 件</strong> — 早急に更新が必要です
            </div>
          )}
          {expiring.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-yellow-900 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <strong>30日以内に期限切れ {expiring.length} 件</strong> — 更新の準備を進めてください
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>保険情報が登録されていません</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">車両</th>
                <th className="text-left px-4 py-3 font-medium">保険会社 / 証券番号</th>
                <th className="text-left px-4 py-3 font-medium">開始日</th>
                <th className="text-left px-4 py-3 font-medium">満了日</th>
                <th className="text-left px-4 py-3 font-medium">残日数</th>
                <th className="text-left px-4 py-3 font-medium">ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map(p => {
                const days = daysUntilExpiry(p.expiryDate);
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      {p.vehicle ? `${p.vehicle.maker} ${p.vehicle.model} ${p.vehicle.licensePlate || ''}` : `車両ID: ${p.vehicleId || '—'}`}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.insurer || '—'}</p>
                      <p className="text-xs text-muted-foreground">{p.policyNumber || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{p.startDate || '—'}</td>
                    <td className="px-4 py-3 text-xs font-medium">{p.expiryDate || '—'}</td>
                    <td className={`px-4 py-3 text-xs font-bold ${days !== null && days <= 0 ? 'text-red-600' : days !== null && days <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {days !== null ? (days <= 0 ? `${Math.abs(days)}日超過` : `${days}日`) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">保険情報を追加</h2>
              <button onClick={() => { setShowModal(false); setForm({}); }}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: '保険会社', key: 'insurer' }, { label: '証券番号', key: 'policyNumber' },
                { label: '開始日', key: 'startDate', type: 'date' }, { label: '満了日', key: 'expiryDate', type: 'date' },
                { label: '対人補償', key: 'liabilityPerson' }, { label: '対物補償', key: 'liabilityProperty' },
                { label: '車両保険', key: 'vehicleCoverage' }, { label: '人身傷害', key: 'personalAccident' },
                { label: '免責金額', key: 'deductible' }, { label: '運転者条件', key: 'driverRestriction' },
                { label: '年齢条件', key: 'ageRestriction' },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium">{f.label}</label>
                  <input type={f.type || 'text'} value={(form as any)[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs font-medium">内部メモ</label>
                <textarea value={form.adminNotes || ''} onChange={e => setForm(prev => ({ ...prev, adminNotes: e.target.value }))}
                  rows={2} className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowModal(false); setForm({}); }} className="flex-1 py-2 border border-border rounded-md text-sm">キャンセル</button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {createMutation.isPending ? '保存中...' : '登録する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
