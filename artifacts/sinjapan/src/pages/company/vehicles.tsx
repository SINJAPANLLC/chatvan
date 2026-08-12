import { useEffect, useState } from 'react';
import { Car, Edit, Save, X, Plus, ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const STATUS_LABEL: Record<string, string> = {
  available: '募集中', rented: '貸出中', reviewing: '審査中', draft: '下書き',
  suspended: '掲載停止', unavailable: '利用不可', proposed: '提案済',
  reserved: '予約済', return_pending: '返却予定', maintenance: '整備中', inactive: '非稼働',
};
const STATUS_COLOR: Record<string, string> = {
  available:     'bg-blue-50 text-blue-700',
  rented:        'bg-green-50 text-green-700',
  reviewing:     'bg-orange-50 text-orange-700',
  draft:         'bg-gray-100 text-gray-600',
  suspended:     'bg-gray-100 text-gray-600',
  unavailable:   'bg-gray-100 text-gray-400',
  return_pending:'bg-amber-50 text-amber-700',
  maintenance:   'bg-red-50 text-red-700',
};

const inp = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

const ADD_DEFAULT = {
  maker: '', model: '', year: '', licensePlate: '', prefecture: '',
  monthlyPrice: '', insuranceCompany: '', inspectionExpiryDate: '', notes: '',
};

export default function CompanyVehicles() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<any>({ ...ADD_DEFAULT });
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
        body: JSON.stringify({ ...addForm, year: addForm.year ? Number(addForm.year) : undefined, monthlyPrice: Number(addForm.monthlyPrice) }),
      });
      if (r.ok) {
        toast({ title: '登録申請を送信しました', description: '管理者が審査後に承認します。' });
        setShowAdd(false);
        setAddForm({ ...ADD_DEFAULT });
        load();
      } else {
        const j = await r.json();
        toast({ variant: 'destructive', title: j.error ?? '送信に失敗しました' });
      }
    } finally { setAddSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">車両登録</h1>
          <p className="text-muted-foreground text-sm mt-1">登録済みの車両を管理します。追加した車両は管理者審査後に公開されます。</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition flex items-center gap-2">
          <Plus className="h-4 w-4" />車両を登録する
        </button>
      </div>

      {/* テーブル */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {vehicles.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Car className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">登録された車両はありません</p>
            <button onClick={() => setShowAdd(true)}
              className="text-sm underline underline-offset-2 text-foreground">
              最初の車両を登録する
            </button>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium w-12"></th>
                <th className="px-4 py-3 font-medium">車両</th>
                <th className="px-4 py-3 font-medium">ステータス</th>
                <th className="px-4 py-3 font-medium">月額料金</th>
                <th className="px-4 py-3 font-medium">エリア</th>
                <th className="px-4 py-3 font-medium">メモ</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vehicles.map((v) => (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="pl-4 py-3">
                    <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium">{v.maker} {v.model}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.year ? `${v.year}年式` : ''}
                      {v.licensePlate || v.license_plate ? ` · ${v.licensePlate ?? v.license_plate}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${STATUS_COLOR[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {editingId === v.id ? (
                      <input type="number" value={editForm.monthlyPrice}
                        onChange={e => setEditForm({ ...editForm, monthlyPrice: e.target.value })}
                        className="w-24 px-2 py-1 border rounded text-sm" />
                    ) : (
                      <span className="font-medium">
                        {v.monthlyPrice ? `¥${Number(v.monthlyPrice).toLocaleString()}` : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {editingId === v.id ? (
                      <select value={editForm.prefecture}
                        onChange={e => setEditForm({ ...editForm, prefecture: e.target.value })}
                        className="px-2 py-1 border rounded text-sm bg-background">
                        <option value="">—</option>
                        {PREFS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span>{v.prefecture || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 max-w-[160px]">
                    {editingId === v.id ? (
                      <input value={editForm.notes}
                        onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full px-2 py-1 border rounded text-sm" />
                    ) : (
                      <span className="text-sm text-muted-foreground truncate block">{v.notes || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {editingId === v.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleSave(v.id)} disabled={saving}
                          className="p-1.5 rounded bg-foreground text-background hover:opacity-80">
                          {saving ? <div className="w-3.5 h-3.5 border border-background border-t-transparent rounded-full animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded hover:bg-muted">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(v)} className="p-1.5 text-muted-foreground hover:text-foreground">
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 車両登録モーダル */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>車両の新規登録</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">申請後、管理者が審査します。承認されるとマッチングに使用されます。</p>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">メーカー <span className="text-red-500">*</span></label>
              <input type="text" value={addForm.maker} onChange={e => setAddForm({...addForm, maker: e.target.value})}
                placeholder="例: スズキ" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">モデル・グレード <span className="text-red-500">*</span></label>
              <input type="text" value={addForm.model} onChange={e => setAddForm({...addForm, model: e.target.value})}
                placeholder="例: エブリイバン" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">年式</label>
              <input type="number" min={1990} max={2030} value={addForm.year}
                onChange={e => setAddForm({...addForm, year: e.target.value})}
                placeholder="例: 2022" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">ナンバープレート</label>
              <input type="text" value={addForm.licensePlate}
                onChange={e => setAddForm({...addForm, licensePlate: e.target.value})}
                placeholder="例: 品川 あ 12-34" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">都道府県</label>
              <select value={addForm.prefecture} onChange={e => setAddForm({...addForm, prefecture: e.target.value})}
                className={inp}>
                <option value="">選択してください</option>
                {PREFS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">月額料金（税込） <span className="text-red-500">*</span></label>
              <input type="number" min={0} value={addForm.monthlyPrice}
                onChange={e => setAddForm({...addForm, monthlyPrice: e.target.value})}
                placeholder="例: 35000" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">任意保険会社</label>
              <input type="text" value={addForm.insuranceCompany}
                onChange={e => setAddForm({...addForm, insuranceCompany: e.target.value})}
                placeholder="例: 東京海上日動" className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">車検満了日</label>
              <input type="date" value={addForm.inspectionExpiryDate}
                onChange={e => setAddForm({...addForm, inspectionExpiryDate: e.target.value})}
                className={inp} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium">備考</label>
              <textarea value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} rows={2}
                className={`${inp} resize-none`} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
            <button onClick={handleAddVehicle} disabled={addSubmitting}
              className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {addSubmitting ? '送信中...' : '登録申請する'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
