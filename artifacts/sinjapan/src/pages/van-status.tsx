import React, { useEffect, useState, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, CheckCircle2, Clock, FileText, CreditCard, Truck, XCircle, ChevronLeft, MapPin, ScanFace, AlertCircle } from 'lucide-react';
import EkycInlineForm from '@/components/EkycInlineForm';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (p: string) => `${BASE}api${p}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

type EkycStatus = 'not_started' | 'submitted' | 'verified' | 'rejected' | 'expired';

type Step = { label: string; description: string; icon: React.ReactNode };

const STEPS: Step[] = [
  { label: 'eKYC・審査', description: '本人確認と審査を自動で行います',  icon: <Clock className="h-5 w-5" /> },
  { label: '契約署名',   description: '契約書の内容をご確認ください',    icon: <FileText className="h-5 w-5" /> },
  { label: 'お支払い',   description: '最初の月額料金をお支払いください', icon: <CreditCard className="h-5 w-5" /> },
  { label: '受け取り',   description: 'レンタル会社で車両を受け取ります', icon: <Truck className="h-5 w-5" /> },
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
  const [ekycStatus, setEkycStatus] = useState<EkycStatus>('not_started');
  const [ekycRejReason, setEkycRejReason] = useState('');
  const [showEkycForm, setShowEkycForm] = useState(false);

  const { data: application, isLoading, refetch } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  // eKYCステータスを取得（applicationIdが変わっても呼べるよう useCallback）
  const fetchEkyc = useCallback(() => {
    if (!applicationId) return;
    fetch(apiUrl(`/van/applications/${applicationId}/identity-verification`), { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.status) {
          setEkycStatus(d.status as EkycStatus);
          setEkycRejReason(d.rejectionReason ?? '');
        }
      })
      .catch(() => {});
  }, [applicationId]);

  useEffect(() => { fetchEkyc(); }, [fetchEkyc]);

  // eKYC提出後: フォームを閉じて submitted 状態に即反映
  const handleEkycSubmitted = useCallback(() => {
    setShowEkycForm(false);
    setEkycStatus('submitted');
  }, []);

  // ポーリング: 申込ステータス + eKYCステータスを同時に更新
  useEffect(() => {
    if (!application) return;
    if (application.status === 'active' || application.status === 'rejected') return;
    const timer = setInterval(() => { refetch(); fetchEkyc(); }, 10_000);
    return () => clearInterval(timer);
  }, [application?.status, refetch, fetchEkyc]);

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
              <div>
                {/* ── eKYC フォーム（未提出 or 否認） ── */}
                {(ekycStatus === 'not_started' || ekycStatus === 'rejected') && (
                  <>
                    {!showEkycForm ? (
                      <div className="text-center">
                        {ekycStatus === 'rejected' ? (
                          <>
                            <div className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mx-auto mb-4">
                              <AlertCircle className="h-7 w-7 text-red-500" />
                            </div>
                            <h2 className="text-lg font-bold mb-2">本人確認が確認できませんでした</h2>
                            {ekycRejReason && (
                              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 mb-4 max-w-sm mx-auto">{ekycRejReason}</p>
                            )}
                            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                              免許証の画像を確認のうえ、再度アップロードしてください。
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-4">
                              <ScanFace className="h-7 w-7 text-blue-600" />
                            </div>
                            <h2 className="text-lg font-bold mb-2">本人確認（eKYC）を行ってください</h2>
                            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                              運転免許証の表裏と顔写真をアップロードしてください。AIが自動で確認します。通常数分で完了します。
                            </p>
                          </>
                        )}
                        <button
                          onClick={() => setShowEkycForm(true)}
                          className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto"
                        >
                          <ScanFace className="h-4 w-4" />
                          {ekycStatus === 'rejected' ? '再提出する' : '本人確認を始める'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <button
                            type="button"
                            onClick={() => setShowEkycForm(false)}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            ← 戻る
                          </button>
                          <h2 className="text-base font-bold">本人確認書類の提出</h2>
                        </div>
                        <EkycInlineForm
                          applicationId={applicationId}
                          rejectionReason={ekycStatus === 'rejected' ? ekycRejReason : undefined}
                          onSubmitted={handleEkycSubmitted}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* ── 提出済み・AI確認中 ── */}
                {ekycStatus === 'submitted' && (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-7 w-7 text-yellow-600" />
                    </div>
                    <h2 className="text-lg font-bold mb-2">本人確認書類を確認中です</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      提出いただいた免許証・顔写真をAIが確認しています。通常数分で完了します。
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      10秒ごとに自動更新
                    </div>
                  </div>
                )}

                {/* ── eKYC 完了 → 審査中 or 承認済み ── */}
                {(ekycStatus === 'verified' || (ekycStatus === 'not_started' && status === 'approved')) && (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-7 w-7 text-yellow-600" />
                    </div>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">本人確認完了</span>
                    </div>
                    <h2 className="text-lg font-bold mb-2">
                      {status === 'approved' ? '審査通過しました！契約書を準備中です…' : 'AI自動審査中です'}
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      {status === 'approved'
                        ? '担当者が契約書を準備しています。しばらくお待ちください。'
                        : '申込内容をAIが審査しています。通常数分で完了します。'}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                      10秒ごとに自動更新
                    </div>
                  </div>
                )}
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
                <h2 className="text-lg font-bold mb-2">車両を受け取ってください</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  すべての手続きが完了しました。<br />
                  担当のレンタル会社へ連絡して車両を受け取ってください。
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setLocation(`/van/${applicationId}/pickup`)}
                    className="px-8 py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <MapPin className="h-4 w-4" />受け取り情報を見る
                  </button>
                  <button
                    onClick={() => setLocation('/mypage')}
                    className="px-8 py-3 border border-border text-sm font-medium rounded-full hover:bg-muted transition-colors"
                  >
                    マイページへ
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
