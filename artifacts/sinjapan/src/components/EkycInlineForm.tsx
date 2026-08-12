import React, { useState, useRef } from 'react';
import { Loader2, Upload, X, Camera, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const apiUrl = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

interface UploadedImage { path: string; preview: string }

function ImageUploader({ label, value, onChange, facing, cameraOnly }: {
  label: string;
  value: UploadedImage | null;
  onChange: (v: UploadedImage | null) => void;
  /** 'user' = インカメラ（セルフィー）, 'environment' = アウトカメラ（書類撮影）, undefined = カメラボタンなし */
  facing?: 'user' | 'environment';
  /** true のときカメラ撮影のみ（ファイル選択なし） */
  cameraOnly?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const res = await fetch(apiUrl('/storage/user-uploads/request-url'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: file.name, contentType: file.type }),
      });
      if (!res.ok) throw new Error('URL取得失敗');
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      onChange({ path: objectPath, preview: URL.createObjectURL(file) });
    } catch {
      alert('アップロードに失敗しました。もう一度お試しください。');
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>

      {/* プレビュー表示 */}
      {value ? (
        <div className="relative border-2 border-foreground border-dashed rounded-xl flex flex-col items-center justify-center p-3 bg-muted/40" style={{ minHeight: 90 }}>
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <img src={value.preview} alt={label} className="max-h-20 object-contain rounded" />
              <button
                type="button"
                className="absolute top-1 right-1 bg-background border border-border rounded-full p-0.5"
                onClick={() => onChange(null)}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      ) : facing && cameraOnly ? (
        /* カメラのみ：1ボタン */
        <button
          type="button"
          disabled={uploading}
          onClick={() => cameraRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1 border-2 border-dashed border-border rounded-xl py-4 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          <span>カメラで撮影</span>
        </button>
      ) : facing ? (
        /* カメラあり：2ボタンレイアウト */
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-border rounded-xl py-3 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span>カメラ撮影</span>
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-border rounded-xl py-3 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            <span>ファイル選択</span>
          </button>
        </div>
      ) : (
        /* カメラなし：従来の1ボタン */
        <div
          className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center p-3 cursor-pointer hover:bg-muted transition-colors"
          style={{ minHeight: 90 }}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          {uploading
            ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            : <><Upload className="h-5 w-5 text-muted-foreground mb-1" /><p className="text-xs text-muted-foreground">タップして選択</p></>
          }
        </div>
      )}

      {/* 隠し input：ファイル選択 */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      {/* 隠し input：カメラ撮影 */}
      {facing && (
        <input ref={cameraRef} type="file" accept="image/*" capture={facing} className="hidden" onChange={onFileChange} />
      )}
    </div>
  );
}

interface Props {
  applicationId: number;
  rejectionReason?: string;
  onSubmitted: () => void;
}

export default function EkycInlineForm({ applicationId, rejectionReason, onSubmitted }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

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

  const inputCls = 'w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground';
  const labelCls = 'text-xs font-medium text-muted-foreground block mb-1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frontImage)  { toast({ title: '免許証表面の画像を添付してください', variant: 'destructive' }); return; }
    if (!backImage)   { toast({ title: '免許証裏面の画像を添付してください', variant: 'destructive' }); return; }
    if (!selfieImage) { toast({ title: '顔写真を添付してください', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/van/applications/${applicationId}/identity-verification`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          full_name: fullName, birth_date: birthDate, address, phone,
          license_type: licenseType, license_number: licenseNumber, license_expiry: licenseExpiry,
          license_front: frontImage.path, license_back: backImage.path, selfie_photo: selfieImage.path,
        }),
      });
      if (!res.ok) throw new Error('送信失敗');
      onSubmitted();
    } catch {
      toast({ title: '送信に失敗しました。もう一度お試しください。', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="text-left space-y-5">
      {rejectionReason && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <strong>否認理由：</strong>{rejectionReason}　内容を修正して再提出してください。
        </div>
      )}

      {/* 基本情報 */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">基本情報</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>氏名 *</label>
            <input required value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} placeholder="山田 太郎" />
          </div>
          <div>
            <label className={labelCls}>生年月日 *</label>
            <input required type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>住所 *</label>
            <input required value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="東京都渋谷区..." />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>電話番号 *</label>
            <input required value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="090-1234-5678" />
          </div>
        </div>
      </div>

      {/* 運転免許証 */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">運転免許証</p>
        <div className="grid grid-cols-2 gap-3">
          <ImageUploader label="表面 *" value={frontImage} onChange={setFrontImage} facing="environment" />
          <ImageUploader label="裏面 *" value={backImage}  onChange={setBackImage}  facing="environment" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>種別 *</label>
            <select required value={licenseType} onChange={e => setLicenseType(e.target.value)} className={inputCls}>
              {['普通', '準中型', '中型', '大型', '普通二輪', '大型二輪'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>免許番号 *</label>
            <input required value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} className={inputCls} placeholder="12桁" />
          </div>
          <div>
            <label className={labelCls}>有効期限 *</label>
            <input required type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* 顔写真 */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">顔写真（セルフィー）</p>
        <p className="text-xs text-muted-foreground">正面・帽子なし・明るい場所で撮影。免許証の顔写真と照合します。</p>
        <div className="max-w-xs">
          <ImageUploader label="顔写真 *" value={selfieImage} onChange={setSelfieImage} facing="user" cameraOnly />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-3 bg-foreground text-background font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
        {submitting ? '送信中...' : '本人確認書類を提出する'}
      </button>
    </form>
  );
}
