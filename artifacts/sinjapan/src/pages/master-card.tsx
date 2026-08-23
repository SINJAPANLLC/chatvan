import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Loader2, Printer, Send, CheckCircle2 } from 'lucide-react';

const SIN_JAPAN = {
  companyKana: 'ゴウドウガイシャ シンジャパン',
  companyName: '合同会社 SIN JAPAN',
  repKana: 'ダイヒョウシャイン オオタニ カズヤ',
  rep: '代表社員 大谷 和哉',
  addressKana: 'カナガワケンアイコウグンアイカワマチナカツ 7287',
  address: '〒243-0303 神奈川県愛甲郡愛川町中津 7287',
  tel: '046-212-2325',
  fax: '046-212-2326',
  branch: '合同会社 SIN JAPAN',
  branchContact: '小坂',
  licenseType: '貨物利用運送事業',
  licenseNo: '関自貨第 560号',
  payment: '月末日締 翌々月末日 銀行振込',
  bank: '相愛信用組合（2318）本店営業部（003）',
  accountNo: '0170074',
  accountHolder: '合同会社 SIN JAPAN 代表社員 大谷 和哉',
  accountType: '普通',
  invoiceType: '適格請求書発行事業者',
  invoiceNo: 'T2021003014009',
  receiptDest: '本社営業所',
};

const EMPTY = {
  no: '', companyKana: '', companyName: '',
  branchKana: '', branchName: '',
  address: '', tel: '', fax: '',
  dispatchContact: '', accountingContact: '',
  representative: '',
  closingDate: '', paymentSite: '',
  bankName: '', accountType: '普通', accountHolder: '',
  postingDate: '', loadDate: '', unloadDate: '', offset: '可',
  qualifiedInvoice: 'あり', registrationNumber: '',
  receiptAddress: '', insuranceCompany: '', vehicles: '',
};

type FormData = typeof EMPTY;

function FR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-300">
      <td className="px-3 py-2 bg-gray-100 text-xs font-medium whitespace-nowrap w-36 border-r border-gray-300">{label}</td>
      <td className="px-3 py-2 text-sm">{value}</td>
    </tr>
  );
}

function FInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border-b border-gray-400 bg-transparent text-sm px-1 py-0.5 focus:outline-none focus:border-black print:border-gray-300 ${className ?? ''}`}
    />
  );
}

function FSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border-b border-gray-400 bg-transparent text-sm px-1 py-0.5 focus:outline-none print:border-gray-300"
    >
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function MasterCardPage() {
  const [, params] = useRoute('/master-card/:token');
  const token = params?.token ?? '';

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

  const autoPrint = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1';

  useEffect(() => {
    if (!token) return;
    fetch(`${base}/api/master-card/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setCarrierName(d.carrierName);
        // 提出済みデータがあればフォームに反映
        if (d.masterCardData) {
          setForm(prev => ({ ...prev, ...d.masterCardData }));
        }
        setLoading(false);
        // ?print=1 なら自動印刷
        if (autoPrint) setTimeout(() => window.print(), 600);
      })
      .catch(() => { setInvalid(true); setLoading(false); });
  }, [token, base]);

  const set = (k: keyof FormData) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.companyName) { alert('会社名を入力してください'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/api/master-card/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      alert('送信に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  if (invalid) return (
    <div className="flex items-center justify-center min-h-screen text-center p-8">
      <div>
        <p className="text-2xl font-bold mb-2">リンクが無効です</p>
        <p className="text-gray-500">URLをご確認いただくか、担当者にお問い合わせください。</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="flex items-center justify-center min-h-screen text-center p-8">
      <div>
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <p className="text-2xl font-bold mb-2">送信が完了しました</p>
        <p className="text-gray-500">ご登録いただきありがとうございます。<br />担当者より改めてご連絡いたします。</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* 操作バー（印刷時非表示） */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight">Chat VAN</span>
          <span className="text-gray-400 text-sm">|</span>
          <span className="text-sm text-gray-600">顧客マスターカード</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-4 w-4" />印刷（PDF保存）
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            送信する
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* ヘッダー */}
        <div className="bg-white border border-gray-300 rounded-lg print:rounded-none print:border-0 overflow-hidden mb-0">
          <div className="bg-black text-white px-6 py-4 flex items-start justify-between">
            <div>
              <p className="text-xs opacity-70">顧客情報登録の為、登録フォームにご入力後送信ください。</p>
            </div>
            <div className="text-right text-xs opacity-80 shrink-0 ml-4">
              <p className="font-bold text-base text-white mb-1">合同会社 SIN JAPAN</p>
              <p>FAX 046-212-2326</p>
              <p>Mail info@chat-van.com</p>
            </div>
          </div>
          <div className="px-6 py-3 border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500">NO</span>
              <FInput value={form.no} onChange={set('no')} placeholder="管理番号" className="w-32" />
            </div>
            <span className="text-lg font-bold tracking-widest">顧客マスターカード</span>
          </div>

          {/* 運送会社記入欄 */}
          <div className="px-6 py-4">
            <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-widest">▼ 貴社情報をご記入ください</p>
            <table className="w-full border border-gray-300 text-sm border-collapse">
              <tbody>
                <FR label="会社名（フリガナ）" value={<FInput value={form.companyKana} onChange={set('companyKana')} placeholder="カブシキガイシャ〇〇" />} />
                <FR label="会社名" value={
                  <div className="flex items-center gap-2">
                    <FInput value={form.companyName} onChange={set('companyName')} placeholder="株式会社〇〇" className="flex-1" />
                    {carrierName && !form.companyName && (
                      <button onClick={() => set('companyName')(carrierName)} className="text-xs text-blue-600 shrink-0 hover:underline">
                        「{carrierName}」を入力
                      </button>
                    )}
                  </div>
                } />
                <FR label="支店名（フリガナ）" value={<FInput value={form.branchKana} onChange={set('branchKana')} placeholder="〇〇シテン" />} />
                <FR label="支店名" value={<FInput value={form.branchName} onChange={set('branchName')} placeholder="〇〇支店" />} />
                <FR label="所在地" value={
                  <FInput value={form.address} onChange={set('address')} placeholder="〒000-0000 都道府県市区町村番地" />
                } />
                <FR label="TEL" value={
                  <div className="flex gap-4">
                    <FInput value={form.tel} onChange={set('tel')} placeholder="00-0000-0000" className="flex-1" />
                    <span className="text-gray-400 text-xs self-center">FAX</span>
                    <FInput value={form.fax} onChange={set('fax')} placeholder="00-0000-0000" className="flex-1" />
                  </div>
                } />
                <FR label="配車担当" value={
                  <div className="flex gap-4">
                    <FInput value={form.dispatchContact} onChange={set('dispatchContact')} placeholder="担当者名" className="flex-1" />
                    <span className="text-gray-400 text-xs self-center">経理担当</span>
                    <FInput value={form.accountingContact} onChange={set('accountingContact')} placeholder="担当者名" className="flex-1" />
                  </div>
                } />
                <FR label="代表者" value={<FInput value={form.representative} onChange={set('representative')} placeholder="代表者名" />} />
                <FR label="締め日" value={
                  <div className="flex gap-4">
                    <FInput value={form.closingDate} onChange={set('closingDate')} placeholder="例：月末" className="flex-1" />
                    <span className="text-gray-400 text-xs self-center">支払日サイト</span>
                    <FInput value={form.paymentSite} onChange={set('paymentSite')} placeholder="例：翌々月末払い" className="flex-1" />
                  </div>
                } />
                <FR label="振込先銀行" value={<FInput value={form.bankName} onChange={set('bankName')} placeholder="〇〇銀行 △△支店" />} />
                <FR label="預金種別" value={
                  <div className="flex items-center gap-4">
                    <FSelect value={form.accountType} onChange={set('accountType')} options={['普通', '当座']} />
                    <span className="text-gray-400 text-xs">口座名義</span>
                    <FInput value={form.accountHolder} onChange={set('accountHolder')} placeholder="口座名義（カナ）" className="flex-1" />
                  </div>
                } />
                <FR label="計上日 / 積日 / 卸日" value={
                  <div className="flex gap-3">
                    <FInput value={form.postingDate} onChange={set('postingDate')} placeholder="計上日" className="flex-1" />
                    <FInput value={form.loadDate} onChange={set('loadDate')} placeholder="積日" className="flex-1" />
                    <FInput value={form.unloadDate} onChange={set('unloadDate')} placeholder="卸日" className="flex-1" />
                    <span className="text-gray-400 text-xs self-center">相殺</span>
                    <FSelect value={form.offset} onChange={set('offset')} options={['可', '不可']} />
                  </div>
                } />
                <FR label="適格請求書発行" value={
                  <div className="flex items-center gap-4">
                    <FSelect value={form.qualifiedInvoice} onChange={set('qualifiedInvoice')} options={['あり', 'なし']} />
                    <span className="text-gray-400 text-xs">事業者登録番号</span>
                    <FInput value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="T0000000000000" className="flex-1" />
                  </div>
                } />
                <FR label="受領書送付先" value={<FInput value={form.receiptAddress} onChange={set('receiptAddress')} placeholder="送付先住所" />} />
                <FR label="加入保険会社" value={<FInput value={form.insuranceCompany} onChange={set('insuranceCompany')} placeholder="〇〇保険" />} />
                <tr>
                  <td className="px-3 py-2 bg-gray-100 text-xs font-medium border-r border-gray-300 align-top w-36">保有車両</td>
                  <td className="px-3 py-2">
                    <textarea
                      value={form.vehicles}
                      onChange={e => set('vehicles')(e.target.value)}
                      placeholder="例：2t平ボディ×2台、4tウィング×1台"
                      rows={3}
                      className="w-full border-b border-gray-400 bg-transparent text-sm px-1 py-0.5 focus:outline-none resize-none print:border-gray-300"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 弊社（SIN JAPAN）情報 */}
          <div className="px-6 pb-6">
            <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-widest">▼ 弊社概要</p>
            <table className="w-full border border-gray-300 text-sm border-collapse">
              <tbody>
                <FR label="会社名（フリガナ）" value={<span className="text-gray-700">{SIN_JAPAN.companyKana}</span>} />
                <FR label="会社名" value={
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{SIN_JAPAN.companyName}</span>
                    <span className="text-xs text-gray-500">{SIN_JAPAN.licenseType}　{SIN_JAPAN.licenseNo}</span>
                  </div>
                } />
                <FR label="所在地（フリガナ）" value={<span className="text-gray-700">{SIN_JAPAN.addressKana}</span>} />
                <FR label="所在地" value={<span className="font-medium">{SIN_JAPAN.address}</span>} />
                <FR label="代表者（フリガナ）" value={<span className="text-gray-700">{SIN_JAPAN.repKana}</span>} />
                <FR label="代表者" value={<span className="font-medium">{SIN_JAPAN.rep}</span>} />
                <FR label="取引事業所" value={
                  <div className="flex items-center gap-4">
                    <span>{SIN_JAPAN.branch}</span>
                    <span className="text-gray-500 text-xs">配車担当：{SIN_JAPAN.branchContact}</span>
                    <span className="text-gray-500 text-xs">TEL：{SIN_JAPAN.tel}</span>
                    <span className="text-gray-500 text-xs">FAX：{SIN_JAPAN.fax}</span>
                  </div>
                } />
                <FR label="支払条件" value={<span>{SIN_JAPAN.payment}</span>} />
                <FR label="振込銀行" value={
                  <div className="flex items-center gap-4">
                    <span>{SIN_JAPAN.bank}</span>
                    <span className="text-gray-500 text-xs">口座番号：{SIN_JAPAN.accountNo}</span>
                  </div>
                } />
                <FR label="口座名義" value={<span>{SIN_JAPAN.accountHolder}</span>} />
                <FR label="預金種別" value={<span>{SIN_JAPAN.accountType}</span>} />
                <FR label="適格請求書" value={
                  <div className="flex items-center gap-4">
                    <span>{SIN_JAPAN.invoiceType}</span>
                    <span className="text-gray-500 text-xs">登録番号：{SIN_JAPAN.invoiceNo}</span>
                  </div>
                } />
                <FR label="受領書・請求書送付先" value={<span>{SIN_JAPAN.receiptDest}</span>} />
              </tbody>
            </table>
          </div>

          {/* 送信ボタン（印刷時非表示） */}
          <div className="print:hidden px-6 pb-6 flex gap-3 justify-end">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Printer className="h-4 w-4" />印刷・PDF保存
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              送信する
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          html, body { margin: 0; padding: 0; background: #fff !important; }

          .print\\:hidden, button { display: none !important; }

          /* コンテナをA4幅に収める */
          .max-w-3xl {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* カード全体 */
          .bg-white.border.border-gray-300 {
            border: none !important;
            border-radius: 0 !important;
          }

          /* ヘッダー */
          .bg-black.text-white {
            padding: 4px 8px !important;
          }
          .bg-black.text-white p {
            font-size: 8px !important;
            margin: 0 !important;
          }
          .bg-black.text-white .font-bold {
            font-size: 10px !important;
          }

          /* NOバー */
          .px-6.py-3.border-b {
            padding: 3px 8px !important;
          }
          .text-lg.font-bold {
            font-size: 12px !important;
          }

          /* セクションラベル */
          .px-6.py-4 > p,
          .px-6.pb-6 > p {
            font-size: 7px !important;
            margin-bottom: 2px !important;
          }

          /* テーブル共通 */
          table { border-collapse: collapse !important; width: 100% !important; }
          td { font-size: 8px !important; line-height: 1.2 !important; }

          /* セクションパディング */
          .px-6.py-4 { padding: 2px 6px !important; }
          .px-6.pb-6 { padding: 2px 6px 4px !important; }

          /* 行の高さ */
          tr td { padding: 1.5px 4px !important; }
          td.bg-gray-100 {
            background: #f3f4f6 !important;
            width: 80px !important;
            font-size: 7.5px !important;
            white-space: nowrap;
          }

          /* 入力フィールド */
          input, select, textarea {
            font-size: 8px !important;
            padding: 0 2px !important;
            border: none !important;
            border-bottom: 0.5px solid #999 !important;
            background: transparent !important;
            height: auto !important;
            line-height: 1.3 !important;
          }
          textarea { rows: 2; height: 24px !important; resize: none; overflow: hidden; }

          /* 内部flexの調整 */
          td > div { gap: 4px !important; }
          td span.text-gray-400, td span.text-gray-500 { font-size: 7px !important; }

          /* ページ分割抑止 */
          table { page-break-inside: avoid; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
