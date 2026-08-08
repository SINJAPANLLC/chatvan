import React, { useState } from 'react';
import { 
  useListRentalCompanies, 
  useCreateRentalCompany, 
  useUpdateRentalCompany, 
  useDeleteRentalCompany,
  RentalCompany
} from '@workspace/api-client-react';
import { Loader2, Plus, Edit, Trash2, Building2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AdminRentalCompanies() {
  const { data: companies, isLoading, refetch } = useListRentalCompanies();
  const { toast } = useToast();

  const createMut = useCreateRentalCompany();
  const updateMut = useUpdateRentalCompany();
  const deleteMut = useDeleteRentalCompany();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<RentalCompany>>({
    name: '', contactPerson: '', phone: '', email: '',
    address: '', serviceArea: '', notes: ''
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: '', contactPerson: '', phone: '', email: '', address: '', serviceArea: '', notes: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: RentalCompany) => {
    setEditingId(c.id);
    setFormData(c);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data: formData as any });
        toast({ title: '更新しました' });
      } else {
        await createMut.mutateAsync({ data: formData as any });
        toast({ title: '登録しました' });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">レンタル会社管理</h1>
          <p className="text-muted-foreground text-sm mt-1">提携するレンタル会社（車両提供元）を管理します。</p>
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
              <th className="px-6 py-3 font-medium">会社名</th>
              <th className="px-6 py-3 font-medium">担当者</th>
              <th className="px-6 py-3 font-medium">連絡先</th>
              <th className="px-6 py-3 font-medium">対応エリア</th>
              <th className="px-6 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {companies?.map(c => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <div className="font-medium text-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {c.name}
                  </div>
                </td>
                <td className="px-6 py-4">{c.contactPerson || '-'}</td>
                <td className="px-6 py-4">
                  <div className="text-xs">{c.phone || '-'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.email || '-'}</div>
                </td>
                <td className="px-6 py-4">{c.serviceArea || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleOpenEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive ml-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? '会社情報の編集' : 'レンタル会社の登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">会社名</label>
              <input 
                type="text" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">担当者名</label>
                <input 
                  type="text" 
                  value={formData.contactPerson || ''} 
                  onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">電話番号</label>
                <input 
                  type="text" 
                  value={formData.phone || ''} 
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">メールアドレス</label>
              <input 
                type="email" 
                value={formData.email || ''} 
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">住所</label>
              <input 
                type="text" 
                value={formData.address || ''} 
                onChange={e => setFormData({...formData, address: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">対応エリア</label>
              <input 
                type="text" 
                value={formData.serviceArea || ''} 
                onChange={e => setFormData({...formData, serviceArea: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                placeholder="例: 関東全域、神奈川県"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">備考</label>
              <textarea 
                value={formData.notes || ''} 
                onChange={e => setFormData({...formData, notes: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 h-24 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-2">
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
