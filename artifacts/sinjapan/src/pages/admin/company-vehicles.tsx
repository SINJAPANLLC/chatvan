import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BASE = () => `${import.meta.env.BASE_URL}api`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdrs = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

const STATUS_LABEL: Record<string, string> = {
  reviewing: '審査中', available: '承認済', unavailable: '却下',
  draft: '下書き', rented: '稼働中', maintenance: 'メンテナンス', suspended: '停止中',
};
const STATUS_COLOR: Record<string, string> = {
  reviewing:  'bg-amber-100 text-amber-700',
  available:  'bg-green-100 text-green-700',
  unavailable:'bg-red-100 text-red-700',
  draft:      'bg-gray-100 text-gray-600',
  rented:     'bg-blue-100 text-blue-700',
  maintenance:'bg-orange-100 text-orange-700',
  suspended:  'bg-zinc-100 text-zinc-600',
};

const TABS = ['審査中', '承認済', '却下', '全て'] as const;
const TAB_STATUS: Record<string, string | null> = {
  '審査中': 'reviewing', '承認済': 'available', '却下': 'unavailable', '全て': null,
};

export default function AdminCompanyVehicles() {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('審査中');
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE()}/van/vehicles`, { headers: hdrs() });
      const data = await r.json();
      setVehicles(Array.isArray(data) ? data : (data?.vehicles ?? []));
    } catch {
      toast({ variant: 'destructive', title: '読み込み失敗' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = TAB_STATUS[tab]
    ? vehicles.filter(v => v.status === TAB_STATUS[tab])
    : vehicles;

  const reviewVehicle = async (id: number, action: 'approve' | 'reject', reason?: string) => {
    setProcessing(id);
    try {
      const r = await fetch(`${BASE()}/van/vehicles/${id}/review`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ action, reason }),
      });
      if (r.ok) {
        toast({ title: action === 'approve' ? '承認しました' : '却下しました' });
        setRejectTarget(null); setRejectReason('');
        load();
      } else {
        const j = await r.json();
        toast({ variant: 'destructive', title: j.error ?? 'エラーが発生しました' });
      }
    } finally { setProcessing(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Car className="h-6 w-6" />車両審査
        </h1>
        <p className="text-muted-foreground text-sm mt-1">協力会社が申請した車両を審査します。</p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t}
            <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
              {TAB_STATUS[t] ? vehicles.filter(v => v.status === TAB_STATUS[t]).length : vehicles.length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['車両','ナンバー','申請会社','都道府県','月額','ステータス','申請日','操作'].map(h => (
                  <th key={h} className="px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">車両はありません</td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="font-medium">{v.maker} {v.model}</div>
                    {v.year && <div className="text-xs text-muted-foreground">{v.year}年式</div>}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{v.license_plate || v.licensePlate || '—'}</td>
                    <td className="px-5 py-3 text-xs">
                      {v.rental_company_name || v.rentalCompany?.name || (v.rentalCompanyId ? `会社ID: ${v.rentalCompanyId}` : '—')}
                    </td>
                  <td className="px-5 py-3 text-xs">{v.prefecture || '—'}</td>
                  <td className="px-5 py-3 text-xs">
                    {(v.monthly_price || v.monthlyPrice)
                      ? '¥' + Number(v.monthly_price || v.monthlyPrice).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {(v.created_at || v.createdAt) ? new Date(v.created_at || v.createdAt).toLocaleDateString('ja-JP') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {v.status === 'reviewing' && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => reviewVehicle(v.id, 'approve')} disabled={processing === v.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-medium disabled:opacity-50">
                          <CheckCircle className="h-3 w-3" />承認
                        </button>
                        <button onClick={() => { setRejectTarget(v); setRejectReason(''); }} disabled={processing === v.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium disabled:opacity-50">
                          <XCircle className="h-3 w-3" />却下
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 却下モーダル */}
      <Dialog open={!!rejectTarget} onOpenChange={open => { if (!open) setRejectTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>車両を却下する</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{rejectTarget?.maker} {rejectTarget?.model}</span> を却下します。
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">却下理由 <span className="text-muted-foreground font-normal text-xs">（任意）</span></label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="却下理由を協力会社に通知します"
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 h-24 resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectTarget(null)} className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
              <button onClick={() => rejectTarget && reviewVehicle(rejectTarget.id, 'reject', rejectReason)}
                disabled={processing === rejectTarget?.id}
                className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium disabled:opacity-50">
                {processing === rejectTarget?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                却下する
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
