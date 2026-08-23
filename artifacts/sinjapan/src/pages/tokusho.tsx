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
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月</p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/8">
            {[
              { label: '販売事業者', value: '株式会社SIN JAPAN' },
              { label: '代表者', value: '' },
              { label: '所在地', value: '〒xxx-xxxx 東京都（詳細はお問い合わせください）' },
              { label: '電話番号', value: 'お問い合わせはメールにて承ります' },
              { label: 'メールアドレス', value: 'info@sinjapan.jp' },
              { label: 'サービス名', value: 'Chat VAN（軽バンレンタル仲介サービス）' },
              { label: 'サービス料金', value: '車両・期間・エリアによって異なります。ご利用前にチャットにてご案内します。' },
              { label: '料金以外の必要費用', value: '保険料・ガソリン代等（レンタル会社の規定に準じます）' },
              { label: '支払方法', value: 'クレジットカード / 請求書払い（法人）' },
              { label: '支払時期', value: '契約締結時または請求書記載の期日まで' },
              { label: 'サービス提供時期', value: '契約成立・入金確認後、日程調整のうえご案内します' },
              { label: 'キャンセル・返品', value: 'ご利用開始前のキャンセルは所定のキャンセルポリシーに従います。詳細はチャットにてご確認ください。' },
            ].map((row) => (
              <tr key={row.label}>
                <td className="py-4 pr-8 text-black/40 align-top whitespace-nowrap w-40">{row.label}</td>
                <td className="py-4 text-black/70 leading-relaxed">{row.value || '—'}</td>
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
