import React from 'react';
import { Link } from 'wouter';

export default function Tokusho() {
  return (
    <div className="font-['Noto_Sans_JP'] min-h-screen bg-white text-black">
      <header className="border-b border-black/8 px-6 py-4">
        <Link href="/lp"><img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" /></Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-black text-3xl mb-4 tracking-tight">特定商取引法に基づく表記</h1>
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月23日</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/8">
            {[
              {
                label: '販売事業者',
                value: '合同会社SIN JAPAN',
              },
              {
                label: '代表者',
                value: '大谷　和哉',
              },
              {
                label: '所在地',
                value: '〒243-0303 神奈川県愛甲郡愛川町中津7287',
              },
              {
                label: 'TEL',
                value: '046-212-2325',
              },
              {
                label: 'FAX',
                value: '046-212-2326',
              },
              {
                label: 'メールアドレス',
                value: 'info@sinjapan.jp',
              },
              {
                label: '営業時間',
                value: '平日 10:00〜18:00（土日祝休）',
              },
              {
                label: 'サービス名',
                value: 'Chat VAN（軽バンレンタル仲介サービス）',
              },
              {
                label: 'サービスの内容',
                value: '軽バン車両のレンタルに関する仲介サービス。ユーザーの希望条件（エリア・期間・用途等）をもとに、提携レンタル会社から適切な車両を選定・提案し、契約締結を支援します。',
              },
              {
                label: '販売価格',
                value: '車両の種類・利用期間・エリア・オプション等により異なります。ご利用前にチャット上にてお見積もりをご提示します。',
              },
              {
                label: '料金以外の必要費用',
                value: 'レンタル会社の規定に基づく保険料・ガソリン代・任意の損害補償制度の費用等が別途発生する場合があります。詳細は各レンタル会社の規約をご確認ください。',
              },
              {
                label: '支払方法',
                value: 'クレジットカード決済（VISA・Mastercard・JCB・American Express等） / 請求書払い（法人のみ・事前審査あり）',
              },
              {
                label: '支払時期',
                value: 'クレジットカード：契約成立時に決済。請求書払い：請求書記載の支払期日まで（原則、月末締め翌月末払い）。',
              },
              {
                label: 'サービス提供時期',
                value: '契約成立・入金確認後、レンタル会社と受け取り日時・場所を調整の上、提供開始となります。最短で申込翌日からのご利用が可能です（車両の空き状況による）。',
              },
              {
                label: '利用開始最低期間',
                value: '1ヶ月〜（長期利用も対応。詳細はチャットにてご相談ください）',
              },
              {
                label: '返品・交換について',
                value: 'サービスの性質上、契約成立後の返品・返金は原則対応しておりません。ただし、当社またはレンタル会社の責によるサービス提供不能の場合はこの限りではありません。',
              },
              {
                label: '動作環境',
                value: '本サービスはウェブブラウザ上で動作します。推奨環境：Chrome・Safari・Edge・Firefox の最新バージョン。スマートフォンでもご利用いただけます。',
              },
            ].map((row) => (
              <tr key={row.label}>
                <td className="py-4 pr-8 text-black/40 align-top whitespace-nowrap w-36">{row.label}</td>
                <td className="py-4 text-black/70 leading-relaxed">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
      <footer className="border-t border-black/8 py-8 text-center text-black/20 text-xs">
        © 2026 Chat VAN. All rights reserved.
      </footer>
    </div>
  );
}
