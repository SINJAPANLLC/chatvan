import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle, XCircle, Clock, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function useApplications() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/applications?status=application_received&limit=50'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) { const j = await r.json(); setData(j.applications ?? []); }
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

const RESULT_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending:     { label: '審査中', icon: <Clock className="h-4 w-4" />, color: 'text-orange-600' },
  approved:    { label: '承認', icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600' },
  conditional: { label: '条件付き承認', icon: <ClipboardCheck className="h-4 w-4" />, color: 'text-blue-600' },
  rejected:    { label: '否決', icon: <XCircle className="h-4 w-4" />, color: 'text-red-600' },
};

export default function AdminScreening() {
  const { data, loading, reload } = useApplications();
  const { toast } = useToast();
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ result: 'approved', reason: '', risk_notes: '', conditions: '' });

  const handleSubmit = async () => {
    if (!selected) return;
    // Create screening record
    const r = await fetch(`${import.meta.env.BASE_URL}api/van/screenings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: selected.id, user_id: selected.userId, ...form }),
    });
    if (r.ok) {
      // Update application status
      const newStatus = form.result === 'approved' || form.result === 'conditional' ? 'approved' : 'rejected';
      await fetch(API(`/van/applications/${selected.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: '審査結果を登録しました' });
      setSelected(null);
      reload();
    } else {
      toast({ title: 'エラーが発生しました', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">審査管理</h1>
        <p className="text-sm text-muted-foreground">申込受付済みの案件を審査します（現在は手動審査）</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">審査待ちの案件はありません</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">申込者</th>
                <th className="px-4 py-3 text-left font-medium">利用条件</th>
                <th className="px-4 py-3 text-left font-medium">保険</th>
                <th className="px-4 py-3 text-left font-medium">黒ナンバー</th>
                <th className="px-4 py-3 text-left font-medium">申込日</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((app: any) => (
                <tr key={app.id} className="border-b border-border hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{app.applicantName ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">{app.phone ?? '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <div>{app.area ?? '-'}</div>
                    <div>¥{app.monthlyBudget?.toLocaleString() ?? '-'}/月 · {app.durationMonths ?? '-'}ヶ月</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{app.insuranceStatus ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {app.hasBlackNumber ? <span className="text-green-700">取得済み</span> : <span className="text-muted-foreground">なし</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(app.createdAt).toLocaleDateString('ja-JP')}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a href={`/admin/applications/${app.id}`} className="text-xs text-primary hover:underline">詳細</a>
                      <button onClick={() => { setSelected(app); setForm({ result: 'approved', reason: '', risk_notes: '', conditions: '' }); }} className="text-xs bg-foreground text-background px-2 py-0.5 rounded">審査</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">審査：{selected.applicantName}</h2>
              <button onClick={() => setSelected(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/40 rounded-lg p-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div><span className="text-xs text-muted-foreground">エリア</span><p>{selected.area ?? '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">希望月額</span><p>¥{selected.monthlyBudget?.toLocaleString() ?? '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">目的</span><p>{selected.purpose ?? '-'}</p></div>
                  <div><span className="text-xs text-muted-foreground">配送経験</span><p>{selected.hasDeliveryExperience ? 'あり' : 'なし'}</p></div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">審査結果 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(RESULT_LABELS).map(([v, { label, color }]) => (
                    <button key={v} onClick={() => setForm({ ...form, result: v })} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${form.result === v ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
                      <span className={form.result === v ? '' : color}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">理由・コメント</label>
                <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              {form.result === 'conditional' && (
                <div><label className="text-xs text-muted-foreground block mb-1">条件</label>
                  <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} placeholder="例：保険加入を条件とする" value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} /></div>
              )}
              <div><label className="text-xs text-muted-foreground block mb-1">リスクメモ（内部用）</label>
                <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} value={form.risk_notes} onChange={e => setForm({ ...form, risk_notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 px-6 pb-6 justify-end">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm border border-border rounded-lg">キャンセル</button>
              <button onClick={handleSubmit} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium">
                <Save className="h-4 w-4" />審査結果を登録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
