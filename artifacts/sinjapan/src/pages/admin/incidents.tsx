import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Car, Wrench, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Incident {
  id: number;
  contractId?: number;
  userId: number;
  incidentType: 'accident' | 'breakdown' | 'other';
  status: string;
  description?: string;
  location?: string;
  hasInjuries?: boolean;
  policeContacted?: boolean;
  counterpartInfo?: string;
  canDrive?: boolean;
  symptom?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  user?: { name?: string; email?: string };
  contract?: { vehicle?: { maker?: string; model?: string; licensePlate?: string } };
}

const STATUS_LABELS: Record<string, string> = { received: '受付済', in_progress: '対応中', resolved: '解決済み' };
const STATUS_COLORS: Record<string, string> = { received: 'bg-red-100 text-red-800', in_progress: 'bg-yellow-100 text-yellow-800', resolved: 'bg-green-100 text-green-800' };
const TYPE_LABELS: Record<string, string> = { accident: '事故', breakdown: '故障', other: 'その他' };

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminIncidents() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Incident | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ['admin-incidents'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/incidents', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 15000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/van/admin/incidents/${id}`, { method: 'PUT', headers: apiHeaders(), body: JSON.stringify(data) });
      if (!r.ok) throw new Error('更新に失敗しました');
      return r.json();
    },
    onSuccess: () => { toast({ title: '更新しました' }); qc.invalidateQueries({ queryKey: ['admin-incidents'] }); setSelected(null); },
    onError: (e: any) => toast({ variant: 'destructive', title: e.message }),
  });

  const open = incidents.filter(i => i.status !== 'resolved');
  const resolved = incidents.filter(i => i.status === 'resolved');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">事故・故障管理</h1>
        {open.length > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{open.length}</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> 対応中 ({open.length})
              </h2>
              <div className="space-y-2">
                {open.map(inc => (
                  <div key={inc.id} className="border border-border rounded-lg p-4 hover:bg-muted/30 cursor-pointer" onClick={() => { setSelected(inc); setAdminNotes(inc.adminNotes || ''); setNewStatus(inc.status); }}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {inc.incidentType === 'accident' ? <Car className="h-4 w-4 text-red-500" /> : <Wrench className="h-4 w-4 text-yellow-500" />}
                        <span className="font-medium text-sm">{TYPE_LABELS[inc.incidentType]}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inc.status]}`}>{STATUS_LABELS[inc.status]}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(inc.createdAt).toLocaleString('ja-JP')}</span>
                    </div>
                    <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{inc.description || '—'}</p>
                    {inc.location && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" />{inc.location}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {inc.hasInjuries !== undefined && <span className={inc.hasInjuries ? 'text-red-600 font-medium' : ''}>けが人: {inc.hasInjuries ? 'あり ⚠️' : 'なし'}</span>}
                      {inc.policeContacted !== undefined && <span>警察: {inc.policeContacted ? '連絡済' : '未連絡'}</span>}
                      {inc.canDrive !== undefined && <span>自走: {inc.canDrive ? '可能' : '不可'}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">解決済み ({resolved.length})</h2>
            {resolved.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">解決済みの記録はありません</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="text-left px-4 py-3 font-medium">種別</th>
                    <th className="text-left px-4 py-3 font-medium">ユーザー</th>
                    <th className="text-left px-4 py-3 font-medium">状況</th>
                    <th className="text-left px-4 py-3 font-medium">報告日</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {resolved.map(inc => (
                      <tr key={inc.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => { setSelected(inc); setAdminNotes(inc.adminNotes || ''); setNewStatus(inc.status); }}>
                        <td className="px-4 py-3">{TYPE_LABELS[inc.incidentType]}</td>
                        <td className="px-4 py-3">{inc.user?.name || `ID:${inc.userId}`}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs line-clamp-1">{inc.description || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(inc.createdAt).toLocaleDateString('ja-JP')}</td>
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
          <div className="bg-background rounded-xl border border-border w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{TYPE_LABELS[selected.incidentType]}詳細</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">ユーザー:</span> {selected.user?.name || `ID:${selected.userId}`}</p>
              <p><span className="font-medium">状況:</span> {selected.description || '—'}</p>
              <p><span className="font-medium">場所:</span> {selected.location || '—'}</p>
              {selected.incidentType === 'accident' && (<>
                <p><span className="font-medium">けが人:</span> {selected.hasInjuries ? 'あり' : 'なし'}</p>
                <p><span className="font-medium">警察:</span> {selected.policeContacted ? '連絡済' : '未連絡'}</p>
                {selected.counterpartInfo && <p><span className="font-medium">相手方:</span> {selected.counterpartInfo}</p>}
              </>)}
              {selected.incidentType === 'breakdown' && (
                <p><span className="font-medium">症状:</span> {selected.symptom || '—'}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ステータス変更</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">管理メモ</label>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" />
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
