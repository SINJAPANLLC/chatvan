import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { Loader2, Upload, CheckCircle, AlertCircle, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

type IDVStatus = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';

const STATUS_CONFIG: Record<IDVStatus, { label: string; color: string; icon: React.ReactNode }> = {
  not_started: { label: '未提出', color: 'text-muted-foreground', icon: null },
  submitted:   { label: '確認待ち', color: 'text-amber-600', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  verified:    { label: '確認済み', color: 'text-green-600', icon: <CheckCircle className="h-4 w-4" /> },
  rejected:    { label: '否認', color: 'text-red-600', icon: <AlertCircle className="h-4 w-4" /> },
  expired:     { label: '期限切れ', color: 'text-red-500', icon: <AlertCircle className="h-4 w-4" /> },
};

interface UploadedImage { path: string; preview: string; name: string }

function ImageUploader({
  label, value, onChange,
}: { label: string; value: UploadedImage | null; onChange: (v: UploadedImage | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const res = await fetch(API('/storage/user-uploads/request-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: file.name, contentType: file.type }),
      });
      if (!res.ok) throw new Error('Upload URL取得失敗');
      const { uploadURL, objectPath } = await res.json();

      const putRes = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      const preview = URL.createObjectURL(file);
      onChange({ path: objectPath, preview, name: file.name });
    } catch (e) {
      console.error(e);
      alert('アップロードに失敗しました。もう一度お試しください。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-medium mb-2">{label}</p>
      <div
        className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-colors cursor-pointer hover:bg-muted
          ${value ? 'border-green-400 bg-green-50' : 'border-border'}`}
        style={{ minHeight: 120 }}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : value ? (
          <>
            <img src={value.preview} alt={label} className="max-h-28 object-contain rounded-lg" />
            <button
              type="button"
              className="absolute top-1 right-1 bg-background border border-border rounded-full p-0.5"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">タップして画像を選択</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
    </div>
  );
}

export default function IdentityVerificationPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [existingStatus, setExistingStatus] = useState<IDVStatus | null>(null);
  const [existingRejectionReason, setExistingRejectionReason] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseType, setLicenseType] = useState('普通');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [frontImage, setFrontImage] = useState<UploadedImage | null>(null);
  const [backImage, setBackImage] = useState<UploadedImage | null>(null);
  const [selfieImage, setSelfieImage] = useState<UploadedImage | null>(null);

  useEffect(() => {
    if (!userLoading && !user) { setLocation('/login'); return; }
    if (!user) return;

    // Pre-fill name/phone from user profile
    setFullName(user.name ?? '');
    setPhone((user as any).phone ?? '');

    const fetchData = async () => {
      try {
        const [ivRes, appsRes] = await Promise.all([
          fetch(API('/van/my/identity-verification'), { headers: { Authorization: `Bearer ${token()}` } }),
          fetch(API('/van/my/applications'), { headers: { Authorization: `Bearer ${token()}` } }),
        ]);
        if (ivRes.ok) {
          const iv = await ivRes.json();
          if (iv?.status) {
            setExistingStatus(iv.status as IDVStatus);
            // API returns camelCase (Drizzle ORM serialization)
            setExistingRejectionReason(iv.rejectionReason ?? null);
            if (iv.fullName) setFullName(iv.fullName);
            if (iv.phone) setPhone(iv.phone);
            if (iv.birthDate) setBirthDate(iv.birthDate);
            if (iv.address) setAddress(iv.address);
            if (iv.licenseType) setLicenseType(iv.licenseType);
            if (iv.licenseNumber) setLicenseNumber(iv.licenseNumber);
            if (iv.licenseExpiry) setLicenseExpiry(iv.licenseExpiry);
          }
          if (iv?.applicationId) setApplicationId(iv.applicationId);
        }
        if (appsRes.ok) {
          const apps = await appsRes.json();
          if (apps?.length > 0 && !applicationId) setApplicationId(apps[0].id);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, userLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frontImage) { toast({ title: '免許証表面の画像を添付してください', variant: 'destructive' }); return; }
    if (!backImage) { toast({ title: '免許証裏面の画像を添付してください', variant: 'destructive' }); return; }
    if (!selfieImage) { toast({ title: '顔写真（セルフィー）を添付してください', variant: 'destructive' }); return; }
    if (!applicationId) { toast({ title: '申込情報が見つかりません。先にチャットで相談を開始してください。', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const res = await fetch(API(`/van/applications/${applicationId}/identity-verification`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          full_name: fullName,
          birth_date: birthDate,
          address,
          phone,
          license_type: licenseType,
          license_number: licenseNumber,
          license_expiry: licenseExpiry,
          license_front: frontImage.path,
          license_back: backImage.path,
          selfie_photo: selfieImage.path,
        }),
      });
      if (!res.ok) throw new Error('送信失敗');
      setDone(true);
      setExistingStatus('submitted');
    } catch {
      toast({ title: '送信に失敗しました。もう一度お試しください。', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  // Already verified
  if (existingStatus === 'verified') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">本人確認が完了しています</h1>
        <p className="text-muted-foreground mb-6">免許証の確認が完了しています。引き続きサービスをご利用ください。</p>
        <button onClick={() => setLocation('/mypage')} className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
          マイページへ戻る
        </button>
      </div>
    );
  }

  // Submitted successfully (this session)
  if (done || existingStatus === 'submitted') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <CheckCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">提出が完了しました</h1>
        <p className="text-muted-foreground mb-6">運営スタッフが内容を確認いたします。確認完了までしばらくお待ちください。</p>
        <button onClick={() => setLocation('/mypage')} className="px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
          マイページへ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1">本人確認書類の提出</h1>
        <p className="text-muted-foreground text-sm">免許証の表裏と顔写真をアップロードしてください。AIが自動で確認します。</p>
        {existingStatus === 'rejected' && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <strong>否認されました。</strong>{existingRejectionReason ? `　理由: ${existingRejectionReason}` : ''} 内容を修正して再提出してください。
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">氏名 <span className="text-red-500">*</span></label>
                <input
                  required value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">生年月日 <span className="text-red-500">*</span></label>
                <input
                  required type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium block mb-1.5">住所 <span className="text-red-500">*</span></label>
                <input
                  required value={address} onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                  placeholder="東京都渋谷区..."
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">電話番号 <span className="text-red-500">*</span></label>
                <input
                  required value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                  placeholder="090-1234-5678"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 免許証情報 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">運転免許証</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ImageUploader label="表面 *" value={frontImage} onChange={setFrontImage} />
              <ImageUploader label="裏面 *" value={backImage} onChange={setBackImage} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1.5">免許種別 <span className="text-red-500">*</span></label>
                <select
                  required value={licenseType} onChange={e => setLicenseType(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                >
                  {['普通', '準中型', '中型', '大型', '普通二輪', '大型二輪'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">免許番号 <span className="text-red-500">*</span></label>
                <input
                  required value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                  placeholder="123456789012"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">有効期限 <span className="text-red-500">*</span></label>
                <input
                  required type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 顔写真 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">顔写真（セルフィー）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              正面を向いた顔写真を撮影してください。免許証の顔写真と照合します。<br />
              帽子・サングラス等は外し、明るい場所で撮影してください。
            </p>
            <div className="max-w-[200px]">
              <ImageUploader label="顔写真 *" value={selfieImage} onChange={setSelfieImage} />
            </div>
          </CardContent>
        </Card>

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {submitting ? '送信中...' : '本人確認書類を提出する'}
        </button>
      </form>
    </div>
  );
}
