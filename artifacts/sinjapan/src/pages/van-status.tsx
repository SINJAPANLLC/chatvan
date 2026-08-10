import React, { useEffect, useState, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import {
  Loader2, CheckCircle2, Clock, FileText, CreditCard, Truck, XCircle,
  ChevronLeft, MapPin, ScanFace, AlertCircle, Phone, CalendarDays,
  RefreshCw, CircleX, PackageCheck, Image, ExternalLink,
} from 'lucide-react';
import EkycInlineForm from '@/components/EkycInlineForm';
import { useToast } from '@/hooks/use-toast';

const apiUrl = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

/** objectPath（例: /objects/uuid）→ 認証付き画像URL */
const objUrl = (path: string) => {
  const stripped = path.replace(/^\/objects\//, '');
  return apiUrl(`/storage/user-objects/${stripped}`);
};

type EkycStatus = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';
type Step = { label: string; icon: React.ReactNode };

const STEPS: Step[] = [
  { label: 'eKYC・審査', icon: <Clock className="h-5 w-5" /> },
  { label: '契約署名',   icon: <FileText className="h-5 w-5" /> },
  { label: 'お支払い',   icon: <CreditCard className="h-5 w-5" /> },
  { label: '受け取り',   icon: <Truck className="h-5 w-5" /> },
];

function getStep(status: string) {
  if (['new','hearing','proposed','application_received','screening'].includes(status)) return 0;
  if (status === 'approved' || status === 'contracting') return 1;
  if (status === 'payment_pending') return 2;
  if (status === 'delivery_pending') return 3;
  return -1; // active / issue / return / completed / cancelled → 別ビュー
}

function nextPaymentDate(paymentDay: number): string {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), paymentDay);
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, paymentDay);
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return s; }
}

function canRequestReturn(startDate: string | null | undefined, minimumTerm: number): boolean {
  if (!startDate) return true;
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + minimumTerm);
  return new Date() >= end;
}

function returnAvailableDate(startDate: string, minimumTerm: number): string {
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + minimumTerm);
  return end.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── 受け取り時アップロードフォーム ─────────────────────────────────────────
const PHOTO_SLOTS = [
  { key: 'front', label: '前方' },
  { key: 'rear',  label: '後方' },
  { key: 'left',  label: '左側' },
  { key: 'right', label: '右側' },
] as const;

type PhotoKey = typeof PHOTO_SLOTS[number]['key'];

async function uploadToStorage(
  file: File,
  applicationId: number
): Promise<string> {
  const r = await fetch(apiUrl('/storage/user-uploads/request-url'), {
    method: 'POST',
    credentials: 'include',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, contentType: file.type, applicationId }),
  });
  if (!r.ok) throw new Error('アップロードURLの取得に失敗しました');
  const { uploadURL, objectPath } = await r.json();
  const putRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!putRes.ok) throw new Error('ファイルのアップロードに失敗しました');
  return objectPath as string;
}

