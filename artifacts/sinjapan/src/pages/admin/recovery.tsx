import React, { useState } from 'react';
import { RotateCcw, MapPin, Phone, AlertTriangle, Download, Plus, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function useCases() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/recovery-cases'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

const STATUS_LABELS: Record<string, string> = {
  contacting: '連絡中', return_requested: '返却要求済み', overdue: '期限超過',
  location_check: 'GPS確認中', recovery_requested: '回収依頼済み', recovered: '回収完了', closed: 'クローズ',
};
const STATUS_COLORS: Record<string, string> = {
  contacting: 'bg-orange-50 text-orange-700 border-orange-200',
  return_requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  location_check: 'bg-blue-50 text-blue-700 border-blue-200',
  recovery_requested: 'bg-purple-50 text-purple-700 border-purple-200',
  recovered: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-gray-50 text-gray-500 border-gray-200',
};

function CaseCard({ rc, onUpdate, onGpsReport }: { rc: any; onUpdate: (id: number, data: any) => void; onGpsReport: (id: number) => void }) {
  const [status, setStatus] = useState(rc.status);
  const [notes, setNotes] = useState(rc.notes ?? '');
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.contacting;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{rc.maker} {rc.model}</div>
          <div className="text-sm text-muted-foreground">{rc.license_plate ?? '-'} · {rc.prefecture ?? '-'}</div>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${s}`}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>

      <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{rc.user_name}</span>
          <span className="text-muted-foreground">{rc.phone}</span>
        </div>
        {rc.return_deadline && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>返却期限: {rc.return_deadline}</span>
          </div>
        )}
        {rc.gps_last_location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">最終GPS: {rc.gps_last_location}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">ステータス変更</label>
        <select className="w-full border border-border rounded-md px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} placeholder="メモ・対応記録" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={() => onUpdate(rc.id, { status, notes })} className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium">
            <Save className="h-3 w-3" />保存
          </button>
          <button onClick={() => onGpsReport(rc.id)} className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground">
            <Download className="h-3 w-3" />GPS報告書
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminRecovery() {
  const { data, loading, reload } = useCases();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ contract_id: '', user_id: '', vehicle_id: '', return_deadline: '', notes: '' });

  const handleUpdate = async (id: number, body: any) => {
    const r = await fetch(API(`/van/recovery-cases/${id}`), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) { toast({ title: '更新しました' }); reload(); }
    else toast({ title: 'エラー', variant: 'destructive' });
  };

  const handleGpsReport = async (id: number) => {
    const r = await fetch(API(`/van/recovery-cases/${id}/gps-report`), { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) {
      const report = await r.json();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `gps-report-${id}.json`; a.click();
    } else toast({ title: 'GPS報告書の生成に失敗しました', variant: 'destructive' });
  };

  const handleCreate = async () => {
    const r = await fetch(API('/van/recovery-cases'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (r.ok) { toast({ title: '回収ケースを作成しました' }); setShowAdd(false); reload(); }
    else toast({ title: 'エラー', variant: 'destructive' });
  };

  const active = data.filter(c => !['recovered', 'closed'].includes(c.status));
  const closed = data.filter(c => ['recovered', 'closed'].includes(c.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">未返却・回収サポート</h1>
          <p className="text-sm text-muted-foreground">未返却車両の対応状況を管理します</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" />ケース作成
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        Chat VANは回収の記録・GPS報告・連絡管理を行います。実際の強制回収はChat VANの責任範囲外です。
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3">対応中 ({active.length}件)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {active.map(rc => <CaseCard key={rc.id} rc={rc} onUpdate={handleUpdate} onGpsReport={handleGpsReport} />)}
              </div>
            </div>
          )}
          {active.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <RotateCcw className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">対応中の回収ケースはありません</p>
            </div>
          )}
          {closed.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">完了済み ({closed.length}件)</summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                {closed.map(rc => <CaseCard key={rc.id} rc={rc} onUpdate={handleUpdate} onGpsReport={handleGpsReport} />)}
              </div>
            </details>
          )}
        </>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">回収ケースを作成</h2>
              <button onClick={() => setShowAdd(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">契約ID</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={form.contract_id} onChange={e => setForm({ ...form, contract_id: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">ユーザーID</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">車両ID</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} /></div>
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">返却期限</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="date" value={form.return_deadline} onChange={e => setForm({ ...form, return_deadline: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">メモ</label>
                <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 px-6 pb-6 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-border rounded-lg">キャンセル</button>
              <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm"><Save className="h-4 w-4" />作成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
