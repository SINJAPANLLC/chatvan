import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGetVanApplication } from '@workspace/api-client-react';
import { Loader2, ChevronLeft, FileText, CheckCircle2, Clock, PenLine, RotateCcw, ChevronDown, MapPin, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}`,
  'Content-Type': 'application/json',
});

// ─────────────────────────────────────────────────────────────────────────────
// 契約書テキスト（3本）
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_TERMS = `プラットフォーム利用規約

第1条（目的）
本規約は、合同会社SIN JAPAN（以下「当社」）が運営する Chat VAN サービス（以下「本サービス」）の利用条件を定めるものです。本規約に同意いただいた方のみが本サービスをご利用いただけます。

第2条（定義）
(1)「ユーザー」とは、本規約に同意のうえ本サービスを利用する個人または法人をいいます。
(2)「協力会社」とは、当社と提携し車両を提供するレンタル会社をいいます。
(3)「車両」とは、協力会社が提供する軽バンをいいます。
(4)「月額料金」とは、プラットフォーム利用料および車両貸渡料を合算した金額をいいます。

第3条（利用申込と承認）
(1) 本サービスの利用を希望するユーザーは、当社が定める方法により申込みを行うものとします。
(2) 当社は、申込内容の審査を行い、承認または不承認の通知を行います。
(3) 以下に該当する場合、当社は申込みを承認しないことができます。
　・申込情報に虚偽が含まれる場合
　・反社会的勢力に該当する場合
　・過去に当社との契約を違反したことがある場合
　・その他当社が不適当と判断した場合

第4条（サービス内容）
(1) 当社は、軽バンのレンタルマッチングプラットフォームを提供します。
(2) 当社はAIによる自動審査・車両マッチングを行いますが、最終的な判断は当社担当者が行う場合があります。
(3) マッチングにより成立した車両貸渡契約は、ユーザーと協力会社との間で締結されます。

第5条（月額料金と支払）
(1) ユーザーは、契約書に定める月額料金（税込）を毎月所定の支払日に自動決済によりお支払いいただきます。
(2) 標準の支払方法はクレジットカード払いとし、毎月所定の支払日に自動引き落としとなります。解約の意思表示がない限り、最低利用期間満了後も自動更新し、自動引き落としが継続されます。
(3) 法人のお客様は、当社所定の審査を経て請求書払い（翌月末払い）に変更できます。審査の結果によりご利用いただけない場合があります。
(4) 支払日を過ぎても入金がない場合、年14.6%の遅延損害金が発生します。
(5) 2ヶ月以上の未払いが続いた場合、当社は本契約を解除するとともに、残存する未払い料金を一括請求できるものとします。

第6条（禁止事項）
ユーザーは以下の行為を行ってはなりません。
(1) 法令または公序良俗に反する行為
(2) 本サービスの運営を妨害する行為
(3) 他のユーザーまたは第三者の権利を侵害する行為
(4) 車両の第三者への転貸し
(5) 申告した利用目的以外への使用
(6) 違法改造または無断改装
(7) 危険物・違法物品の輸送
(8) 飲酒・薬物等の影響下での運転

第7条（免責事項）
(1) 当社は、本サービスを通じて成立したレンタル契約に関して、車両の性能・瑕疵・事故等について一切の責任を負いません。
(2) 天災・不可抗力・通信障害等によりサービスが停止した場合、当社はその損害について責任を負いません。
(3) ユーザーが第三者に与えた損害については、ユーザー自身が責任を負うものとします。

第8条（個人情報の取扱い）
当社（合同会社SIN JAPAN）は、本サービス利用に関して取得した個人情報を、別途定める「個人情報の取扱いについて」に従い適切に管理します。

第9条（契約期間と解除）
(1) 本規約は、ユーザーが申込みを行い当社が承認した日から、車両を返却し全ての費用精算が完了するまで有効とします。
(2) ユーザーは当社に対し30日前までに書面または電子メールで通知することにより、本契約を解除できます。ただし最低利用期間中の解約は解約金が発生します。
(3) ユーザーが本規約に違反した場合、当社は即時に本契約を解除できます。

