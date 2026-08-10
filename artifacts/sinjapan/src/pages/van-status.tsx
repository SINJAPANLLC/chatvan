import React, { useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, CheckCircle2, Clock, FileText, CreditCard, Truck, XCircle, ChevronLeft } from 'lucide-react';

type Step = { label: string; description: string; icon: React.ReactNode };

const STEPS: Step[] = [
  { label: '審査中',   description: '申込内容を確認しています',   icon: <Clock className="h-5 w-5" /> },
  { label: '契約署名', description: '契約書の内容をご確認ください', icon: <FileText className="h-5 w-5" /> },
  { label: 'お支払い', description: '最初の月額料金をお支払いください', icon: <CreditCard className="h-5 w-5" /> },
  { label: '利用開始', description: '軽バンのご利用を開始できます',  icon: <Truck className="h-5 w-5" /> },
];

function getStep(status: string) {
  if (['new', 'hearing', 'proposed', 'application_received', 'screening', 'approved'].includes(status)) return 0;
  if (status === 'contracting') return 1;
  if (status === 'pending_payment') return 2;
  if (status === 'active' || status === 'completed') return 3;
  return 0;
}

export default function VanStatus() {
  const [, params] = useRoute('/van/:id/status');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();

  const { data: application, isLoading, refetch } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  // ステータスが変わるまでポーリング
  useEffect(() => {
    if (!application) return;
    if (application.status === 'active' || application.status === 'rejected') return;
    const timer = setInterval(() => refetch(), 15_000);
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

  const status = application.status;
  const isRejected = status === 'rejected';
  const currentStep = getStep(status);
  const contract = (application as any).contract;

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <button
        onClick={() => setLocation(`/van/${applicationId}`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> チャットに戻る
      </button>

      {isRejected ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">審査結果のご連絡</h1>
          <p className="text-muted-foreground mb-6">
            誠に恐れ入りますが、今回のご申込みはお断りとさせていただきました。<br />
            詳しくは担当者よりご連絡いたします。
          </p>
          <button
            onClick={() => setLocation('/')}
            className="px-6 py-2.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            トップへ戻る
          </button>
        </div>
      ) : (
        <>
          <div className="mb-10">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">お申込みの進捗</h1>
            <p className="text-sm text-muted-foreground">申込番号 #{String(applicationId).padStart(6, '0')}</p>
          </div>

          {/* ステップインジケーター */}
          <div className="mb-10">
            <div className="flex items-start">
              {STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                const future = i > currentStep;
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
                      <span className={`text-xs mt-2 font-medium text-center leading-tight ${
                        done ? 'text-foreground' : active ? 'text-foreground' : 'text-muted-foreground'
                      }`} style={{ maxWidth: '60px' }}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mt-5 mx-1 ${i < currentStep ? 'bg-foreground' : 'bg-border'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 現在のステップ詳細 */}
          <div className="rounded-2xl border-2 border-border p-8">
            {currentStep === 0 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-7 w-7 text-yellow-600" />
                </div>
                <h2 className="text-lg font-bold mb-2">
                  {status === 'approved' ? '承認されました。契約書を作成中です…' : '審査中です'}
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {status === 'approved'
                    ? '担当者が契約書を準備しています。しばらくお待ちください。'
                    : '通常1〜2営業日以内に審査結果をご連絡いたします。\n結果が出るとこの画面が自動で更新されます。'}
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                  15秒ごとに自動更新
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-7 w-7 text-blue-600" />
                </div>
                <h2 className="text-lg font-bold mb-2">契約書のご確認・署名</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  プラットフォーム利用契約と車両貸渡契約の内容をご確認いただき、
                  同意のうえ署名をお願いいたします。
                </p>
                <button
                  onClick={() => setLocation(`/van/${applicationId}/contract`)}
                  className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
                >
                  契約書を確認・署名する
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="h-7 w-7 text-green-600" />
                </div>
                <h2 className="text-lg font-bold mb-2">最初のお支払い</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  契約書へのご同意ありがとうございます。<br />
                  最初の月額料金をお支払いいただくと利用開始となります。
                </p>
                {contract && (
                  <p className="text-2xl font-bold mb-6">
                    ¥{Math.floor((Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0)) * 1.1).toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground ml-1">/月（税込）</span>
                  </p>
                )}
                <button
                  onClick={() => setLocation(`/van/${applicationId}/payment`)}
                  className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
                >
                  お支払いへ進む
                </button>
              </div>
            )}

            {currentStep === 3 && (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-7 w-7 text-background" />
                </div>
                <h2 className="text-lg font-bold mb-2">ご利用開始</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  すべての手続きが完了しました。<br />
                  担当者からお引き渡しのご連絡をいたします。
                </p>
                <button
                  onClick={() => setLocation('/mypage')}
                  className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
                >
                  マイページへ
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
