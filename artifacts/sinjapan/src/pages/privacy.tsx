import React from 'react';
import { Link } from 'wouter';

export default function Privacy() {
  return (
    <div className="font-['Noto_Sans_JP'] min-h-screen bg-white text-black">
      <header className="border-b border-black/8 px-6 py-4">
        <Link href="/lp"><img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" /></Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-black text-3xl mb-4 tracking-tight">個人情報保護方針</h1>
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月</p>
        <div className="space-y-10 text-sm leading-relaxed text-black/70">
          <section>
            <h2 className="font-bold text-black text-base mb-3">1. 事業者情報</h2>
            <p>合同会社SIN JAPAN（以下「当社」）は、個人情報の保護に関する法律（個人情報保護法）を遵守し、利用者の個人情報を適切に管理します。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">2. 取得する情報</h2>
            <ul className="space-y-1 list-disc list-inside text-black/50">
              <li>氏名・住所・電話番号・メールアドレスなどの本人確認情報</li>
              <li>運転免許証その他の本人確認書類</li>
              <li>チャット上でご提供いただいた利用目的・条件等の情報</li>
              <li>決済に関する情報</li>
            </ul>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">3. 利用目的</h2>
            <ul className="space-y-1 list-disc list-inside text-black/50">
              <li>本サービスの提供・運営</li>
              <li>レンタル会社への車両手配の仲介</li>
              <li>お問い合わせへの対応</li>
              <li>サービス改善・統計分析</li>
            </ul>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">4. 第三者提供</h2>
            <p>当社は、法令に基づく場合または本人の同意がある場合を除き、個人情報を第三者に提供しません。ただし、車両手配に必要な範囲でレンタル会社に情報を提供することがあります。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">5. 開示・訂正・削除</h2>
            <p>個人情報の開示・訂正・削除をご希望の場合は、info@sinjapan.jp までお問い合わせください。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">6. お問い合わせ</h2>
            <p>個人情報の取り扱いに関するお問い合わせは、info@sinjapan.jp までご連絡ください。</p>
          </section>
        </div>
      </main>
      <footer className="border-t border-black/8 py-8 text-center text-black/20 text-xs">
        © 2026 Chat VAN. All rights reserved.
      </footer>
    </div>
  );
}
