import React, { useState, useRef } from 'react';
import {
  useListVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useListRentalCompanies,
  Vehicle,
} from '@workspace/api-client-react';
import { Loader2, Plus, Edit, Trash2, Save, Upload, X, ImageIcon, FileSearch, Camera, FileText, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BASE = import.meta.env.BASE_URL;
const API = (p: string) => `${BASE}api${p}`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const MAX_PHOTOS = 6;
const PHOTO_LABELS = ['前面', '後面', '左側面', '右側面', '内装', 'その他'];
type DocType = 'shaken' | 'kensakusho' | 'jibaiseki' | 'ninniHoken';

// ─── Helpers ────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPhoto(file: File, token: string): Promise<string> {
  const urlRes = await fetch(API('/storage/uploads/request-url'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error('アップロードURLの取得に失敗しました');
  const { uploadURL, objectPath } = await urlRes.json();
  const up = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!up.ok) throw new Error('アップロードに失敗しました');
  return objectPath as string;
}

// ─── Section header ─────────────────────────────────────────────────────────
function Section({ title }: { title: string }) {
  return <p className="col-span-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1 border-t border-border">{title}</p>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";
const sel = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

// ─── Status maps ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', reviewing: 'bg-orange-50 text-orange-700',
  available: 'bg-blue-50 text-blue-700', proposed: 'bg-purple-50 text-purple-700',
  reserved: 'bg-yellow-50 text-yellow-700', rented: 'bg-green-50 text-green-700',
  return_pending: 'bg-amber-50 text-amber-700', maintenance: 'bg-red-50 text-red-700',
  suspended: 'bg-gray-100 text-gray-600', unavailable: 'bg-gray-100 text-gray-400',
};
const STATUS_LABEL: Record<string, string> = {
  draft: '下書き', reviewing: '審査中', available: '募集中', proposed: '提案済',
  reserved: '予約済', rented: '貸出中', return_pending: '返却予定',
  maintenance: '整備中', suspended: '掲載停止', unavailable: '利用不可',
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function AdminVehicles() {
  const { data: vehicles, isLoading, refetch } = useListVehicles();
  const { data: rentalCompanies } = useListRentalCompanies();
  const { toast } = useToast();

  const createMut = useCreateVehicle();
  const updateMut = useUpdateVehicle();
  const deleteMut = useDeleteVehicle();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const set = (k: string, v: any) => setFormData(p => ({ ...p, [k]: v }));

  // ── Multi-photo state ──
  const [photoPaths, setPhotoPaths] = useState<(string | null)[]>(Array(MAX_PHOTOS).fill(null));
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const photoInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── 書類 state ──
  const [shakenDocPath, setShakenDocPath] = useState<string | null>(null);
  const [kensakushoDocPath, setKensakushoDocPath] = useState<string | null>(null);
  const [jibaisekiDocPath, setJibaisekiDocPath] = useState<string | null>(null);
  const [ninniHokenDocPath, setNinniHokenDocPath] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // ── 車検証 OCR state ──
  const [shakenParsing, setShakenParsing] = useState(false);
  const shakenInputRef = useRef<HTMLInputElement>(null);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handlePhotoUpload = async (file: File, idx: number) => {
    if (!file.type.startsWith('image/')) { toast({ variant: 'destructive', title: '画像ファイルを選択してください' }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ variant: 'destructive', title: '10MB以内の画像を選択してください' }); return; }
    setUploadingIdx(idx);
    try {
      const path = await uploadPhoto(file, tok());
      setPhotoPaths(prev => { const next = [...prev]; next[idx] = path; return next; });
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || 'アップロード失敗' });
    } finally { setUploadingIdx(null); }
  };

  const docSetters: Record<DocType, (v: string | null) => void> = {
    shaken: setShakenDocPath, kensakusho: setKensakushoDocPath,
    jibaiseki: setJibaisekiDocPath, ninniHoken: setNinniHokenDocPath,
  };

  const handleDocUpload = async (file: File, type: DocType) => {
    if (file.size > 20 * 1024 * 1024) { toast({ variant: 'destructive', title: '20MB以内のファイルを選択してください' }); return; }
    setUploadingDoc(type);
    try {
      const path = await uploadPhoto(file, tok());
      docSetters[type](path);
      toast({ title: 'アップロードしました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || 'アップロード失敗' });
    } finally { setUploadingDoc(null); }
  };

  const triggerDocUpload = (type: DocType) => {
    const el = document.createElement('input');
    el.type = 'file'; el.accept = 'image/*,application/pdf';
    el.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleDocUpload(f, type); };
    el.click();
  };

  const handleShakenOcr = async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast({ variant: 'destructive', title: '画像またはPDFを選択してください' }); return;
    }
    setShakenParsing(true);
    try {
      const b64 = await fileToBase64(file);
      const r = await fetch(API('/van/vehicles/parse-shaken'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: file.type }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      // フォームに自動入力
      setFormData(prev => ({
        ...prev,
        ...(json.licensePlate && { licensePlate: json.licensePlate }),
        ...(json.maker && { maker: json.maker }),
        ...(json.model && { model: json.model }),
        ...(json.grade && { grade: json.grade }),
        ...(json.vin && { vin: json.vin }),
        ...(json.year && { year: Number(json.year) }),
        ...(json.engineDisplacement && { engineDisplacement: json.engineDisplacement }),
        ...(json.fuelType && { fuelType: json.fuelType }),
        ...(json.transmission && { transmission: json.transmission }),
        ...(json.color && { color: json.color }),
        ...(json.inspectionExpiry && { inspectionExpiry: json.inspectionExpiry }),
        ...(json.inspectionCertificateOwner && { inspectionCertificateOwner: json.inspectionCertificateOwner }),
        ...(json.inspectionCertificateUser && { inspectionCertificateUser: json.inspectionCertificateUser }),
      }));
      toast({ title: '車検証を読み取りました。内容を確認してください。' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || 'OCR失敗' });
    } finally { setShakenParsing(false); }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      maker: '', model: '', grade: '', year: new Date().getFullYear(),
      color: '', vin: '', licensePlate: '', transmission: 'AT', fuelType: 'ガソリン',
      engineDisplacement: '', mileage: '', inspectionExpiry: '', compulsoryInsuranceExpiry: '',
      prefecture: '', locationDetail: '', monthlyPrice: 30000, sinJapanFee: 5000,
      minPeriodMonths: 1,
      availableFrom: '', smokingPolicy: 'no_smoking',
      hasEtc: false, hasDashcam: false, hasBackupCam: false,
      inspectionCertificateOwner: '', inspectionCertificateUser: '',
      insuranceCompany: '', insurancePolicyNumber: '', insuranceContact: '', insuranceExpiry: '',
      rentalCompanyId: '', status: 'available', notes: '',
    });
    setPhotoPaths(Array(MAX_PHOTOS).fill(null));
    setShakenDocPath(null); setKensakushoDocPath(null); setJibaisekiDocPath(null); setNinniHokenDocPath(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setFormData({ ...v, rentalCompanyId: (v as any).rentalCompany?.id ?? (v as any).rentalCompanyId ?? '' });
    try {
      const arr: (string | null)[] = JSON.parse((v as any).photos || '[]');
      const padded = [...arr, ...Array(MAX_PHOTOS).fill(null)].slice(0, MAX_PHOTOS);
      setPhotoPaths(padded);
    } catch { setPhotoPaths(Array(MAX_PHOTOS).fill(null)); }
    setShakenDocPath((v as any).shakenCertPath ?? null);
    setKensakushoDocPath((v as any).kensakushoCertPath ?? null);
    setJibaisekiDocPath((v as any).jibaisekiCertPath ?? null);
    setNinniHokenDocPath((v as any).ninniHokenCertPath ?? null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const photos = JSON.stringify(photoPaths.filter(Boolean));
      const data: any = {
        ...formData,
        photos,
        shakenCertPath: shakenDocPath,
        kensakushoCertPath: kensakushoDocPath,
        jibaisekiCertPath: jibaisekiDocPath,
        ninniHokenCertPath: ninniHokenDocPath,
        year: formData.year ? Number(formData.year) : null,
        mileage: formData.mileage ? Number(formData.mileage) : null,
        monthlyPrice: Math.round(Number(formData.monthlyPrice)),
        sinJapanFee: Math.round(Number(formData.sinJapanFee)) || 0,
        minPeriodMonths: Number(formData.minPeriodMonths) || 1,
        rentalCompanyId: formData.rentalCompanyId ? Number(formData.rentalCompanyId) : null,
      };
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data });
        toast({ title: '車両を更新しました' });
      } else {
        await createMut.mutateAsync({ data });
        toast({ title: '車両を登録しました' });
      }
      setIsModalOpen(false);
      refetch();
    } catch { toast({ variant: 'destructive', title: '保存に失敗しました' }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return;
    try { await deleteMut.mutateAsync({ id }); toast({ title: '削除しました' }); refetch(); }
    catch { toast({ variant: 'destructive', title: '削除に失敗しました' }); }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">車両管理</h1>
          <p className="text-muted-foreground text-sm mt-1">レンタル用の軽バン車両を管理します。</p>
        </div>
        <button onClick={handleOpenCreate}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition flex items-center gap-2">
          <Plus className="h-4 w-4" /> 新規登録
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium w-12"></th>
              <th className="px-4 py-3 font-medium">車両</th>
              <th className="px-4 py-3 font-medium">ステータス</th>
              <th className="px-4 py-3 font-medium">料金 (月額/手数料)</th>
              <th className="px-4 py-3 font-medium">エリア</th>
              <th className="px-4 py-3 font-medium">会社</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vehicles?.map(v => (
              <tr key={v.id} className="hover:bg-muted/30">
                <td className="pl-4 py-3">
                  {(() => {
                    try {
                      const photos = JSON.parse((v as any).photos || '[]');
                      if (photos[0]) return <img src={API(`/storage${photos[0]}`)} alt="" className="w-10 h-10 rounded-md object-cover border border-border" />;
                    } catch {}
                    return <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>;
                  })()}
                </td>
                <td className="px-4 py-4">
                  <div className="font-medium">{v.maker} {v.model}</div>
                  <div className="text-xs text-muted-foreground">{v.year ? `${v.year}年式` : ''}{(v as any).licensePlate ? ` · ${(v as any).licensePlate}` : ''}</div>
                </td>
                <td className="px-4 py-4">
                  <span className={`px-2 py-1 text-xs font-semibold rounded ${STATUS_COLORS[v.status] || 'bg-gray-100'}`}>{STATUS_LABEL[v.status] ?? v.status}</span>
                </td>
                <td className="px-4 py-4">
                  <div className="font-medium">¥{Number(v.monthlyPrice).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">+手数料 ¥{Number(v.sinJapanFee).toLocaleString()}</div>
                </td>
                <td className="px-4 py-4">{v.prefecture || '-'}</td>
                <td className="px-4 py-4 truncate max-w-[130px]">{(v as any).rentalCompany?.name || '-'}</td>
                <td className="px-4 py-4 text-right">
                  <button onClick={() => handleOpenEdit(v)} className="p-1.5 text-muted-foreground hover:text-foreground"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 text-muted-foreground hover:text-destructive ml-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '車両の編集' : '車両の新規登録'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-2">

            {/* ── 車検証 AI読み取り ── */}
            <div className="col-span-2 rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex items-center gap-4">
              <FileSearch className="h-8 w-8 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-800">車検証で自動入力</p>
                <p className="text-xs text-blue-600 mt-0.5">車検証の画像をアップロードするとAIが情報を読み取り自動入力します</p>
              </div>
              <input ref={shakenInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleShakenOcr(f); e.target.value = ''; }} />
              <button type="button" disabled={shakenParsing}
                onClick={() => shakenInputRef.current?.click()}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {shakenParsing ? <><Loader2 className="h-4 w-4 animate-spin" />読み取り中...</> : <><Upload className="h-4 w-4" />アップロード</>}
              </button>
            </div>

            {/* ── 車両写真 ── */}
            <Section title="車両写真" />
            <div className="col-span-2 grid grid-cols-3 gap-3">
              {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
                const path = photoPaths[i];
                const isUploading = uploadingIdx === i;
                return (
                  <div key={i} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{PHOTO_LABELS[i]}</p>
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-border bg-muted">
                      {path ? (
                        <>
                          <img src={API(`/storage${path}`)} alt="" className="w-full h-full object-cover" />
                          <button type="button"
                            onClick={() => setPhotoPaths(prev => { const n = [...prev]; n[i] = null; return n; })}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={isUploading}
                          onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handlePhotoUpload(f, i); }; el.click(); }}
                          className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition">
                          {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── 書類 ── */}
            <Section title="書類" />
            <div className="col-span-2 space-y-2">
              {([
                { label: '車検証',   path: shakenDocPath,     onSet: setShakenDocPath,     type: 'shaken'      },
                { label: '検査証',   path: kensakushoDocPath, onSet: setKensakushoDocPath, type: 'kensakusho'  },
                { label: '自賠責',   path: jibaisekiDocPath,  onSet: setJibaisekiDocPath,  type: 'jibaiseki'   },
                { label: '任意保険', path: ninniHokenDocPath, onSet: setNinniHokenDocPath, type: 'ninniHoken'  },
              ] as { label: string; path: string | null; onSet: (v: string | null) => void; type: DocType }[]).map(({ label, path, onSet, type }) => (
                <div key={type} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/30">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium w-20 shrink-0">{label}</span>
                  {path ? (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground truncate flex-1">{path.split('/').pop()}</span>
                      <a href={API(`/storage${path}`)} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
                      <button type="button" onClick={() => onSet(null)}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button type="button" disabled={uploadingDoc === type}
                      onClick={() => triggerDocUpload(type)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-muted transition disabled:opacity-50">
                      {uploadingDoc === type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      アップロード
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* ── 基本情報 ── */}
            <Section title="基本情報" />
            <Field label="メーカー">
              <input className={inp} value={formData.maker ?? ''} onChange={e => set('maker', e.target.value)} placeholder="例: スズキ" />
            </Field>
            <Field label="車種">
              <input className={inp} value={formData.model ?? ''} onChange={e => set('model', e.target.value)} placeholder="例: エブリイ" />
            </Field>
            <Field label="グレード">
              <input className={inp} value={formData.grade ?? ''} onChange={e => set('grade', e.target.value)} placeholder="例: PA" />
            </Field>
            <Field label="年式（西暦）">
              <input type="number" className={inp} value={formData.year ?? ''} onChange={e => set('year', e.target.value)} />
            </Field>
            <Field label="車体色">
              <input className={inp} value={formData.color ?? ''} onChange={e => set('color', e.target.value)} placeholder="例: ホワイト" />
            </Field>
            <Field label="ナンバープレート">
              <input className={inp} value={formData.licensePlate ?? ''} onChange={e => set('licensePlate', e.target.value)} placeholder="例: 横浜 300 あ 1234" />
            </Field>
            <Field label="車台番号（VIN）">
              <input className={inp} value={formData.vin ?? ''} onChange={e => set('vin', e.target.value)} placeholder="例: DA17V-123456" />
            </Field>
            <Field label="走行距離（km）">
              <input type="number" className={inp} value={formData.mileage ?? ''} onChange={e => set('mileage', e.target.value)} />
            </Field>
            <Field label="変速機">
              <select className={sel} value={formData.transmission ?? 'AT'} onChange={e => set('transmission', e.target.value)}>
                <option value="AT">AT</option>
                <option value="CVT">CVT</option>
                <option value="MT">MT</option>
                <option value="AMT">AMT</option>
              </select>
            </Field>
            <Field label="燃料">
              <select className={sel} value={formData.fuelType ?? 'ガソリン'} onChange={e => set('fuelType', e.target.value)}>
                <option>ガソリン</option>
                <option>軽油</option>
                <option>電気</option>
                <option>ハイブリッド</option>
                <option>LPG</option>
              </select>
            </Field>
            <Field label="排気量">
              <input className={inp} value={formData.engineDisplacement ?? ''} onChange={e => set('engineDisplacement', e.target.value)} placeholder="例: 660cc" />
            </Field>
            <Field label="喫煙">
              <select className={sel} value={formData.smokingPolicy ?? 'no_smoking'} onChange={e => set('smokingPolicy', e.target.value)}>
                <option value="no_smoking">禁煙</option>
                <option value="smoking_ok">喫煙可</option>
              </select>
            </Field>

            {/* ── 車検・保険 ── */}
            <Section title="車検・保険" />
            <Field label="車検満了日">
              <input type="date" className={inp} value={formData.inspectionExpiry ?? ''} onChange={e => set('inspectionExpiry', e.target.value)} />
            </Field>
            <Field label="自賠責保険満了日">
              <input type="date" className={inp} value={formData.compulsoryInsuranceExpiry ?? ''} onChange={e => set('compulsoryInsuranceExpiry', e.target.value)} />
            </Field>
            <Field label="車検証 所有者">
              <input className={inp} value={formData.inspectionCertificateOwner ?? ''} onChange={e => set('inspectionCertificateOwner', e.target.value)} placeholder="例: 株式会社○○レンタカー" />
            </Field>
            <Field label="車検証 使用者">
              <input className={inp} value={formData.inspectionCertificateUser ?? ''} onChange={e => set('inspectionCertificateUser', e.target.value)} placeholder="例: 田中 太郎" />
            </Field>
            <Field label="任意保険会社">
              <input className={inp} value={formData.insuranceCompany ?? ''} onChange={e => set('insuranceCompany', e.target.value)} placeholder="例: 東京海上日動" />
            </Field>
            <Field label="証券番号">
              <input className={inp} value={formData.insurancePolicyNumber ?? ''} onChange={e => set('insurancePolicyNumber', e.target.value)} placeholder="例: AB-1234567890" />
            </Field>
            <Field label="任意保険担当者">
              <input className={inp} value={formData.insuranceContact ?? ''} onChange={e => set('insuranceContact', e.target.value)} placeholder="例: 山田 花子（090-0000-0000）" />
            </Field>
            <Field label="任意保険満了日">
              <input type="date" className={inp} value={formData.insuranceExpiry ?? ''} onChange={e => set('insuranceExpiry', e.target.value)} />
            </Field>

            {/* ── 貸出条件 ── */}
            <Section title="貸出条件・料金" />
            <Field label="都道府県">
              <input className={inp} value={formData.prefecture ?? ''} onChange={e => set('prefecture', e.target.value)} placeholder="例: 神奈川県" />
            </Field>
            <Field label="所在地詳細">
              <input className={inp} value={formData.locationDetail ?? ''} onChange={e => set('locationDetail', e.target.value)} placeholder="例: 横浜市港北区" />
            </Field>
            <Field label="月額料金（原価）">
              <input type="number" className={inp} value={formData.monthlyPrice != null ? Math.round(Number(formData.monthlyPrice)) : ''} onChange={e => set('monthlyPrice', e.target.value)} />
            </Field>
            <Field label="SIN JAPAN 手数料">
              <input type="number" className={inp} value={formData.sinJapanFee != null ? Math.round(Number(formData.sinJapanFee)) : ''} onChange={e => set('sinJapanFee', e.target.value)} />
            </Field>
            <Field label="貸出開始日">
              <input type="date" className={inp} value={formData.availableFrom ?? ''} onChange={e => set('availableFrom', e.target.value)} />
            </Field>
            <Field label="最低利用期間（月）">
              <input type="number" className={inp} value={formData.minPeriodMonths ?? ''} onChange={e => set('minPeriodMonths', e.target.value)} />
            </Field>

            {/* ── 装備 ── */}
            <Section title="装備" />
            <div className="col-span-2 flex gap-6">
              {[['hasEtc', 'ETC'], ['hasDashcam', 'ドライブレコーダー'], ['hasBackupCam', 'バックカメラ']].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!formData[k]} onChange={e => set(k, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            {/* ── 管理情報 ── */}
            <Section title="管理情報" />
            <Field label="レンタル会社">
              <select className={sel} value={formData.rentalCompanyId ?? ''} onChange={e => set('rentalCompanyId', e.target.value)}>
                <option value="">（自社保有）</option>
                {rentalCompanies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="ステータス">
              <select className={sel} value={formData.status ?? 'available'} onChange={e => set('status', e.target.value)}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="備考" full>
              <textarea className={`${inp} h-20 resize-none`} value={formData.notes ?? ''} onChange={e => set('notes', e.target.value)} />
            </Field>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">キャンセル</button>
            <button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}
              className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存する
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
