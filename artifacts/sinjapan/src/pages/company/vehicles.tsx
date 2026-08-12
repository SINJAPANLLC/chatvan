import { useEffect, useState } from 'react';
import { Car, Edit, Save, X, Plus } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
import { useToast } from '@/hooks/use-toast';

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const STATUS_LABELS: Record<string, string> = {
  available: '空き', rented: '稼働中', reviewing: '審査中', draft: '下書き',
  suspended: '停止中', unavailable: '利用不可', proposed: '提案中',
  reserved: '予約済', return_pending: '返却待ち', maintenance: 'メンテナンス', inactive: '非稼働',
};

const STATUS_COLOR: Record<string, string> = {
  available: 'text-green-600', rented: 'text-blue-600', reviewing: 'text-amber-600 font-semibold',
  draft: 'text-gray-500', suspended: 'text-red-500', unavailable: 'text-red-500',
};

const ADD_FORM_DEFAULT = {
  maker: '', model: '', year: '', licensePlate: '', prefecture: '',
  monthlyPrice: '', insuranceCompany: '', inspectionExpiryDate: '', notes: '',
};

export default function CompanyVehicles() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<any>({ ...ADD_FORM_DEFAULT });
  const [addSubmitting, setAddSubmitting] = useState(false);
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
      if (r.ok) { toast({ title: '更新しました' }); setEditingId(null); load(); }
    } finally { setSaving(false); }
  };

  const handleAddVehicle = async () => {
    if (!addForm.maker || !addForm.model || !addForm.monthlyPrice) {
      toast({ variant: 'destructive', title: 'メーカー・モデル・月額料金は必須です' }); return;
    }
    setAddSubmitting(true);
    try {
      const r = await fetch(API('/company/vehicles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          ...addForm,
          year: addForm.year ? Number(addForm.year) : undefined,
          monthlyPrice: Number(addForm.monthlyPrice),
        }),
      });
      if (r.ok) {
        toast({ title: '登録申請を送信しました。管理者が審査後に承認します。' });
        setShowAddModal(false);
        setAddForm({ ...ADD_FORM_DEFAULT });
        load();
      } else {
        const j = await r.json();
        toast({ variant: 'destructive', title: j.error ?? '送信に失敗しました' });
      }
    } finally { setAddSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">自社車両</h1>
          <span className="text-sm text-muted-foreground">({vehicles.length}台)</span>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90">
          <Plus className="h-4 w-4" />車両を登録する
        </button>
      </div>

      <p className="text-sm text-muted-foreground">メモ・月額料金・都道府県を更新できます。その他の変更はSIN JAPANにお問い合わせください。</p>

      <div className="border border-border rounded-xl overflow-hidden">
        {vehicles.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground space-y-2">
            <Car className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p>登録された車両はありません</p>
            <button onClick={() => setShowAddModal(true)}
              className="text-sm text-foreground underline underline-offset-2">
              最初の車両を登録する
            </button>
          </div>
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
                <th className="px-4 py-3" />
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
                  <td className="px-4 py-3 font-mono text-xs">{v.licensePlate || v.license_plate || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${STATUS_COLOR[v.status] ?? 'text-muted-foreground'}`}>
                      {STATUS_LABELS[v.status] ?? v.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <input type="number" value={editForm.monthlyPrice}
                        onChange={e => setEditForm({ ...editForm, monthlyPrice: e.target.value })}
                        className="w-24 px-2 py-1 border rounded text-xs" />
                    ) : (
                      <span>{v.monthlyPrice ? `¥${Number(v.monthlyPrice).toLocaleString()}` : '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <select value={editForm.prefecture}
                        onChange={e => setEditForm({ ...editForm, prefecture: e.target.value })}
                        className="px-2 py-1 border rounded text-xs bg-background">
                        <option value="">—</option>
                        {PREFS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs">{v.prefecture || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    {editingId === v.id ? (
                      <input value={editForm.notes}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-xs" />
                    ) : (
                      <span className="text-xs text-muted-foreground truncate block">{v.notes || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleSave(v.id)} disabled={saving}
                          className="p-1.5 rounded bg-foreground text-background hover:opacity-80">
                          {saving ? <div className="w-3 h-3 border border-background border-t-transparent rounded-full animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(v)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 詳細モーダル */}
      {detailVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailVehicle(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{detailVehicle.maker} {detailVehicle.model}</h2>
              <button onClick={() => setDetailVehicle(null)} className="p-1.5 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">車検証</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">所有者欄</p>
                    <p className="font-medium">{detailVehicle.inspection_certificate_owner || detailVehicle.inspectionCertificateOwner || '—'}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">使用者欄</p>
                    <p className="font-medium">{detailVehicle.inspection_certificate_user || detailVehicle.inspectionCertificateUser || '—'}</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">任意保険</p>
                <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">保険会社</p>
                    <p className="font-medium">{detailVehicle.insurance_company || detailVehicle.insuranceCompany || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">証券番号</p>
                    <p className="font-medium font-mono text-xs">{detailVehicle.insurance_policy_number || detailVehicle.insurancePolicyNumber || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 車両登録モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">車両を登録する</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">申請後、管理者が審査します。承認されるとマッチングに使用されます。</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">メーカー <span className="text-red-500">*</span></label>
                <input type="text" value={addForm.maker} onChange={e => setAddForm({...addForm, maker: e.target.value})}
                  placeholder="例: スズキ"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">モデル・グレード <span className="text-red-500">*</span></label>
                <input type="text" value={addForm.model} onChange={e => setAddForm({...addForm, model: e.target.value})}
                  placeholder="例: エブリイバン"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">年式</label>
                <input type="number" min={1990} max={2030} value={addForm.year}
                  onChange={e => setAddForm({...addForm, year: e.target.value})}
                  placeholder="例: 2022"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">ナンバープレート</label>
                <input type="text" value={addForm.licensePlate}
                  onChange={e => setAddForm({...addForm, licensePlate: e.target.value})}
                  placeholder="例: 品川 あ 12-34"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">都道府県</label>
                <select value={addForm.prefecture} onChange={e => setAddForm({...addForm, prefecture: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background">
                  <option value="">選択してください</option>
                  {PREFS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">月額料金（税込） <span className="text-red-500">*</span></label>
                <input type="number" min={0} value={addForm.monthlyPrice}
                  onChange={e => setAddForm({...addForm, monthlyPrice: e.target.value})}
                  placeholder="例: 35000"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">任意保険会社</label>
                <input type="text" value={addForm.insuranceCompany}
                  onChange={e => setAddForm({...addForm, insuranceCompany: e.target.value})}
                  placeholder="例: 東京海上日動"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">車検満了日</label>
                <input type="date" value={addForm.inspectionExpiryDate}
                  onChange={e => setAddForm({...addForm, inspectionExpiryDate: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium">備考</label>
                <textarea value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} rows={2}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
              <button onClick={handleAddVehicle} disabled={addSubmitting}
                className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {addSubmitting ? '送信中...' : '登録申請する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
