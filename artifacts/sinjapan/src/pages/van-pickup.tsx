import React, { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, MapPin, Phone, Clock, AlertCircle, Truck, Copy, ExternalLink, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token')}`,
  'Content-Type': 'application/json',
});

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  } catch {
    return dateStr;
  }
}

// ─── 写真アップロード ────────────────────────────────────────────────────────
const PHOTO_SLOTS = [
  { key: 'front', label: '前方' },
  { key: 'rear',  label: '後方' },
  { key: 'left',  label: '左側' },
  { key: 'right', label: '右側' },
] as const;
type PhotoKey = typeof PHOTO_SLOTS[number]['key'];

async function uploadToStorage(file: File, applicationId: number): Promise<string> {
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

export default function VanPickup() {
  const [, params] = useRoute('/van/:id/pickup');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [photos, setPhotos] = useState<Partial<Record<PhotoKey, string>>>({});
  const [photoLoading, setPhotoLoading] = useState<Partial<Record<PhotoKey, boolean>>>({});
  const [docs, setDocs] = useState<string[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label}をコピーしました` }));
  };

  const handlePhotoUpload = async (key: PhotoKey, file: File) => {
    setPhotoLoading(prev => ({ ...prev, [key]: true }));
    try {
      const path = await uploadToStorage(file, applicationId);
      setPhotos(prev => ({ ...prev, [key]: path }));
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
      setDocs(prev => [...prev, path]);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'アップロード失敗', description: e.message });
    } finally {
      setDocLoading(false);
    }
  };

  const allPhotosUploaded = PHOTO_SLOTS.every(s => !!photos[s.key]);

  const handleConfirmPickup = async () => {
    if (!allPhotosUploaded) {
      toast({ variant: 'destructive', title: '写真が不足しています', description: '車両4方向（前・後・左・右）の写真をすべてアップロードしてください' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(apiUrl(`/van/applications/${applicationId}/confirm-pickup`), {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupPhotos: Object.values(photos).filter(Boolean),
          pickupDocuments: docs,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? '処理に失敗しました'); }
      setDone(true);
      toast({ title: '受け取り確認が完了しました' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const contract = (application as any)?.contract as any;
  const company = contract?.vehicle?.rentalCompany as any;
  const pickupDate = contract?.startDate ?? contract?.start_date;

  if (!contract) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
        </button>
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">契約情報を準備中です。しばらくお待ちください。</p>
        </div>
      </div>
    );
  }

  const mapUrl = company?.address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(company.address)}`
    : null;

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-foreground flex items-center justify-center mb-6">
          <CheckCircle2 className="h-10 w-10 text-background" />
        </div>
        <h1 className="text-2xl font-bold mb-2">受け取り確認が完了しました</h1>
        <p className="text-muted-foreground mb-8">ご利用開始です。何かあればチャットからご連絡ください。</p>
        <button onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
          進捗を確認する
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <button onClick={() => setLocation(`/van/${applicationId}/status`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">車両の受け取り</h1>
        <p className="text-sm text-muted-foreground">担当のレンタル会社にお越しください</p>
      </div>

      {/* 受け取り予定日 */}
      {pickupDate && (
        <div className="rounded-xl border-2 border-foreground overflow-hidden mb-6">
          <div className="px-5 py-3 bg-foreground text-background text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />受け取り予定日
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-xl font-bold">{formatDate(pickupDate)}</p>
          </div>
          <div className="px-5 pb-4">
            <p className="text-xs text-muted-foreground">※ 正確な時間は事前にレンタル会社へお電話でご確認ください</p>
          </div>
        </div>
      )}

      {/* 受け取り手順 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4" />受け取り手順
        </div>
        <div className="p-5 space-y-3">
          {[
            '事前にレンタル会社へ電話でご連絡ください',
            pickupDate ? `${formatDate(pickupDate)}に担当者と時間を確認してください` : '受け取り日時を担当者と調整してください',
            '当日は本人確認書類（免許証）をお持ちください',
            '車両の状態を担当者と確認してから受け取りください',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* レンタル会社情報・緊急連絡先・マップ */}
      {!company && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 mb-6 text-sm text-amber-800">
          レンタル会社情報が未設定です。担当者よりご連絡いたします。
        </div>
      )}
      {company && (
        <>
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">
              {company.name}
            </div>
            <div className="divide-y divide-border/50">
              {company.address && (
                <div className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">住所</p>
                      <p className="text-sm font-medium">{company.address}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => copy(company.address, '住所')}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {mapUrl && (
                      <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
              {company.phone && (
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">電話番号</p>
                      <p className="text-sm font-medium">{company.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copy(company.phone, '電話番号')}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a href={`tel:${company.phone}`}
                      className="px-3 py-1.5 text-xs bg-foreground text-background rounded-full hover:opacity-90 transition-opacity">
                      電話する
                    </a>
                  </div>
                </div>
              )}
              {company.businessHours && (
                <div className="px-5 py-4 flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">営業時間</p>
                    <p className="text-sm font-medium whitespace-pre-line">{company.businessHours}</p>
                  </div>
                </div>
              )}
              {company.contactName && (
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">担当者</p>
                    <p className="text-sm font-medium">{company.contactName}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {company.emergencyContact && (
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <div className="px-5 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />緊急連絡先
              </div>
              <div className="px-5 py-4">
                <p className="text-sm">{company.emergencyContact}</p>
              </div>
            </div>
          )}

          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-full text-sm font-medium hover:bg-muted transition-colors mb-8">
              <MapPin className="h-4 w-4" />Google マップで見る
            </a>
          )}
        </>
      )}

      {/* 受け取り確認 */}
      <div className="border-t border-border pt-8">
        <h2 className="text-base font-bold mb-1">受け取り確認</h2>
        <p className="text-xs text-muted-foreground mb-5">4方向写真と書類をアップロードして受け取りを完了してください</p>

        {/* 4方向写真 */}
        <div className="mb-5">
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
        <div className="mb-6">
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

        {/* 確認ボタン */}
        <button
          onClick={handleConfirmPickup}
          disabled={submitting || !allPhotosUploaded}
          className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin" />確認中…</>
            : <><CheckCircle2 className="h-4 w-4" />受け取りました（{Object.values(photos).filter(Boolean).length}/4枚）</>
          }
        </button>
        {!allPhotosUploaded && (
          <p className="text-xs text-muted-foreground text-center mt-2">4方向すべての写真をアップロードすると確認できます</p>
        )}
      </div>
    </div>
  );
}
