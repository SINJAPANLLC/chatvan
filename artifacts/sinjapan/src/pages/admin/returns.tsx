import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VanReturn {
  id: number;
  contractId: number;
  userId: number;
  vehicleId: number;
  returnDate?: string;
  returnLocation?: string;
  reason?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  user?: { name?: string };
  vehicle?: { maker?: string; model?: string; licensePlate?: string };
  inspection?: { id: number; mileageAtReturn?: number; fuelLevel?: string; cleaningStatus?: string };
}

const STATUS_LABELS: Record<string, string> = {
  requested: '返却申請中', scheduled: '返却日確定', in_progress: '返却手続き中',
  inspecting: '車両確認中', completed: '返却完了', cancelled: 'キャンセル',
};
const STATUS_COLORS: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-800', scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800', inspecting: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800', cancelled: 'bg-gray-100 text-gray-700',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminReturns() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<VanReturn | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  const { data: returns_ = [], isLoading } = useQuery<VanReturn[]>({
    queryKey: ['admin-returns'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/returns', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/van/admin/returns/${id}`, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify(data) });
      if (!r.ok) throw new Error('更新に失敗しました');
      return r.json();
    },
    onSuccess: () => { toast({ title: '更新しました' }); qc.invalidateQueries({ queryKey: ['admin-returns'] }); setSelected(null); },
    onError: (e: any) => toast({ variant: 'destructive', title: e.message }),
  });

  const active = returns_.filter(r => !['completed', 'cancelled'].includes(r.status));
  const done = returns_.filter(r => ['completed', 'cancelled'].includes(r.status));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <RotateCcw className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">返却管理</h1>
        {active.length > 0 && <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{active.length}</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" /> 返却手続き中 ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map(ret => (
                  <div key={ret.id} className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted/30" onClick={() => { setSelected(ret); setNewStatus(ret.status); setAdminNotes(ret.adminNotes || ''); }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{ret.user?.name || `ユーザーID: ${ret.userId}`}</p>
                        <p className="text-xs text-muted-foreground">{ret.vehicle ? `${ret.vehicle.maker} ${ret.vehicle.model} ${ret.vehicle.licensePlate || ''}` : `車両ID: ${ret.vehicleId}`}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ret.status]}`}>{STATUS_LABELS[ret.status]}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>返却希望日: {ret.returnDate || '未定'}</span>
                      <span>返却場所: {ret.returnLocation || '未定'}</span>
                    </div>
                    {ret.reason && <p className="text-xs text-muted-foreground mt-1">理由: {ret.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> 完了 ({done.length})
            </h2>
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">完了した返却はありません</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="text-left px-4 py-3 font-medium">ユーザー</th>
                    <th className="text-left px-4 py-3 font-medium">車両</th>
                    <th className="text-left px-4 py-3 font-medium">返却日</th>
                    <th className="text-left px-4 py-3 font-medium">ステータス</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {done.map(ret => (
                      <tr key={ret.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => { setSelected(ret); setNewStatus(ret.status); setAdminNotes(ret.adminNotes || ''); }}>
                        <td className="px-4 py-3">{ret.user?.name || `ID:${ret.userId}`}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ret.vehicle ? `${ret.vehicle.maker} ${ret.vehicle.model}` : `ID:${ret.vehicleId}`}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{ret.returnDate || '—'}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ret.status]}`}>{STATUS_LABELS[ret.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">返却詳細</h2>
            <div className="space-y-1 text-sm">
              <p><span className="font-medium">ユーザー:</span> {selected.user?.name}</p>
              <p><span className="font-medium">車両:</span> {selected.vehicle ? `${selected.vehicle.maker} ${selected.vehicle.model}` : '—'}</p>
              <p><span className="font-medium">希望返却日:</span> {selected.returnDate || '—'}</p>
              <p><span className="font-medium">返却場所:</span> {selected.returnLocation || '—'}</p>
              <p><span className="font-medium">理由:</span> {selected.reason || '—'}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ステータス</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">管理メモ</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelected(null)} className="flex-1 py-2 border border-border rounded-md text-sm">閉じる</button>
              <button onClick={() => updateMutation.mutate({ id: selected.id, data: { status: newStatus, adminNotes } })} disabled={updateMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