第10条（準拠法・管轄）
本規約は日本法を準拠法とし、本サービスに関する紛争については東京地方裁判所を第一審の専属的合意管轄裁判所とします。

第11条（規約の変更）
当社は、法令変更その他合理的な理由がある場合、本規約を変更することができます。変更内容は本サービス上に掲載し、掲載から2週間後に効力を生じるものとします。`;

const PRIVACY_POLICY = `個人情報の取扱いについて

合同会社SIN JAPAN（以下「当社」）は、ユーザーの個人情報を以下のとおり取り扱います。

第1条（収集する個人情報）
当社は、本サービスの提供にあたり、以下の情報を収集します。
(1) 氏名・生年月日・住所・電話番号・メールアドレス
(2) 運転免許証情報（種別・番号・有効期限）
(3) 顔写真（本人確認用）
(4) 利用目的・利用エリア・利用期間等の申込情報
(5) 支払情報（クレジットカード情報は決済代行業者が管理し当社は保持しません）
(6) 位置情報（ユーザーが車両を利用中に取得される移動・滞在場所に関する情報。安全管理・不正利用防止・事故対応を目的として収集します）
(7) アクセスログ・端末情報・Cookie等の技術情報

第2条（利用目的）
収集した個人情報は、以下の目的で利用します。
(1) 本人確認・申込審査
(2) 車両マッチング・契約書の作成・管理
(3) 月額料金の請求・支払処理
(4) サービスに関するお知らせ・連絡
(5) AI審査・マッチングアルゴリズムの精度向上（匿名化処理後）
(6) 法令に基づく対応・行政機関への届出
(7) 不正利用・事故発生時の対応

第3条（第三者提供）
当社は、以下の場合を除き、個人情報を第三者に提供しません。
(1) ユーザーの同意がある場合
(2) 車両貸渡に必要な範囲で協力会社（レンタル会社）に提供する場合
(3) 法令に基づき行政機関・裁判所等への提供が必要な場合
(4) 人の生命・身体・財産の保護のため緊急に必要な場合

第4条（個人情報の管理）
(1) 当社は、個人情報の漏洩・滅失・毀損の防止のため適切なセキュリティ対策を講じます。
(2) 個人情報へのアクセスは必要最小限の従業員に限定し、適切に管理します。
(3) 取得した本人確認書類（免許証画像等）は、暗号化された安全なストレージに保管します。

第5条（保存期間）
個人情報は、契約終了後5年間保存し、その後適切に廃棄します。法令により保存が義務付けられている情報はこの限りではありません。

第6条（開示・訂正・削除の請求）
ユーザーは当社に対し、保有する自己の個人情報の開示・訂正・削除を請求できます。お問い合わせ窓口：info@sinjapan.jp

第7条（Cookieおよびアクセス解析）
本サービスでは、サービス改善のためCookieおよびアクセス解析ツールを使用しています。ブラウザの設定によりCookieを無効化できますが、一部サービスが利用できなくなる場合があります。

第8条（改定）
本方針は、法令変更その他合理的な理由がある場合に改定することがあります。`;

const vehicleTerms = (contract: any) => `軽バン車両貸渡契約書

契約番号: ${contract?.contractNumber ?? `CVN-${contract?.id}`}

貸主（以下「甲」）: ${contract?.contractProvider ?? contract?.vehicle?.rentalCompany?.name ?? '協力会社'}（SIN JAPAN株式会社提携）
借主（以下「乙」）: 本契約申込人

第1条（貸渡の目的と車両）
甲は乙に対し、以下の車両を本契約に基づき貸し渡し、乙はこれを借り受けます。
車両詳細は別紙（車両情報シート）のとおりとし、受け取り時に確認するものとします。

