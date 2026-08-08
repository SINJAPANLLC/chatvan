import React from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication, useAcceptVanProposal } from '@workspace/api-client-react';
import { Loader2, CheckCircle2, ChevronLeft, Calendar, MapPin, JapaneseYen, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';

export default function VanProposal() {
  const [, params] = useRoute('/van/:id/proposal');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId }
  });

  const acceptProposal = useAcceptVanProposal();

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
      toast({
        title: '申し込みが完了しました',
        description: '担当者から手続きのご案内をご連絡いたします。',
      });
      setLocation('/mypage');
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '申し込みに失敗しました。' });
    }
  };

  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
      
      <div className="mb-8">
        <button 
          onClick={() => {
            sessionStorage.setItem(`modifying_van_${applicationId}`, 'true');
            setLocation(`/van/${applicationId}`);
          }}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> チャットに戻る
        </button>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">提案された車両</h1>
        <p className="text-muted-foreground">
          ご希望の条件に合う車両が見つかりました。以下の車両からお選びください。
        </p>
      </div>

      {vehicles.length === 0 ? (
        <Card className="bg-muted border-dashed border-2 p-12 text-center">
          <p className="text-muted-foreground">現在提案中の車両はありません。</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vehicles.map((v) => (
            <Card key={v.id} className="overflow-hidden flex flex-col border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="aspect-video bg-muted relative flex items-center justify-center border-b border-border/50">
                <span className="text-muted-foreground font-medium">{v.maker} {v.model}</span>
                {v.status === '商談中' && (
                  <div className="absolute top-3 right-3 bg-secondary text-secondary-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                    残りわずか
                  </div>
                )}
              </div>
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="mb-4">
                  <h3 className="text-lg font-bold truncate">{v.maker} {v.model}</h3>
                  {v.year && <p className="text-sm text-muted-foreground">{v.year}年式</p>}
                </div>
                
                <div className="space-y-3 mb-6 flex-1">
                  <div className="flex justify-between items-end pb-3 border-b border-border/50">
                    <span className="text-sm text-muted-foreground flex items-center"><JapaneseYen className="h-4 w-4 mr-1"/>月額料金</span>
                    <span className="text-xl font-bold text-foreground">{formatPrice(v.userPrice)}<span className="text-sm font-normal text-muted-foreground ml-1">/月</span></span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center"><MapPin className="h-4 w-4 mr-1"/>エリア</span>
                    <span className="font-medium text-foreground">{v.prefecture || '指定なし'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground flex items-center"><Calendar className="h-4 w-4 mr-1"/>最低利用</span>
                    <span className="font-medium text-foreground">{v.minPeriodMonths}ヶ月〜</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-6">
                  {v.hasEtc && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground border border-border/50"><Check className="h-3 w-3 mr-1"/>ETC</span>}
                  {v.hasDashcam && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground border border-border/50"><Check className="h-3 w-3 mr-1"/>ドラレコ</span>}
                  {v.hasBackupCam && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground border border-border/50"><Check className="h-3 w-3 mr-1"/>バックカメラ</span>}
                </div>

                <button
                  onClick={() => handleAccept(v.id)}
                  disabled={acceptProposal.isPending || application.status === '申込受付'}
                  className="w-full py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {acceptProposal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'この車両を申し込む'}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {application.status === '申込受付' && (
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-green-900">申し込みを受け付けました</p>
            <p className="text-sm text-green-700 mt-1">担当者からの連絡をお待ちください。</p>
          </div>
        </div>
      )}
    </div>
  );
}
