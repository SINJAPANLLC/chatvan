import React, { useState } from 'react';
import { Shield, Plus, AlertTriangle, CheckCircle, Clock, Edit2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function useInsurancePolicies() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/insurance-policies'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:        { label: '有効', color: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  expiring_soon: { label: '期限30日以内', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: <Clock className="h-3.5 w-3.5" /> },
  expired:       { label: '期限切れ', color: 'text-red-700 bg-red-50 border-red-200', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  cancelled:     { label: 'キャンセル', color: 'text-gray-500 bg-gray-50 border-gray-200', icon: null },
};

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function PolicyRow({ policy, onEdit }: { policy: any; onEdit: () => void }) {
  const days = daysUntil(policy.expiry_date);
  const autoStatus = days !== null && days <= 0 ? 'expired' : days !== null && days <= 30 ? 'expiring_soon' : policy.status;
  const s = STATUS_LABEL[autoStatus] ?? STATUS_LABEL.active;
  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-4 py-3 text-sm">
        <div className="font-medium">{policy.maker} {policy.model}</div>
        <div className="text-xs text-muted-foreground">{policy.license_plate ?? '-'}</div>
      </td>
      <td className="px-4 py-3 text-sm">{policy.insurance_company}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{policy.policy_number ?? '-'}</td>
      <td className="px-4 py-3 text-sm">
        <div>{policy.expiry_date ?? '-'}</div>
        {days !== null && <div className={`text-xs ${days <= 0 ? 'text-red-600' : days <= 30 ? 'text-orange-600' : 'text-muted-foreground'}`}>
          {days <= 0 ? `${Math.abs(days)}日超過` : `残${days}日`}
        </div>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${s.color}`}>
          {s.icon}{s.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm">
        {policy.commercial_use_allowed
          ? <span className="text-green-700 font-medium">✓ 商用可</span>
          : <span className="text-red-600">✗ 商用不可</span>}
      </td>
      <td className="px-4 py-3">
        <button onClick={onEdit} className="text-xs text-primary hover:underline flex items-center gap-1">
          <Edit2 className="h-3 w-3" /> 編集
        </button>
      </td>
    </tr>
  );
}

export default function AdminInsurance() {
  const { data, loading, reload } = useInsurancePolicies();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({
    vehicle_id: '', insurance_company: '', policy_number: '', expiry_date: '',
    bodily_injury: '', property_damage: '', commercial_use_allowed: false, notes: '',
  });

  const expired = data.filter(p => daysUntil(p.expiry_date) !== null && (daysUntil(p.expiry_date) ?? 0) <= 0);
  const expiring = data.filter(p => { const d = daysUntil(p.expiry_date); return d !== null && d > 0 && d <= 30; });

  const handleSave = async () => {
    const url = editing ? API(`/van/insurance-policies/${editing.id}`) : API('/van/insurance-policies');
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      toast({ title: editing ? '更新しました' : '登録しました' });
      setShowAdd(false); setEditing(null);
      setForm({ vehicle_id: '', insurance_company: '', policy_number: '', expiry_date: '', bodily_injury: '', property_damage: '', commercial_use_allowed: false, notes: '' });
      reload();
    } else {
      toast({ title: 'エラーが発生しました', variant: 'destructive' });
    }
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({ vehicle_id: p.vehicle_id, insurance_company: p.insurance_company, policy_number: p.policy_number, expiry_date: p.expiry_date, bodily_injury: p.bodily_injury ?? '', property_damage: p.property_damage ?? '', commercial_use_allowed: p.commercial_use_allowed ?? false, status: p.status, notes: p.notes ?? '' });
    setShowAdd(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">保険管理</h1>
          <p className="text-sm text-muted-foreground">車両の保険情報・有効期限を管理します</p>
        </div>
        <button onClick={() => { setEditing(null); setShowAdd(true); }} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> 保険登録
        </button>
      </div>

      {/* アラート */}
      {(expired.length > 0 || expiring.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span><strong>{expired.length}件</strong>の保険が期限切れです。レンタル会社に確認してください。</span>
            </div>
          )}
          {expiring.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
              <Clock className="h-4 w-4 shrink-0" />
              <span><strong>{expiring.length}件</strong>の保険が30日以内に期限切れになります。</span>
            </div>
          )}
        </div>
      )}

      {/* テーブル */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">保険情報がありません</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">車両</th>
                <th className="px-4 py-3 text-left font-medium">保険会社</th>
                <th className="px-4 py-3 text-left font-medium">証券番号</th>
                <th className="px-4 py-3 text-left font-medium">有効期限</th>
                <th className="px-4 py-3 text-left font-medium">状態</th>
                <th className="px-4 py-3 text-left font-medium">商用利用</th>
                <th className="px-4 py-3 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map(p => <PolicyRow key={p.id} policy={p} onEdit={() => openEdit(p)} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* 登録・編集モーダル */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">{editing ? '保険情報を編集' : '保険を登録'}</h2>
              <button onClick={() => { setShowAdd(false); setEditing(null); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!editing && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">車両ID</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} placeholder="車両ID" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">保険会社 *</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={form.insurance_company} onChange={e => setForm({ ...form, insurance_company: e.target.value })} placeholder="東京海上日動" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">証券番号</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={form.policy_number} onChange={e => setForm({ ...form, policy_number: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">有効期限 *</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">対人補償</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={form.bodily_injury} onChange={e => setForm({ ...form, bodily_injury: e.target.value })} placeholder="無制限" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">対物補償</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={form.property_damage} onChange={e => setForm({ ...form, property_damage: e.target.value })} placeholder="無制限" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="commercial" checked={form.commercial_use_allowed} onChange={e => setForm({ ...form, commercial_use_allowed: e.target.checked })} />
                <label htmlFor="commercial" className="text-sm font-medium">商用利用可（配送業務対応）</label>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">メモ</label>
                <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm resize-none" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6 justify-end">
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="px-4 py-2 text-sm border border-border rounded-lg">キャンセル</button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium">
                <Save className="h-4 w-4" />{editing ? '更新' : '登録'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