第2条（貸渡期間と自動更新）
(1) 利用開始日: ${contract?.startDate ?? '車両受取日'}
(2) 最低利用期間: ${contract?.minimumTerm ?? 3}ヶ月以上
(3) 最低利用期間満了後、乙から解約の意思表示（30日前書面通知）がない場合、本契約は1ヶ月単位で自動更新されます。
(4) 自動更新時は、毎月${contract?.paymentDay ?? 1}日に登録済みのクレジットカードへ自動決済されます。

第3条（使用目的と方法）
(1) 乙は、申込時に申告した利用目的（軽貨物配送業務等）に限り車両を使用できます。
(2) 乙は善良な管理者の注意をもって車両を使用・保管するものとします。
(3) 乙は車両の定期点検・日常点検を実施し、異常を発見した場合は速やかに甲に連絡するものとします。

第4条（月額料金と支払）
(1) 月額料金（税抜）: ¥${(Number(contract?.monthlyPrice ?? 0) + Number(contract?.sinJapanFee ?? 0)).toLocaleString()}/月
(2) 月額料金（税込）: ¥${Math.floor((Number(contract?.monthlyPrice ?? 0) + Number(contract?.sinJapanFee ?? 0)) * 1.1).toLocaleString()}/月
(3) 支払日: 毎月${contract?.paymentDay ?? 1}日（自動引き落とし）
(4) 料金にはプラットフォーム利用料（¥${Number(contract?.sinJapanFee ?? 0).toLocaleString()}）を含みます。

第5条（禁止事項）
乙は以下の行為を行ってはなりません。
(1) 甲の書面による承諾なき車両の改造・改装・装飾変更
(2) 危険物・違法物品の運搬
(3) 第三者への転貸し（サブリース禁止）
(4) 飲酒・薬物等の影響下での運転
(5) 法定速度・道路交通法に違反する行為
(6) 車両を担保に供する行為

第6条（事故・損害）
(1) 乙は、事故・盗難・損傷が発生した場合は直ちに甲および当社に報告するとともに、警察に届け出るものとします。
(2) 車両の損傷・事故による修理費用は、乙が加入する保険の適用範囲内で処理します。
(3) 保険適用外の費用・免責額・修理費超過分は乙が負担します。
(4) 乙の故意・重過失による損害については、保険の有無にかかわらず乙が全額負担します。

第7条（保険）
(1) 乙は、車両利用前に対人・対物・車両保険（任意保険）に加入するものとします。
(2) 黒ナンバー車両の場合は事業用自動車保険に加入するものとします。
(3) 保険未加入の場合、甲は乙への車両引き渡しを拒否できます。

第8条（車両の返却）
(1) 乙は、契約終了時に甲の指定する場所へ、貸渡時と同等の状態で車両を返却するものとします。
(2) 通常損耗（走行距離に応じた自然劣化）を超える損傷は乙の費用負担とします。
(3) 所定の日時までに返却されない場合、乙は1日あたり月額料金の1/30相当額を延滞料として支払うものとします。

第9条（解約と違約金）
(1) 乙は甲に対し30日前までに書面または電子メールで通知することにより、本契約を解約できます。
(2) 最低利用期間内に解約する場合、乙は残存期間分の月額料金相当額を違約金として支払うものとします。
(3) 甲は、乙が本契約に違反した場合または月額料金を2ヶ月以上未払いの場合、即時に本契約を解除できます。