function PickupUploadForm({
  applicationId,
  onPhotosChange,
  onDocumentsChange,
}: {
  applicationId: number;
  onPhotosChange: (paths: Partial<Record<PhotoKey, string>>) => void;
  onDocumentsChange: (paths: string[]) => void;
}) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Partial<Record<PhotoKey, string>>>({});
  const [photoLoading, setPhotoLoading] = useState<Partial<Record<PhotoKey, boolean>>>({});
  const [docs, setDocs] = useState<string[]>([]);
  const [docLoading, setDocLoading] = useState(false);

  const handlePhotoUpload = async (key: PhotoKey, file: File) => {
    setPhotoLoading(prev => ({ ...prev, [key]: true }));
    try {
      const path = await uploadToStorage(file, applicationId);
      const next = { ...photos, [key]: path };
      setPhotos(next);
      onPhotosChange(next);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'アップロード失敗', description: e.message });
    } finally {
      setPhotoLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleDocUpload = async (file: File) => {
    setDocLoading(true);
    try {
      const path = await uploadToStorage(file, applicationId);
      const next = [...docs, path];
      setDocs(next);
      onDocumentsChange(next);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'アップロード失敗', description: e.message });
    } finally {
      setDocLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 4方向写真 */}
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-1">
          📸 車両4方向の写真 <span className="text-red-500 text-xs">（必須）</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PHOTO_SLOTS.map(({ key, label }) => {
            const uploaded = !!photos[key];
            const loading = !!photoLoading[key];
            return (
              <label key={key} className={`relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer transition-all min-h-[100px] ${
                uploaded ? 'border-foreground bg-foreground/5' : 'border-dashed border-border hover:border-foreground/40'
              }`}>
                <input
                  type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(key, f); }}
                  disabled={loading}
                />
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : uploaded ? (
                  <CheckCircle2 className="h-6 w-6 text-foreground mb-1" />
                ) : (
                  <span className="text-2xl mb-1">📷</span>
                )}
                <span className={`text-xs font-medium ${uploaded ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}{uploaded ? ' ✓' : ''}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 書類アップロード */}
      <div>
        <p className="text-sm font-medium mb-3 flex items-center gap-1">
          📄 所定書類 <span className="text-xs text-muted-foreground">（引渡確認書・任意）</span>
        </p>
        <div className="space-y-2">
          {docs.map((_, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-foreground bg-muted/40 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>書類 {i + 1} アップロード済み</span>
            </div>
          ))}
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-foreground/40 cursor-pointer transition-all text-sm text-muted-foreground ${docLoading ? 'opacity-50' : ''}`}>
            <input
              type="file" accept="image/*,application/pdf" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); }}
              disabled={docLoading}
            />
            {docLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>＋</span>}
            {docs.length === 0 ? '書類をアップロード（任意）' : 'さらに追加'}
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── ステップインジケーター ──────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-start mb-10">
      {STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                done   ? 'bg-foreground border-foreground text-background' :
                active ? 'bg-background border-foreground text-foreground ring-4 ring-foreground/10' :
                         'bg-muted border-border text-muted-foreground'
              }`}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : step.icon}
              </div>
              <span className={`text-xs mt-2 font-medium text-center leading-tight whitespace-nowrap ${
                done || active ? 'text-foreground' : 'text-muted-foreground'
              }`}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mt-5 mx-1 ${i < currentStep ? 'bg-foreground' : 'bg-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────────────
export default function VanStatus() {
  const [, params] = useRoute('/van/:id/status');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [ekycStatus, setEkycStatus] = useState<EkycStatus>('not_started');
  const [ekycRejReason, setEkycRejReason] = useState('');
  const [showEkycForm, setShowEkycForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [pickupPhotos, setPickupPhotos] = useState<Partial<Record<PhotoKey, string>>>({});
  const [pickupDocs, setPickupDocs] = useState<string[]>([]);

  const { data: application, isLoading, refetch } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  const fetchEkyc = useCallback(() => {
    if (!applicationId) return;
    fetch(apiUrl(`/van/applications/${applicationId}/identity-verification`), { credentials: 'include', headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.status) { setEkycStatus(d.status); setEkycRejReason(d.rejectionReason ?? ''); } })
      .catch(() => {});
  }, [applicationId]);

  useEffect(() => { fetchEkyc(); }, [fetchEkyc]);

  const handleEkycSubmitted = useCallback(() => {
    setShowEkycForm(false);
    setEkycStatus('submitted');
  }, []);

  useEffect(() => {
    if (!application) return;
    const activeStatuses = ['active', 'rejected', 'completed', 'cancelled', 'payment_issue', 'return_pending'];
    if (activeStatuses.includes(application.status)) return;
    const timer = setInterval(() => { refetch(); fetchEkyc(); }, 10_000);
    return () => clearInterval(timer);
  }, [application?.status, refetch, fetchEkyc]);

  const allPhotosUploaded = (PHOTO_SLOTS as readonly { key: PhotoKey; label: string }[]).every(s => !!pickupPhotos[s.key]);

  const handleConfirmPickup = async () => {
    if (!allPhotosUploaded) {
      toast({ variant: 'destructive', title: '写真が不足しています', description: '車両4方向（前・後・左・右）の写真をすべてアップロードしてください' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/van/applications/${applicationId}/confirm-pickup`), {
        method: 'POST', credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupPhotos: Object.values(pickupPhotos).filter(Boolean),
          pickupDocuments: pickupDocs,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? '処理に失敗しました'); }
      await refetch();
      toast({ title: '受け取り確認が完了しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReturn = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/van/applications/${applicationId}/request-return`), {
        method: 'POST', credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: returnReason }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? '処理に失敗しました'); }
      setShowReturnConfirm(false);
      await refetch();
      toast({ title: '解約申請を受け付けました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
  if (!application) return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-[50vh]">
      <p className="text-muted-foreground mb-4">情報が見つかりません</p>
      <button onClick={() => setLocation('/')} className="text-sm underline">トップへ戻る</button>
    </div>
  );

  const status = application.status;
  const contract = (application as any).contract as any;
  const vehicle = contract?.vehicle as any;
  const company = vehicle?.rentalCompany as any;
  const currentStep = getStep(status);

  const monthlyBase = contract ? Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0) : 0;
  const monthlyTotal = Math.floor(monthlyBase * 1.1);
  const fmt = (n: number) => `¥${Math.floor(n).toLocaleString()}`;

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <button onClick={() => setLocation(`/van/${applicationId}`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> チャットに戻る
      </button>

      {/* ── 審査NG ── */}
      {status === 'rejected' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">審査結果のご連絡</h1>
          <p className="text-muted-foreground mb-6">誠に恐れ入りますが、今回のご申込みはお断りとさせていただきました。<br />詳しくは担当者よりご連絡いたします。</p>
          <button onClick={() => setLocation('/')} className="px-6 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors">トップへ戻る</button>
        </div>
      )}

      {/* ── キャンセル ── */}
      {status === 'cancelled' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
            <CircleX className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">申込がキャンセルされました</h1>
          <p className="text-muted-foreground mb-6">ご利用いただきありがとうございました。またのご相談をお待ちしています。</p>
          <button onClick={() => setLocation('/')} className="px-6 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors">トップへ戻る</button>
        </div>
      )}

      {/* ── 利用終了 ── */}
      {status === 'completed' && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-background" />
          </div>
          <h1 className="text-2xl font-bold mb-2">ご利用ありがとうございました</h1>
          <p className="text-muted-foreground mb-6">返却手続きが完了しました。またのご相談をお待ちしています。</p>
          <button onClick={() => setLocation('/')} className="px-6 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors">トップへ戻る</button>
        </div>
      )}

      {/* ── 解約申請中 ── */}
      {status === 'return_pending' && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">解約申請中</h1>
          <p className="text-sm text-muted-foreground mb-8">申込番号 #{String(applicationId).padStart(6, '0')}</p>
          <div className="rounded-2xl border-2 border-border p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
              <Clock className="h-7 w-7 text-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">解約申請を受け付けました</h2>
            <p className="text-sm text-muted-foreground mb-6">担当者より返却手続きのご連絡をいたします（2〜3営業日以内）。</p>
            {company?.phone && (
              <a href={`tel:${company.phone}`}
                className="inline-flex items-center gap-2 px-6 py-2.5 border border-border rounded-full text-sm hover:bg-muted transition-colors">
                <Phone className="h-4 w-4" />{company.name}へ連絡する
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── 支払い問題 ── */}
      {status === 'payment_issue' && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">お支払いについて</h1>
          <p className="text-sm text-muted-foreground mb-8">申込番号 #{String(applicationId).padStart(6, '0')}</p>
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>
            <h2 className="text-lg font-bold mb-2 text-red-800">月額のお支払いに問題が発生しました</h2>
            <p className="text-sm text-red-700 mb-6">カードの決済に失敗しました。お支払い情報を更新するか、担当者へご連絡ください。</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => setLocation(`/van/${applicationId}/payment`)}
                className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4" />お支払い情報を更新する
              </button>
              {company?.phone && (
                <a href={`tel:${company.phone}`}
                  className="px-6 py-2.5 border border-border rounded-full text-sm hover:bg-muted transition-colors flex items-center justify-center gap-2">
                  <Phone className="h-4 w-4" />担当者へ連絡する
                </a>
              )}
            </div>
          </div>
          {/* 解約申請 */}
          <div className="text-center">
            <button onClick={() => setShowReturnConfirm(true)} className="text-sm text-muted-foreground underline">解約を申請する</button>
          </div>
        </div>
      )}

      {/* ── 利用中ダッシュボード ── */}
      {status === 'active' && (
        <div>
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium bg-foreground text-background rounded-full px-3 py-0.5">利用中</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {vehicle ? `${vehicle.maker} ${vehicle.model}` : 'ご利用中'}
              </h1>
              {vehicle?.year && <p className="text-sm text-muted-foreground">{vehicle.year}年式 / {vehicle.prefecture ?? ''}</p>}
            </div>
            <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center shrink-0">
              <Truck className="h-7 w-7 text-background" />
            </div>
          </div>

          {/* 月額・支払い情報 */}
          {contract && (
            <div className="rounded-xl border border-border overflow-hidden mb-4">
              <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />月額・支払い
              </div>
              <div className="p-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">月額料金（税込）</span>
                  <span className="font-bold text-lg">{fmt(monthlyTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">次回支払日</span>
                  <span className="font-medium flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    毎月{contract.paymentDay}日（次回: {nextPaymentDate(Number(contract.paymentDay))}）
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">利用開始日</span>
                  <span>{fmtDate(contract.startDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最低利用期間</span>
                  <span>{contract.minimumTerm}ヶ月</span>
                </div>
              </div>
            </div>
          )}

          {/* 契約書 */}
          {contract?.signatureData !== undefined && (
            <div className="rounded-xl border border-border overflow-hidden mb-4">
              <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />契約書
              </div>
              <div className="px-5 py-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">締結済み電子契約書</span>
                <button
                  onClick={() => setLocation(`/van/${applicationId}/contract`)}
                  className="flex items-center gap-1.5 px-4 py-1.5 border border-border rounded-full text-sm hover:bg-muted transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />確認する
                </button>
              </div>
            </div>
          )}

          {/* レンタル会社 */}
          {company && (
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">{company.name}</div>
              <div className="divide-y divide-border/50">
                {company.address && (
                  <div className="px-5 py-3 flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{company.address}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="px-5 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{company.phone}</span>
                    </div>
                    <a href={`tel:${company.phone}`}
                      className="px-3 py-1.5 text-xs bg-foreground text-background rounded-full hover:opacity-90 transition-opacity">
                      電話する
                    </a>
                  </div>
                )}
                {company.businessHours && (
                  <div className="px-5 py-3 flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{company.businessHours}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 書類・写真 */}
          {(() => {
            const pickupPhotos: string[] = (contract as any)?.pickupPhotos ?? [];
            const pickupDocs: string[] = (contract as any)?.pickupDocuments ?? [];
            const inspectionDoc: string | null = vehicle?.inspectionDoc ?? null;
            const insuranceDoc: string | null = vehicle?.compulsoryInsuranceDoc ?? null;
            const hasAny = pickupPhotos.length > 0 || pickupDocs.length > 0 || inspectionDoc || insuranceDoc;
            if (!hasAny) return null;
            return (
              <div className="rounded-xl border border-border overflow-hidden mb-4">
                <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
                  <Image className="h-4 w-4" />書類・写真
                </div>
                <div className="p-5 space-y-5">
                  {/* 受け取り時の写真 */}
                  {pickupPhotos.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">受け取り時の車両写真</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {pickupPhotos.map((path, i) => (
                          <a key={i} href={objUrl(path)} target="_blank" rel="noopener noreferrer"
                            className="block aspect-square rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity bg-muted">
                            <img src={objUrl(path)} alt={`受け取り写真 ${i + 1}`} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 受け取り書類 */}
                  {pickupDocs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">受け取り書類</p>
                      <div className="flex flex-col gap-2">
                        {pickupDocs.map((path, i) => (
                          <a key={i} href={objUrl(path)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            書類 {i + 1}
                            <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 車両書類（車検証・自賠責） */}
                  {(inspectionDoc || insuranceDoc) && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">車両書類</p>
                      <div className="flex flex-col gap-2">
                        {inspectionDoc && (
                          <a href={objUrl(inspectionDoc)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            車検証
                            <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                          </a>
                        )}
                        {insuranceDoc && (
                          <a href={objUrl(insuranceDoc)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            自賠責保険証
                            <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 解約申請 */}
          {!showReturnConfirm ? (
            <div className="text-center space-y-1">
              <button onClick={() => setShowReturnConfirm(true)}
                className="text-sm text-muted-foreground underline hover:text-foreground transition-colors">
                解約を申請する
              </button>
              {contract?.startDate && contract?.minimumTerm && !canRequestReturn(contract.startDate, Number(contract.minimumTerm)) && (
                <p className="text-xs text-muted-foreground">
                  ※ 最低利用期間の関係で{returnAvailableDate(contract.startDate, Number(contract.minimumTerm))}以降に解約可能です
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
                <CircleX className="h-4 w-4" />解約申請
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  解約申請後、担当者より返却手続きのご連絡をいたします。
                  申請後のキャンセルは担当者へお電話ください。
                </p>
                <div>
                  <label className="block text-xs font-medium mb-1">解約理由（任意）</label>
                  <textarea
                    rows={3} placeholder="解約の理由をお聞かせください"
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowReturnConfirm(false)} disabled={submitting}
                    className="flex-1 py-2.5 border border-border text-sm rounded-full hover:bg-muted transition-colors">
                    キャンセル
                  </button>
                  <button onClick={handleRequestReturn} disabled={submitting}
                    className="flex-1 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />申請中…</> : '解約申請を送信'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 申し込み進捗フロー (step 0〜3) ── */}
      {currentStep >= 0 && (
        <>
          <div className="mb-10">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">お申込みの進捗</h1>
            <p className="text-sm text-muted-foreground">申込番号 #{String(applicationId).padStart(6, '0')}</p>
          </div>
          <StepIndicator currentStep={currentStep} />

          <div className="rounded-2xl border-2 border-border p-8">
            {/* Step 0: eKYC・審査 */}
            {currentStep === 0 && (
              <div>
                {(ekycStatus === 'not_started' || ekycStatus === 'rejected') && (
                  <>
                    {!showEkycForm ? (
                      <div className="text-center">
                        {ekycStatus === 'rejected' ? (
                          <>
                            <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
                              <AlertCircle className="h-7 w-7 text-foreground" />
                            </div>
                            <h2 className="text-lg font-bold mb-2">本人確認が確認できませんでした</h2>
                            {ekycRejReason && <p className="text-sm text-muted-foreground border border-border rounded-lg px-4 py-2 mb-4 max-w-sm mx-auto">{ekycRejReason}</p>}
                            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">免許証の画像を確認のうえ、再度アップロードしてください。</p>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
                              <ScanFace className="h-7 w-7 text-foreground" />
                            </div>
                            <h2 className="text-lg font-bold mb-2">本人確認（eKYC）を行ってください</h2>
                            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">運転免許証の表裏と顔写真をアップロードしてください。AIが自動で確認します。</p>
                          </>
                        )}
                        <button onClick={() => setShowEkycForm(true)}
                          className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto">
                          <ScanFace className="h-4 w-4" />{ekycStatus === 'rejected' ? '再提出する' : '本人確認を始める'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <button type="button" onClick={() => setShowEkycForm(false)} className="text-xs text-muted-foreground hover:text-foreground underline">← 戻る</button>
                          <h2 className="text-base font-bold">本人確認書類の提出</h2>
                        </div>
                        <EkycInlineForm applicationId={applicationId} rejectionReason={ekycStatus === 'rejected' ? ekycRejReason : undefined} onSubmitted={handleEkycSubmitted} />
                      </div>
                    )}
                  </>
                )}
                {ekycStatus === 'submitted' && (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4"><Clock className="h-7 w-7 text-foreground" /></div>
                    <h2 className="text-lg font-bold mb-2">本人確認書類を確認中です</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">提出いただいた免許証・顔写真をAIが確認しています。通常数分で完了します。</p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" />10秒ごとに自動更新</div>
                  </div>
                )}
                {ekycStatus === 'verified' && (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4"><Clock className="h-7 w-7 text-foreground" /></div>
                    <div className="flex items-center justify-center gap-2 mb-4"><CheckCircle2 className="h-4 w-4 text-foreground" /><span className="text-xs text-foreground font-medium">本人確認完了</span></div>
                    <h2 className="text-lg font-bold mb-2">AI自動審査中です</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">申込内容をAIが審査しています。通常数分で完了します。</p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse" />10秒ごとに自動更新</div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: 契約署名 */}
            {currentStep === 1 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4"><FileText className="h-7 w-7 text-foreground" /></div>
                <h2 className="text-lg font-bold mb-2">契約書のご確認・署名</h2>
                <p className="text-sm text-muted-foreground mb-6">契約書の内容をご確認のうえ、電子署名をお願いします。</p>
                <button onClick={() => setLocation(`/van/${applicationId}/contract`)}
                  className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                  契約書を確認・署名する
                </button>
              </div>
            )}

            {/* Step 2: お支払い */}
            {currentStep === 2 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4"><CreditCard className="h-7 w-7 text-foreground" /></div>
                <h2 className="text-lg font-bold mb-2">最初のお支払い</h2>
                <p className="text-sm text-muted-foreground mb-2">契約書へのご同意ありがとうございます。<br />最初の月額料金をお支払いください。</p>
                {contract && <p className="text-2xl font-bold mb-6">{fmt(monthlyTotal)}<span className="text-sm font-normal text-muted-foreground ml-1">/月（税込）</span></p>}
                <button onClick={() => setLocation(`/van/${applicationId}/payment`)}
                  className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                  お支払いへ進む
                </button>
              </div>
            )}

            {/* Step 3: 受け取り確認 */}
            {currentStep === 3 && (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center shrink-0">
                    <PackageCheck className="h-5 w-5 text-background" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold leading-tight">受け取り確認</h2>
                    <p className="text-xs text-muted-foreground">4方向写真と書類をアップロードして受け取りを完了してください</p>
                  </div>
                </div>

                <div className="mb-5">
                  <button onClick={() => setLocation(`/van/${applicationId}/pickup`)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm">
                    <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />受け取り場所・担当者を確認する</span>
                    <span className="text-muted-foreground text-xs">→</span>
                  </button>
                </div>

                <div className="mb-6">
                  <PickupUploadForm
                    applicationId={applicationId}
                    onPhotosChange={setPickupPhotos}
                    onDocumentsChange={setPickupDocs}
                  />
                </div>

                <button
                  onClick={handleConfirmPickup}
                  disabled={submitting || !allPhotosUploaded}
                  className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" />確認中…</>
                    : <><CheckCircle2 className="h-4 w-4" />受け取りました（{Object.values(pickupPhotos).filter(Boolean).length}/4枚）</>
                  }
                </button>
                {!allPhotosUploaded && (
                  <p className="text-xs text-muted-foreground text-center mt-2">4方向すべての写真をアップロードすると確認できます</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 解約確認モーダル (payment_issue から) */}
      {showReturnConfirm && status === 'payment_issue' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-2xl border border-border max-w-sm w-full p-6">
            <h3 className="font-bold text-lg mb-2">解約申請</h3>
            <p className="text-sm text-muted-foreground mb-4">解約申請後、担当者より返却手続きのご連絡をいたします。</p>
            <textarea rows={3} placeholder="解約の理由（任意）" value={returnReason} onChange={e => setReturnReason(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowReturnConfirm(false)} disabled={submitting}
                className="flex-1 py-2.5 border border-border text-sm rounded-full hover:bg-muted transition-colors">キャンセル</button>
              <button onClick={handleRequestReturn} disabled={submitting}
                className="flex-1 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />申請中…</> : '送信'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
