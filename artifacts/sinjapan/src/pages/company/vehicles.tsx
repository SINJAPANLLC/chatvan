import { useEffect, useState } from 'react';
import { Car, Edit, Save, X } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, string> = {
  available: '空き', rented: '稼働中', maintenance: 'メンテナンス', inactive: '非稼働',
};

export default function CompanyVehicles() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => {
    fetch(API('/company/vehicles'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setVehicles(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const startEdit = (v: any) => {
    setEditingId(v.id);
    setEditForm({ notes: v.notes ?? '', monthlyPrice: v.monthlyPrice ?? '', prefecture: v.prefecture ?? '' });
  };

  const handleSave = async (id: number) => {
    setSaving(true);
    try {
      const r = await fetch(API(`/company/vehicles/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(editForm),
      });
      if (r.ok) {
        toast({ title: '更新しました' });
        setEditingId(null);
        load();
      }
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const [detailVehicle, setDetailVehicle] = useState<any | null>(null);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Car className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">自社車両</h1>
        <span className="text-sm text-muted-foreground ml-1">({vehicles.length}台)</span>
      </div>

      <p className="text-sm text-muted-foreground">メモ・月額料金・都道府県を更新できます。その他の変更はSIN JAPANにお問い合わせください。</p>

      <div className="border border-border rounded-xl overflow-hidden">
        {vehicles.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">登録された車両はありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">車両</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ナンバー</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">月額</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">都道府県</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">メモ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <button onClick={() => setDetailVehicle(v)} className="font-medium hover:underline text-left">
                      {v.maker} {v.model}
                    </button>
                    <div className="text-xs text-muted-foreground">{v.year ? `${v.year}年式` : ''}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{v.licensePlate ?? v.license_plate}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                      v.status === 'rented' ? 'bg-green-100 text-green-700' :
                      v.status === 'available' ? 'bg-blue-100 text-blue-700' :
                      'bg-muted text-muted-foreground'
                    }`}>{STATUS_LABELS[v.status] ?? v.status}</span>
                  </td>
                  {editingId === v.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input type="number" value={editForm.monthlyPrice} onChange={e => setEditForm({ ...editForm, monthlyPrice: e.target.value })}
                          className="w-24 border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={editForm.prefecture} onChange={e => setEditForm({ ...editForm, prefecture: e.target.value })}
                          className="w-24 border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="text" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          className="w-40 border border-border rounded px-2 py-1 text-xs" />
                      </td>
                      <td className="px-4 py-2 flex gap-1">
                        <button onClick={() => handleSave(v.id)} disabled={saving}
                          className="p-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm">¥{Number(v.monthlyPrice ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm">{v.prefecture}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{v.notes}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => startEdit(v)} className="p-1.5 rounded hover:bg-muted">
                          <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 詳細モーダル（車検証・保険情報） */}
      {detailVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailVehicle(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{detailVehicle.maker} {detailVehicle.model}</h2>
              <button onClick={() => setDetailVehicle(null)} className="p-1.5 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">車検証</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">所有者欄</p>
                    <p className="font-medium">{detailVehicle.inspection_certificate_owner || '—'}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">使用者欄</p>
                    <p className="font-medium">{detailVehicle.inspection_certificate_user || '—'}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">任意保険</p>
                <div className="space-y-2">
                  <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">保険会社</p>
                      <p className="font-medium">{detailVehicle.insurance_company || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">証券番号</p>
                      <p className="font-medium font-mono text-xs">{detailVehicle.insurance_policy_number || '—'}</p>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">保険担当者</p>
                    <p className="font-medium">{detailVehicle.insurance_contact || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