${contract?.returnTerms ? `第10条（特別返却条件）\n${contract.returnTerms}\n\n` : ''}${contract?.terminationTerms ? `第11条（特別解約条件）\n${contract.terminationTerms}\n\n` : ''}${contract?.specialTerms ? `特記事項\n${contract.specialTerms}\n\n` : ''}以上の内容に乙が電子署名することにより、本契約が成立します。`;

// ─────────────────────────────────────────────────────────────────────────────
// 手書き署名キャンバス
// ─────────────────────────────────────────────────────────────────────────────

function SignatureCanvas({ onSign }: { onSign: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getPos(e, canvas);
    lastPos.current = pos;
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPos.current) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasContent(true);
    onSign(canvas.toDataURL('image/png'));
  };

  const endDraw = () => {
    setDrawing(false);
    lastPos.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onSign(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium flex items-center gap-1.5"><PenLine className="h-4 w-4" />電子署名（手書き）</p>
        {hasContent && (
          <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="h-3 w-3" />やり直す
          </button>
        )}
      </div>
      <div className="border-2 border-border rounded-xl overflow-hidden bg-white" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
          className="w-full"
          style={{ cursor: 'crosshair', display: 'block' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      {!hasContent && (
        <p className="text-xs text-muted-foreground mt-1.5 text-center">上の枠内に署名してください</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// スクロール読了チェック付き契約セクション
// ─────────────────────────────────────────────────────────────────────────────

function ContractSection({ index, title, content, onRead }: {
  index: number;
  title: string;
  content: string;
  onRead: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || read) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
    if (atBottom) { setRead(true); onRead(); }
  }, [read, onRead]);

  return (
    <div className={`rounded-xl border overflow-hidden mb-4 transition-colors ${read ? 'border-foreground' : 'border-border'}`}>
      <div className={`px-5 py-3 flex items-center gap-2 border-b text-sm font-semibold ${read ? 'bg-foreground text-background border-foreground' : 'bg-muted/40 border-border text-foreground'}`}>
        <FileText className="h-4 w-4" />
        <span>{index}. {title}</span>
        {read && <CheckCircle2 className="h-4 w-4 ml-auto" />}
        {!read && <span className="ml-auto text-xs font-normal opacity-60 flex items-center gap-1"><ChevronDown className="h-3 w-3" />最後までスクロールして確認</span>}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="p-5 h-52 overflow-y-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap font-mono bg-muted/20"
      >
        {content}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────────────────────

export default function VanContract() {
  const [, params] = useRoute('/van/:id/contract');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [readCount, setReadCount] = useState(0);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // オプション選択
  const [blackNumber, setBlackNumber] = useState(false);
  const [insuranceReferral, setInsuranceReferral] = useState(false);
  const [gpsConsent, setGpsConsent] = useState(false);

  const { data: application, isLoading } = useGetVanApplication(applicationId, {
    query: { enabled: !!applicationId, refetchInterval: 5000 },
  });

  const contract = (application as any)?.contract as any;
  const alreadySigned = !!(contract?.platformContractAgreedAt && contract?.vehicleContractAgreedAt);

  // signatureData は JSON 文字列 { meta, signature: "data:image/..." } として保存されている
  const signatureImage = (() => {
    if (!contract?.signatureData) return null;
    try {
      const parsed = JSON.parse(contract.signatureData);
      return parsed?.signature ?? null;
    } catch {
      return null;
    }
  })();

  const signedAt = (() => {
    try {
      const d = new Date(contract?.platformContractAgreedAt);
      return isNaN(d.getTime()) ? null : d.toLocaleString('ja-JP');
    } catch {
      return null;
    }
  })();

  const DOCS = [
    { title: 'プラットフォーム利用規約', content: PLATFORM_TERMS },
    { title: '個人情報の取扱いについて', content: PRIVACY_POLICY },
    { title: '軽バン車両貸渡契約書',    content: vehicleTerms(contract) },
  ];
  const allRead = readCount >= DOCS.length;

  const handleSign = async () => {
    if (!allRead) {
      toast({ variant: 'destructive', title: '確認が必要です', description: 'すべての書類を最後までお読みください。' });
      return;
    }
    if (!signatureData) {
      toast({ variant: 'destructive', title: '署名が必要です', description: '電子署名欄に署名してください。' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/van/contracts/${contract.id}/sign`), {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify({
          signatureData,
          blackNumberRequested: blackNumber,
          insuranceReferralRequested: insuranceReferral,
          gpsConsent,
        }),
      });
      if (!res.ok) {
        let errMsg = '署名に失敗しました';
        try {
          const text = await res.text();
          if (text) errMsg = (JSON.parse(text)).error ?? errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      toast({ title: '電子署名が完了しました', description: 'お支払い手続きへ進みます。' });
      setLocation(`/van/${applicationId}/payment`);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const readFlags = useRef(new Set<number>());
  const handleRead = useCallback((i: number) => {
    if (readFlags.current.has(i)) return;
    readFlags.current.add(i);
    setReadCount(readFlags.current.size);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <button onClick={() => setLocation(`/van/${applicationId}/status`)}
          className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
        </button>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-muted border-2 border-border flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold mb-2">契約書を準備中です</h2>
          <p className="text-sm text-muted-foreground">審査完了後、自動的に契約書が作成されます。</p>
        </div>
      </div>
    );
  }

  const monthlyBase = Number(contract.monthlyPrice ?? 0) + Number(contract.sinJapanFee ?? 0);
  const monthlyTax  = Math.floor(monthlyBase * 1.1);

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
      <button onClick={() => setLocation(`/van/${applicationId}/status`)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> 進捗に戻る
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">契約書の確認・電子署名</h1>
        <p className="text-sm text-muted-foreground">契約番号: {contract.contractNumber ?? `CVN-${contract.id}`}</p>
      </div>

      {/* オプション選択（契約概要の上） */}
      {!alreadySigned && (
        <div className="rounded-xl border border-border overflow-hidden mb-4">
          <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">オプション（任意）</div>
          <div className="divide-y divide-border">
            {/* 黒ナンバー代理取得 */}
            <label className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <input type="checkbox" checked={blackNumber} onChange={e => setBlackNumber(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />黒ナンバー代理取得
                  </span>
                  <span className="text-sm font-semibold">+¥19,800</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  提携行政書士が申請手続きを代行します。初回のみ加算。<br />
                  <span className="text-amber-600 font-medium">※ 取得手続きのため納車まで数日〜1週間程度お時間をいただきます。</span>
                </p>
                <div className="mt-2 bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">必要書類（郵送にてお送りください）</span><br />
                  ・住民票（発行3ヶ月以内）
                </div>
              </div>
            </label>
            {/* 保険紹介 */}
            <label className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <input type="checkbox" checked={insuranceReferral} onChange={e => setInsuranceReferral(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />保険紹介
                  </span>
                  <span className="text-xs text-muted-foreground">担当者より案内</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">ご契約の車両（黒ナンバー・黄色ナンバー）に応じた保険プランを担当者が個別にご紹介します。</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* 契約概要 */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">契約概要</div>
        <div className="p-5 space-y-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">月額料金（税込）</span>
            <span className="font-bold text-lg">¥{monthlyTax.toLocaleString()}<span className="text-xs font-normal text-muted-foreground ml-1">/月</span></span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">税抜</span><span>¥{monthlyBase.toLocaleString()}/月</span></div>
          {contract.startDate && <div className="flex justify-between"><span className="text-muted-foreground">開始日</span><span>{contract.startDate}</span></div>}
          {contract.minimumTerm && <div className="flex justify-between"><span className="text-muted-foreground">最低利用期間</span><span>{contract.minimumTerm}ヶ月</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">支払日</span><span>毎月{contract.paymentDay ?? 1}日</span></div>
          {!alreadySigned && blackNumber && (
            <div className="flex justify-between text-foreground">
              <span className="text-muted-foreground flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />黒ナンバー代理取得（初回のみ）
              </span>
              <span>+¥19,800</span>
            </div>
          )}
          {!alreadySigned && (blackNumber) && (
            <div className="flex justify-between pt-2.5 border-t border-border font-bold">
              <span>初回お支払い合計</span>
              <span className="text-base">¥{(monthlyTax + (blackNumber ? 19800 : 0)).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {alreadySigned ? (
        <>
          {/* 署名済みバナー */}
          <div className="rounded-xl border-2 border-foreground px-5 py-4 flex items-center gap-3 mb-6">
            <CheckCircle2 className="h-6 w-6 text-foreground shrink-0" />
            <div>
              <p className="font-semibold text-sm">電子署名が完了しています</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {signedAt ? `署名日時: ${signedAt}` : '署名済み'}
              </p>
            </div>
          </div>

          {/* 契約書全文（読み取り専用） */}
          {DOCS.map((doc, i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden mb-4">
              <div className="px-5 py-3 flex items-center gap-2 border-b bg-muted/40 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                {i + 1}. {doc.title}
              </div>
              <div className="p-5 h-52 overflow-y-auto text-xs leading-relaxed text-foreground whitespace-pre-wrap font-mono bg-muted/20">
                {doc.content}
              </div>
            </div>
          ))}

          {/* 署名画像 */}
          {signatureImage && (
            <div className="rounded-xl border border-border overflow-hidden mb-6">
              <div className="px-5 py-3 border-b bg-muted/40 text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />電子署名
              </div>
              <div className="p-5 bg-white flex justify-center">
                <img src={signatureImage} alt="電子署名" className="max-h-24 object-contain opacity-80" />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* 進捗インジケーター */}
          <div className="flex items-center gap-2 mb-5 text-sm">
            <div className={`h-2 flex-1 rounded-full ${readCount >= 1 ? 'bg-foreground' : 'bg-border'}`} />
            <div className={`h-2 flex-1 rounded-full ${readCount >= 2 ? 'bg-foreground' : 'bg-border'}`} />
            <div className={`h-2 flex-1 rounded-full ${readCount >= 3 ? 'bg-foreground' : 'bg-border'}`} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{readCount}/3 確認済み</span>
          </div>

          {/* 3つの契約書 */}
          {DOCS.map((doc, i) => (
            <ContractSection
              key={i}
              index={i + 1}
              title={doc.title}
              content={doc.content}
              onRead={() => handleRead(i)}
            />
          ))}

          {/* GPS同意 */}
          <div className={`rounded-xl border border-border overflow-hidden mb-6 transition-opacity ${allRead ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="px-5 py-3 bg-muted/40 border-b border-border text-sm font-semibold">位置情報の同意</div>
            <label className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <input type="checkbox" checked={gpsConsent} onChange={e => setGpsConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />GPS位置情報の取得を許可する
                  </span>
                  <span className="text-xs text-muted-foreground">無料</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">車両の位置情報を常時取得することに同意します。安全管理・緊急時対応に使用します。</p>
              </div>
            </label>
          </div>

          {/* 署名欄 */}
          <div className={`rounded-xl border-2 p-5 mb-6 transition-colors ${allRead ? 'border-foreground' : 'border-border opacity-50 pointer-events-none'}`}>
            <SignatureCanvas onSign={setSignatureData} />
          </div>
          {!allRead && (
            <p className="text-xs text-muted-foreground text-center mb-4">
              すべての書類を最後までスクロールすると署名できます
            </p>
          )}

          {/* 同意テキスト */}
          <p className="text-xs text-muted-foreground text-center mb-4">
            ご同意・電子署名いただくと、署名日時・IPアドレス・端末情報が記録されます。
            電子署名は「電子署名及び認証業務に関する法律」に基づき、自筆署名と同等の法的効力を持ちます。
          </p>

          <button
            onClick={handleSign}
            disabled={loading || !allRead || !signatureData}
            className="w-full py-3.5 bg-foreground text-background font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-30 flex items-center justify-center gap-2 text-sm"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" />送信中…</>
              : <><PenLine className="h-4 w-4" />全書類に同意して電子署名する</>
            }
          </button>
        </>
      )}
    </div>
  );
}
