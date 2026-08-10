import React, { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication, useAcceptVanProposal } from '@workspace/api-client-react';
import {
  Loader2, CheckCircle2, ChevronLeft, Calendar, MapPin, JapaneseYen,
  Check, Clock, ChevronRight, Gauge, CarFront,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const apiUrl = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const objUrl = (path: string) => {
  const stripped = path.replace(/^\/objects\//, '');
  return apiUrl(`/storage/user-objects/${stripped}`);
};

function parsePhotos(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map(objUrl) : [];
  } catch {
    return [];
  }
}

/** 写真ギャラリー（サムネイル付き） */
function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-muted flex items-center justify-center rounded-xl overflow-hidden">
        <img src="/logo.jpg" alt="Chat VAN" className="w-28 h-28 object-contain opacity-30" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* メイン画像 */}
      <div className="relative w-full aspect-[16/9] bg-muted rounded-xl overflow-hidden">
        <img
          src={photos[current]}
          alt={alt}
          className="w-full h-full object-contain"
        />
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setCurrent((c) => (c - 1 + photos.length) % photos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrent((c) => (c + 1) % photos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* サムネイル */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === current ? 'border-foreground' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`${alt} ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VanProposal() {
  const [, params] = useRoute('/van/:id/proposal');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: application, isLoading, refetch } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId }
  });

  const acceptProposal = useAcceptVanProposal();

  useEffect(() => {
    if (!application) return;
    if (application.status === 'proposed') return;
    const timer = setInterval(() => refetch(), 30000);
    return () => clearInterval(timer);
  }, [application?.status, refetch]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-[50vh]">
        <p className="text-muted-foreground mb-4">情報が見つかりません</p>
        <button onClick={() => setLocation('/')} className="text-sm underline">トップへ戻る</button>
      </div>
    );
  }

  const vehicles = application.proposedVehicles || [];

  const handleAccept = async (vehicleId: number) => {
    try {
      await acceptProposal.mutateAsync({ id: applicationId, data: { vehicleId } });
      toast({ title: '申し込みが完了しました', description: '審査状況をご確認ください。' });
      setLocation(`/van/${applicationId}/status`);
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '申し込みに失敗しました。' });
    }
  };

  const fmt = (val: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);
  const taxIn = (val: number) => Math.floor(val * 1.1);

  // 台数に応じてレイアウト切り替え
  const count = vehicles.length;
  const isMulti = count > 1;
  const maxW = count >= 3 ? 'max-w-4xl' : count === 2 ? 'max-w-3xl' : 'max-w-2xl';

  return (
    <div className={`flex-1 ${maxW} mx-auto w-full px-4 py-8`}>
      {/* ヘッダー */}
      <button
        onClick={() => {
          sessionStorage.setItem(`modifying_van_${applicationId}`, 'true');
          setLocation(`/van/${applicationId}`);
        }}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> チャットに戻る
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">提案された車両</h1>
      <p className="text-sm text-muted-foreground mb-8">
        ご希望の条件に合わせてAIが自動で選定しました。
      </p>

      {/* 車両なし */}
      {vehicles.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-lg mb-1">車両を準備中です</p>
              <p className="text-sm text-muted-foreground">
                まもなく提案が届きます。チャット画面に通知が表示されます。
              </p>
            </div>
            <button
              onClick={() => setLocation(`/van/${applicationId}`)}
              className="mt-2 px-5 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              チャット画面に戻る
            </button>
          </div>
        </div>
      ) : (
        <div className={
          count === 1 ? 'space-y-6' :
          count === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' :
                        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        }>
          {vehicles.map((v: any) => {
            const photos = parsePhotos(v.photos);
            const features = [
              v.hasEtc && 'ETC',
              v.hasDashcam && 'ドラレコ',
              v.hasBackupCam && 'バックカメラ',
            ].filter(Boolean) as string[];

            return (
              <div key={v.id} className="border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                {/* 写真 */}
                <div className={isMulti ? 'px-3 pt-3 pb-2' : 'px-4 pt-4 pb-3'}>
                  <PhotoGallery photos={photos} alt={`${v.maker} ${v.model}`} />
                </div>

                <div className={`flex flex-col flex-1 ${isMulti ? 'px-3 pb-3' : 'px-4 pb-4'}`}>
                  {/* 車両名 + 月額 */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h2 className={`font-bold leading-snug ${isMulti ? 'text-sm' : 'text-base'}`}>
                      {v.maker} {v.model}{v.grade ? ` ${v.grade}` : ''}
                    </h2>
                    <div className="text-right shrink-0">
                      <p className={`font-bold ${isMulti ? 'text-base' : 'text-lg'}`}>
                        {fmt(taxIn(v.userPrice))}<span className="text-xs font-normal text-muted-foreground ml-0.5">/月</span>
                      </p>
                      {!isMulti && <p className="text-xs text-muted-foreground">税抜 {fmt(v.userPrice)}</p>}
                    </div>
                  </div>

                  {/* スペック */}
                  <div className={`divide-y divide-border/60 border border-border/60 rounded-xl overflow-hidden mb-3 ${isMulti ? 'text-xs' : 'text-sm'}`}>
                    {[
                      v.year     && { icon: <CarFront className="h-3.5 w-3.5" />, label: '年式',     value: `${v.year}年式` },
                      v.mileage  && { icon: <Gauge className="h-3.5 w-3.5" />,    label: '走行距離', value: `${v.mileage.toLocaleString()} km` },
                      { icon: <MapPin className="h-3.5 w-3.5" />,   label: 'エリア',       value: v.prefecture || '指定なし' },
                      { icon: <Calendar className="h-3.5 w-3.5" />, label: '最低利用',     value: `${v.minPeriodMonths ?? 1}ヶ月〜` },
                      !isMulti && v.maxPeriodMonths  && { icon: <Calendar className="h-3.5 w-3.5" />, label: '最長利用',   value: `${v.maxPeriodMonths}ヶ月` },
                      !isMulti && v.mileageLimit     && { icon: <Gauge className="h-3.5 w-3.5" />,    label: '走行上限',   value: `${v.mileageLimit.toLocaleString()} km` },
                      !isMulti && v.excessMileageFee && { icon: <JapaneseYen className="h-3.5 w-3.5" />, label: '超過料金', value: `${fmt(v.excessMileageFee)} / km` },
                      !isMulti && v.inspectionExpiry && { icon: <CarFront className="h-3.5 w-3.5" />,  label: '車検満了', value: v.inspectionExpiry },
                      !isMulti && v.availableFrom    && { icon: <Calendar className="h-3.5 w-3.5" />,  label: '開始可能日', value: v.availableFrom },
                    ].filter(Boolean).map((row: any, i: number) => (
                      <div key={i} className={`flex items-center justify-between ${isMulti ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
                        <span className="flex items-center gap-1.5 text-muted-foreground">{row.icon}{row.label}</span>
                        <span className="font-medium text-right ml-2">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* 装備バッジ */}
                  {features.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {features.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted border border-border">
                          <Check className="h-3 w-3 text-green-600" />{f}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 備考（1台のみ表示） */}
                  {!isMulti && v.notes && (
                    <div className="mb-3 p-3 bg-muted/40 rounded-xl">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">備考</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{v.notes}</p>
                    </div>
                  )}

                  {/* 申し込みボタン */}
                  <button
                    onClick={() => handleAccept(v.id)}
                    disabled={acceptProposal.isPending || application.status === 'application_received'}
                    className={`mt-auto w-full bg-foreground text-background font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isMulti ? 'py-2.5 text-xs' : 'py-3.5 text-sm'}`}
                  >
                    {acceptProposal.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" />処理中...</>
                      : 'この車両を申し込む'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 申し込み済みバナー */}
      {application.status === 'application_received' && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900">申し込みを受け付けました</p>
            <p className="text-sm text-green-700 mt-0.5">担当者からの連絡をお待ちください。</p>
          </div>
        </div>
      )}
    </div>
  );
}
