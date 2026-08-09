import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ClipboardList, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Screening {
  id: number;
  applicationId: number;
  userId: number;
  result: 'pending' | 'approved' | 'conditional' | 'rejected';
  method: string;
  conditions?: string;
  reason?: string;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  application?: { applicantName?: string; area?: string; status?: string };
}

const RESULT_LABELS: Record<string, string> = {
  pending: '審査待ち', approved: '承認', conditional: '条件付承認', rejected: '否決',
};
const RESULT_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  conditional: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminScreenings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Screening | null>(null);
  const [result, setResult] = useState('');
  const [conditions, setConditions] = useState('');
  const [reason, setReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const { data: screenings = [], isLoading } = useQuery<Screening[]>({
    queryKey: ['admin-screenings'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/screenings', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/van/admin/screenings/${id}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error('更新に失敗しました');
      return r.json();
    },
    onSuccess: () => {
      toast({ title: '審査結果を更新しました' });
      qc.invalidateQueries({ queryKey: ['admin-screenings'] });
      setSelected(null);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: e.message }),
  });

  const openReview = (s: Screening) => {
    setSelected(s);
    setResult(s.result);
    setConditions(s.conditions || '');
    setReason(s.reason || '');
    setAdminNotes(s.adminNotes || '');
  };

  const handleSubmit = () => {
    if (!selected || !result) return;
    updateMutation.mutate({
      id: selected.id,
      data: { result, conditions, reason, adminNotes, reviewedAt: new Date().toISOString() },
    });
  };

  const pending = screenings.filter(s => s.result === 'pending');
  const done = screenings.filter(s => s.result !== 'pending');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">審査管理</h1>
        {pending.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500" /> 審査待ち ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map(s => (
                  <div key={s.id} className="border border-border rounded-lg p-4 flex items-center justify-between hover:bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{s.application?.applicantName || `申込ID: ${s.applicationId}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">エリア: {s.application?.area || '—'} · 審査方法: {s.method}</p>
                      <p className="text-xs text-muted-foreground">受付: {new Date(s.createdAt).toLocaleDateString('ja-JP')}</p>
                    </div>
                    <button onClick={() => openReview(s)} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90">
                      審査する
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">審査済み ({done.length})</h2>
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">審査済みの記録はありません</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">申込者</th>
                      <th className="text-left px-4 py-3 font-medium">エリア</th>
                      <th className="text-left px-4 py-3 font-medium">結果</th>
                      <th className="text-left px-4 py-3 font-medium">審査日</th>
                      <th className="text-left px-4 py-3 font-medium">担当者</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {done.map(s => (
                      <tr key={s.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openReview(s)}>
                        <td className="px-4 py-3">{s.application?.applicantName || `申込ID: ${s.applicationId}`}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.application?.area || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_COLORS[s.result]}`}>
                            {RESULT_LABELS[s.result]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.reviewedAt ? new Date(s.reviewedAt).toLocaleDateString('ja-JP') : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.reviewedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">審査結果の記録</h2>
            <p className="text-sm text-muted-foreground">申込者: {selected.application?.applicantName || `ID:${selected.applicationId}`}</p>

            <div className="space-y-1">
              <label className="text-sm font-medium">審査結果 *</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(RESULT_LABELS).map(([val, label]) => (
                  <button key={val} onClick={() => setResult(val)}
                    className={`py-2 px-3 rounded-md text-sm font-medium border transition-colors ${result === val ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted/50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {result === 'conditional' && (
              <div className="space-y-1">
                <label className="text-sm font-medium">条件</label>
                <textarea value={conditions} onChange={e => setConditions(e.target.value)}
                  rows={2} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
              </div>
            )}
            {result === 'rejected' && (
              <div className="space-y-1">
                <label className="text-sm font-medium">否決理由</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                  rows={2} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">内部メモ</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                rows={2} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 border border-border rounded-md text-sm hover:bg-muted/50">キャンセル</button>
              <button onClick={handleSubmit} disabled={!result || updateMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {updateMutation.isPending ? '保存中...' : '審査結果を保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
