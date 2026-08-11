import React, { useState } from 'react';
import { 
  useListRentalCompanies, 
  useCreateRentalCompany, 
  useUpdateRentalCompany, 
  useDeleteRentalCompany,
  RentalCompany
} from '@workspace/api-client-react';
import { Loader2, Plus, Edit, Trash2, Building2, Save, Mail, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

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
  const [newPassword, setNewPassword] = useState('');

  // 招待
  const [inviteCompany, setInviteCompany] = useState<RentalCompany | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword?: string } | null>(null);

  const handleInvite = async () => {
    if (!inviteCompany) return;
    setInviting(true);
    try {
      const r = await fetch(API(`/van/rental-companies/${inviteCompany.id}/invite`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ email: inviteEmail || inviteCompany.email }),
      });
      const j = await r.json();
      if (r.ok) {
        setInviteResult(j);
        toast({ title: j.message });
      } else {
        toast({ variant: 'destructive', title: j.error });
      }
    } finally { setInviting(false); }
  };

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
    setNewPassword('');
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
        const created = await createMut.mutateAsync({ data: formData as any });
        // パスワードが入力されている場合はアカウントも同時発行
        if (newPassword && (created as any)?.id) {
          const r = await fetch(API(`/van/rental-companies/${(created as any).id}/invite`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ email: formData.email, password: newPassword }),
          });
          const j = await r.json();
          if (r.ok) {
            toast({ title: '会社を登録し、アカウントを発行しました' });
          } else {
            toast({ title: '会社を登録しました（アカウント発行失敗: ' + j.error + '）' });
          }
        } else {
          toast({ title: '登録しました' });
        }
      }
      setIsModalOpen(false);
      setNewPassword('');
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
                  <button
                    onClick={() => { setInviteCompany(c); setInviteEmail(c.email ?? ''); setInviteResult(null); }}
                    title="協力会社アカウントを招待"
                    className="p-1.5 text-muted-foreground hover:text-primary mr-1"
                  >
                    <Key className="h-4 w-4" />
                  </button>
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
            {!editingId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">ログインパスワード <span className="text-muted-foreground font-normal">（任意）</span></label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="入力するとアカウントも同時に発行します"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                />
              </div>
            )}
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

      {/* 招待ダイアログ */}
      <Dialog open={!!inviteCompany} onOpenChange={open => { if (!open) { setInviteCompany(null); setInviteResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              協力会社アカウント招待
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{inviteCompany?.name}</span> にポータルアクセス用アカウントを発行します。
            </p>

            {!inviteResult ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">メールアドレス</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder={inviteCompany?.email ?? 'example@company.jp'}
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                  <p className="text-xs text-muted-foreground">空欄の場合は会社登録メールアドレスを使用します</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setInviteCompany(null)} className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
                  <button onClick={handleInvite} disabled={inviting}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    アカウント発行
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
                  <p className="text-sm font-medium text-green-700">✅ アカウントを発行しました</p>
                  <div className="text-sm text-green-700 space-y-1">
                    <p>メール: <span className="font-mono font-medium">{inviteResult.email}</span></p>
                    {inviteResult.tempPassword && (
                      <p>仮パスワード: <span className="font-mono font-medium bg-green-100 px-1 rounded">{inviteResult.tempPassword}</span></p>
                    )}
                  </div>
                </div>
                {inviteResult.tempPassword && (
                  <p className="text-xs text-muted-foreground">上記の仮パスワードを会社にお伝えください。ログイン後は設定画面から変更できます。</p>
                )}
                <div className="flex justify-end">
                  <button onClick={() => { setInviteCompany(null); setInviteResult(null); }}
                    className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90">
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
