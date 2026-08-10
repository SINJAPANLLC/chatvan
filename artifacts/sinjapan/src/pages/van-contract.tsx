import React, { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, FileText, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${BASE_URL}api${path}`;
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token')}`, 'Content-Type': 'application/json' });

const PLATFORM_TERMS = `【プラットフォーム利用規約】

第1条（目的）
本規約は、SIN JAPAN株式会社（以下「当社」）が運営する Chat VAN サービス（以下「本サービス」）の利用条件を定めるものです。

第2条（利用申込）
本サービスの利用を希望する方は、本規約に同意のうえ、当社が定める方法により申込みを行うものとします。

第3条（サービス内容）
当社は、軽バンのレンタルマッチングプラットフォームを提供します。マッチングにより成立した貸渡契約は、ユーザーと協力会社（レンタル会社）との間で締結されます。

第4条（月額料金）
ユーザーは、当社が定める月額料金（税込）を毎月所定の日までにお支払いいただきます。

第5条（禁止事項）
・違法行為または公序良俗に反する行為
・本サービスの運営を妨害する行為
・第三者への転貸

第6条（免責事項）
当社は、本サービスを通じて成立したレンタル契約に関して、車両の瑕疵、事故等について責任を負いません。

第7条（契約解除）
月額料金の未払いが2ヶ月以上続いた場合、当社は本契約を解除することができます。`;

const VEHICLE_TERMS = `【車両貸渡契約書】

第1条（貸渡の目的）
貸主（協力会社）は、借主（ユーザー）に対し、下記の車両を貸し渡し、借主はこれを借り受けます。

第2条（貸渡期間）
契約書に記載の開始日から終了日までとします。最低利用期間を下回る解約の場合、違約金が発生する場合があります。

第3条（使用目的）
申込時に申告した利用目的（軽貨物配送業務等）に限り使用できます。

第4条（禁止事項）
・貸主の承諾なき改造・改装
・危険物・違法物品の運搬
・第三者への転貸し
・飲酒運転その他の法令違反

第5条（事故・損害）
事故が発生した場合は直ちに貸主および当社に報告してください。
修理費用はユーザーが加入する保険の適用範囲で処理します。

第6条（車両の返却）
契約終了時には、貸渡時と同等の状態で返却するものとします。
通常損耗を超える損傷は借主の負担とします。

第7条（月額料金の支払）
毎月の支払日までに所定の口座へ月額料金を振り込むものとします。`;

