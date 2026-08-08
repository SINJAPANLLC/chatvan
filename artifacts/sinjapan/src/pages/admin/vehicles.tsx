import React, { useState } from 'react';
import { 
  useListVehicles, 
  useCreateVehicle, 
  useUpdateVehicle, 
  useDeleteVehicle,
  useListRentalCompanies,
  Vehicle
} from '@workspace/api-client-react';
import { Loader2, Plus, Edit, Trash2, X, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AdminVehicles() {
  const { data: vehicles, isLoading, refetch } = useListVehicles();
  const { data: rentalCompanies } = useListRentalCompanies();
  const { toast } = useToast();

  const createMut = useCreateVehicle();
  const updateMut = useUpdateVehicle();
  const deleteMut = useDeleteVehicle();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Vehicle>>({
    maker: '', model: '', year: null, prefecture: '',
    monthlyPrice: 0, sinJapanFee: 0, minPeriodMonths: 1,
    status: '募集中', hasEtc: false, hasDashcam: false, hasBackupCam: false,
    rentalCompanyId: undefined
  } as any);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      maker: '', model: '', year: 2020, prefecture: '',
      monthlyPrice: 30000, sinJapanFee: 5000, minPeriodMonths: 1,
      status: '募集中', hasEtc: false, hasDashcam: false, hasBackupCam: false,
      rentalCompanyId: undefined
    } as any);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setFormData({
      ...v,
      rentalCompanyId: v.rentalCompany?.id
    } as any);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        year: formData.year ? Number(formData.year) : null,
        monthlyPrice: Number(formData.monthlyPrice),
        sinJapanFee: Number(formData.sinJapanFee),
        minPeriodMonths: Number(formData.minPeriodMonths),
        rentalCompanyId: formData.rentalCompanyId ? Number(formData.rentalCompanyId) : null
      } as any;

      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data });
        toast({ title: '車両を更新しました' });
      } else {
        await createMut.mutateAsync({ data });
        toast({ title: '車両を登録しました' });
      }
      setIsModalOpen(false);
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '保存に失敗しました' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteMut.mutateAsync({ id });
      toast({ title: '削除しました' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '削除に失敗しました' });
    }
  };

  const statusColors: Record<string, string> = {
    '募集中': 'bg-blue-50 text-blue-700',
    '商談中': 'bg-yellow-50 text-yellow-700',
    '貸出中': 'bg-green-50 text-green-700',
    '掲載停止': 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">車両管理</h1>
          <p className="text-muted-foreground text-sm mt-1">レンタル用の軽バン車両を管理します。</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> 新規登録
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">車両</th>
              <th className="px-6 py-3 font-medium">ステータス</th>
              <th className="px-6 py-3 font-medium">料金 (月額/手数料)</th>
              <th className="px-6 py-3 font-medium">エリア</th>
              <th className="px-6 py-3 font-medium">会社</th>
              <th className="px-6 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vehicles?.map(v => (
              <tr key={v.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <div className="font-medium text-foreground">{v.maker} {v.model}</div>
                  <div className="text-xs text-muted-foreground">{v.year ? `${v.year}年式` : '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-semibold rounded ${statusColors[v.status] || 'bg-gray-100'}`}>
                    {v.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium">¥{v.monthlyPrice.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">+手数料 ¥{v.sinJapanFee.toLocaleString()}</div>
                </td>
                <td className="px-6 py-4">{v.prefecture || '-'}</td>
                <td className="px-6 py-4 truncate max-w-[150px]">{v.rentalCompany?.name || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleOpenEdit(v)} className="p-1.5 text-muted-foreground hover:text-foreground">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 text-muted-foreground hover:text-destructive ml-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '車両の編集' : '車両の新規登録'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">メーカー</label>
              <input 
                type="text" 
                value={formData.maker || ''} 
                onChange={e => setFormData({...formData, maker: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                placeholder="例: スズキ"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">車種</label>
              <input 
                type="text" 
                value={formData.model || ''} 
                onChange={e => setFormData({...formData, model: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                placeholder="例: エブリイ"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">年式 (西暦)</label>
              <input 
                type="number" 
                value={formData.year || ''} 
                onChange={e => setFormData({...formData, year: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">都道府県</label>
              <input 
                type="text" 
                value={formData.prefecture || ''} 
                onChange={e => setFormData({...formData, prefecture: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">月額料金 (原価)</label>
              <input 
                type="number" 
                value={formData.monthlyPrice || ''} 
                onChange={e => setFormData({...formData, monthlyPrice: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">SIN JAPAN 手数料</label>
              <input 
                type="number" 
                value={formData.sinJapanFee || ''} 
                onChange={e => setFormData({...formData, sinJapanFee: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">最低利用期間 (月)</label>
              <input 
                type="number" 
                value={formData.minPeriodMonths || ''} 
                onChange={e => setFormData({...formData, minPeriodMonths: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ステータス</label>
              <select 
                value={formData.status || '募集中'} 
                onChange={e => setFormData({...formData, status: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background"
              >
                <option value="募集中">募集中</option>
                <option value="商談中">商談中</option>
                <option value="契約予定">契約予定</option>
                <option value="貸出中">貸出中</option>
                <option value="返却予定">返却予定</option>
                <option value="整備中">整備中</option>
                <option value="掲載停止">掲載停止</option>
              </select>
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">レンタル会社</label>
              <select 
                value={formData.rentalCompanyId || ''} 
                onChange={e => setFormData({...formData, rentalCompanyId: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background"
              >
                <option value="">（自社保有）</option>
                {rentalCompanies?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.hasEtc || false}
                  onChange={e => setFormData({...formData, hasEtc: e.target.checked})}
                /> ETC
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.hasDashcam || false}
                  onChange={e => setFormData({...formData, hasDashcam: e.target.checked})}
                /> ドラレコ
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.hasBackupCam || false}
                  onChange={e => setFormData({...formData, hasBackupCam: e.target.checked})}
                /> バックカメラ
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">キャンセル</button>
            <button 
              onClick={handleSave} 
              disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center"
            >
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2"/>}
              保存する
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
