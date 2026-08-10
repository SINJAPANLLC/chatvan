import React, { useState, useRef } from 'react';
import { 
  useListVehicles, 
  useCreateVehicle, 
  useUpdateVehicle, 
  useDeleteVehicle,
  useListRentalCompanies,
  Vehicle
} from '@workspace/api-client-react';
import { Loader2, Plus, Edit, Trash2, Save, Upload, X, ImageIcon } from 'lucide-react';
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

  // ── 画像アップロード state ─────────────────────────────────────────────────
  const [photoPath, setPhotoPath] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: '画像ファイルを選択してください' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'ファイルサイズは10MB以内にしてください' });
      return;
    }
    setUploading(true);
    setUploadProgress(10);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      // Step 1: presigned URL を取得
      const urlRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('アップロードURLの取得に失敗しました');
      const { uploadURL, objectPath } = await urlRes.json();
      setUploadProgress(40);

      // Step 2: GCS に直接アップロード
      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) throw new Error('アップロードに失敗しました');
      setUploadProgress(100);

      setPhotoPath(objectPath);
      setFormData(prev => ({ ...prev, photos: JSON.stringify([objectPath]) }));
      toast({ title: '画像をアップロードしました' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message || 'アップロードエラー' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
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
    setFormData({
      maker: '', model: '', year: 2020, prefecture: '',
      monthlyPrice: 30000, sinJapanFee: 5000, minPeriodMonths: 1,
      status: 'available', hasEtc: false, hasDashcam: false, hasBackupCam: false,
      rentalCompanyId: undefined
    } as any);
    setPhotoPath('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setFormData({
      ...v,
      rentalCompanyId: v.rentalCompany?.id
    } as any);
    // 既存写真の先頭を photoPath に反映
    try {
      const photos = JSON.parse((v as any).photos || '[]');
      setPhotoPath(photos[0] || '');
    } catch { setPhotoPath(''); }
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
    draft:           'bg-gray-100 text-gray-600',
    reviewing:       'bg-orange-50 text-orange-700',
    available:       'bg-blue-50 text-blue-700',
    proposed:        'bg-purple-50 text-purple-700',
    reserved:        'bg-yellow-50 text-yellow-700',
    rented:          'bg-green-50 text-green-700',
    return_pending:  'bg-amber-50 text-amber-700',
    maintenance:     'bg-red-50 text-red-700',
    suspended:       'bg-gray-100 text-gray-600',
    unavailable:     'bg-gray-100 text-gray-400',
  };
  const statusLabel: Record<string, string> = {
    draft:           '下書き',
    reviewing:       '審査中',
    available:       '募集中',
    proposed:        '提案済',
    reserved:        '予約済',
    rented:          '貸出中',
    return_pending:  '返却予定',
    maintenance:     '整備中',
    suspended:       '掲載停止',
    unavailable:     '利用不可',
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
              <th className="px-6 py-3 font-medium w-12"></th>
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
                <td className="pl-4 py-3">
                  {(() => {
                    try {
                      const photos = JSON.parse((v as any).photos || '[]');
                      if (photos[0]) return (
                        <img src={`/api/storage${photos[0]}`} alt="" className="w-10 h-10 rounded-md object-cover border border-border" />
                      );
                    } catch {}
                    return <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>;
                  })()}
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-foreground">{v.maker} {v.model}</div>
                  <div className="text-xs text-muted-foreground">{v.year ? `${v.year}年式` : '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-semibold rounded ${statusColors[v.status] || 'bg-gray-100'}`}>
                    {statusLabel[v.status] ?? v.status}
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
            {/* ── 画像アップロード ── */}
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">車両画像（1枚）</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
              />
              {photoPath ? (
                <div className="relative w-full h-40 rounded-lg overflow-hidden border border-border group">
                  <img
                    src={`/api/storage${photoPath}`}
                    alt="車両画像"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-md hover:bg-gray-100"
                    >
                      変更
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPhotoPath(''); setFormData(prev => ({ ...prev, photos: '[]' })); }}
                      className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-md hover:bg-gray-100"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">アップロード中... {uploadProgress}%</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6" />
                      <span className="text-xs">クリックして画像を選択</span>
                      <span className="text-[10px]">JPG / PNG / WebP · 最大10MB</span>
                    </>
                  )}
                </button>
              )}
            </div>

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
                value={formData.status || 'available'} 
                onChange={e => setFormData({...formData, status: e.target.value as any})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background"
              >
                <option value="available">募集中</option>
                <option value="proposed">提案済</option>
                <option value="reserved">予約済</option>
                <option value="rented">貸出中</option>
                <option value="return_pending">返却予定</option>
                <option value="maintenance">整備中</option>
                <option value="suspended">掲載停止</option>
                <option value="unavailable">利用不可</option>
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

            {/* ── 車検証 ── */}
            <div className="col-span-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">車検証</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">車検証 所有者欄</label>
                  <input
                    type="text"
                    value={(formData as any).inspectionCertificateOwner ?? (formData as any).inspection_certificate_owner ?? ''}
                    onChange={e => setFormData({...formData, inspection_certificate_owner: e.target.value} as any)}
                    placeholder="例: 株式会社○○レンタカー"
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">車検証 使用者欄</label>
                  <input
                    type="text"
                    value={(formData as any).inspectionCertificateUser ?? (formData as any).inspection_certificate_user ?? ''}
                    onChange={e => setFormData({...formData, inspection_certificate_user: e.target.value} as any)}
                    placeholder="例: 田中 太郎"
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                </div>
              </div>
            </div>

            {/* ── 任意保険 ── */}
            <div className="col-span-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">任意保険</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">保険会社</label>
                  <input
                    type="text"
                    value={(formData as any).insuranceCompany ?? (formData as any).insurance_company ?? ''}
                    onChange={e => setFormData({...formData, insurance_company: e.target.value} as any)}
                    placeholder="例: 東京海上日動"
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">証券番号</label>
                  <input
                    type="text"
                    value={(formData as any).insurancePolicyNumber ?? (formData as any).insurance_policy_number ?? ''}
                    onChange={e => setFormData({...formData, insurance_policy_number: e.target.value} as any)}
                    placeholder="例: AB-1234567890"
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-sm font-medium">保険担当者</label>
                  <input
                    type="text"
                    value={(formData as any).insuranceContact ?? (formData as any).insurance_contact ?? ''}
                    onChange={e => setFormData({...formData, insurance_contact: e.target.value} as any)}
                    placeholder="例: 山田 花子（090-0000-0000）"
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50"
                  />
                </div>
              </div>
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