export default function VanContract() {
  const [, params] = useRoute('/van/:id/contract');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [platformAgreed, setPlatformAgreed] = useState(false);
  const [vehicleAgreed, setVehicleAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId },
  });

  const contract = (application as any)?.contract as any;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 契約書がまだ作成されていない
  if (!contract) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button
          onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
        </button>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">契約書を作成中です</h2>
          <p className="text-sm text-muted-foreground">担当者が契約書を準備しています。しばらくお待ちください。</p>
        </div>
      </div>
    );
  }

  const alreadyAgreedPlatform = !!contract.platformContractAgreedAt;
  const alreadyAgreedVehicle  = !!contract.vehicleContractAgreedAt;
  const bothAgreed = alreadyAgreedPlatform && alreadyAgreedVehicle;

  const handleAgree = async () => {
    if (!platformAgreed || !vehicleAgreed) {
      toast({ variant: 'destructive', title: '確認が必要です', description: '両方の契約書に同意してください。' });
      return;
    }
    setLoading(true);
    try {
      if (!alreadyAgreedPlatform) {
        const r = await fetch(apiUrl(`/van/contracts/${contract.id}/agree-platform`), { method: 'POST', headers: authHeader() });
        if (!r.ok) throw new Error('プラットフォーム契約の同意に失敗しました');
      }
      if (!alreadyAgreedVehicle) {
        const r = await fetch(apiUrl(`/van/contracts/${contract.id}/agree-vehicle`), { method: 'POST', headers: authHeader() });
        if (!r.ok) throw new Error('車両貸渡契約の同意に失敗しました');
      }
      toast({ title: '同意が完了しました', description: 'お支払い手続きへ進みます。' });
      setLocation(`/van/${applicationId}/payment`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `¥${Math.floor(n).toLocaleString()}`;
  const monthlyBase = Number(contract.monthlyPrice) + Number(contract.sinJapanFee ?? 0);
  const monthlyTax  = Math.floor(monthlyBase * 1.1);

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <button
        onClick={() => setLocation(`/van/${applicationId}/status`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">契約書の確認・署名</h1>
        <p className="text-sm text-muted-foreground">契約番号: {contract.contractNumber ?? `#${contract.id}`}</p>
      </div>

      {/* 契約概要 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">契約概要</div>
        <div className="p-5 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">月額料金（税込）</span><span className="font-bold text-base">{fmt(monthlyTax)}/月</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">税抜</span><span>{fmt(monthlyBase)}/月</span></div>
          {contract.startDate  && <div className="flex justify-between"><span className="text-muted-foreground">開始日</span><span>{contract.startDate}</span></div>}
          {contract.minimumTerm && <div className="flex justify-between"><span className="text-muted-foreground">最低利用期間</span><span>{contract.minimumTerm}ヶ月</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">支払日</span><span>毎月{contract.paymentDay ?? 1}日</span></div>
        </div>
      </div>

      {bothAgreed ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
          <p className="font-semibold text-green-900">両方の契約書に同意済みです</p>
          <button
            onClick={() => setLocation(`/van/${applicationId}/payment`)}
            className="mt-4 px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
          >
            お支払いへ進む
          </button>
        </div>
      ) : (
        <>
          {/* プラットフォーム利用規約 */}
          <ContractSection
            title="① プラットフォーム利用規約"
            content={contract.specialTerms ? `${PLATFORM_TERMS}\n\n【特記事項】\n${contract.specialTerms}` : PLATFORM_TERMS}
            agreed={alreadyAgreedPlatform || platformAgreed}
            locked={alreadyAgreedPlatform}
            onAgree={() => !alreadyAgreedPlatform && setPlatformAgreed(v => !v)}
          />

          {/* 車両貸渡契約 */}
          <ContractSection
            title="② 車両貸渡契約書"
            content={[
              VEHICLE_TERMS,
              contract.terminationTerms ? `\n【解約条件】\n${contract.terminationTerms}` : '',
              contract.returnTerms      ? `\n【返却条件】\n${contract.returnTerms}` : '',
            ].join('')}
            agreed={alreadyAgreedVehicle || vehicleAgreed}
            locked={alreadyAgreedVehicle}
            onAgree={() => !alreadyAgreedVehicle && setVehicleAgreed(v => !v)}
          />

          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-4 text-center">
              ご同意いただくと、電子署名として記録されます（日時・IPアドレス）
            </p>
            <button
              onClick={handleAgree}
              disabled={loading || !platformAgreed || !vehicleAgreed}
              className="w-full py-3 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />送信中…</> : '両方の契約書に同意して次へ'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ContractSection({ title, content, agreed, locked, onAgree }: {
  title: string;
  content: string;
  agreed: boolean;
  locked: boolean;
  onAgree: () => void;
}) {
  return (
    <div className={`rounded-xl border overflow-hidden mb-4 transition-colors ${agreed ? 'border-green-300' : 'border-border'}`}>
      <div className={`px-5 py-3 flex items-center gap-2 border-b text-sm font-semibold ${agreed ? 'bg-green-50 border-green-200' : 'bg-muted/40 border-border'}`}>
        <FileText className="h-4 w-4" />
        {title}
        {agreed && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
      </div>
      <div className="p-5">
        <div className="bg-muted/30 rounded-lg p-4 h-48 overflow-y-auto text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono border border-border/50 mb-4">
          {content}
        </div>
        <label className={`flex items-start gap-3 cursor-pointer ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${agreed ? 'bg-foreground border-foreground' : 'border-border bg-background'}`}
            onClick={onAgree}
          >
            {agreed && <CheckCircle2 className="h-3.5 w-3.5 text-background" />}
          </div>
          <span className="text-sm leading-relaxed" onClick={onAgree}>
            上記の内容を読み、同意します
            {locked && <span className="ml-2 text-xs text-green-600 font-medium">（署名済み）</span>}
          </span>
        </label>
      </div>
    </div>
  );
}
