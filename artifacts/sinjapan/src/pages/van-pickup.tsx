import React from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, MapPin, Phone, Clock, AlertCircle, Truck, Copy, ExternalLink, CalendarDays } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  } catch {
    return dateStr;
  }
}

export default function VanPickup() {
  const [, params] = useRoute('/van/:id/pickup');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label}をコピーしました` }));
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

  if (!contract || !company) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
        </button>
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">レンタル会社情報を準備中です。しばらくお待ちください。</p>
        </div>
      </div>
    );
  }

  const mapUrl = company.address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(company.address)}`
    : null;

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

      {/* レンタル会社情報 */}
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

      {/* 緊急連絡先 */}
      {company.emergencyContact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-amber-200 text-sm font-semibold flex items-center gap-2 text-amber-800">
            <AlertCircle className="h-4 w-4" />緊急連絡先
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-amber-900">{company.emergencyContact}</p>
          </div>
        </div>
      )}

      {mapUrl && (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-full text-sm font-medium hover:bg-muted transition-colors">
          <MapPin className="h-4 w-4" />Google マップで見る
        </a>
      )}
    </div>
  );
}
