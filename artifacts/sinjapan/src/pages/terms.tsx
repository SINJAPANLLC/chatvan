import React from 'react';
import { Link } from 'wouter';

export default function Terms() {
  return (
    <div className="font-['Noto_Sans_JP'] min-h-screen bg-white text-black">
      <header className="border-b border-black/8 px-6 py-4">
        <Link href="/lp"><img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" /></Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-black text-3xl mb-4 tracking-tight">利用規約</h1>
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月</p>
        <div className="space-y-10 text-sm leading-relaxed text-black/70">
          <section>
            <h2 className="font-bold text-black text-base mb-3">第1条（適用）</h2>
            <p>本規約は、株式会社SIN JAPANが提供するChat VAN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">第2条（利用登録）</h2>
            <p>本サービスへの登録は、所定の方法で申請し、当社が承認した時点で完了します。当社は、以下に該当する場合、登録を拒否または取り消すことができます。</p>
            <ul className="mt-3 space-y-1 list-disc list-inside text-black/50">
              <li>虚偽の情報を申告した場合</li>
              <li>過去に本規約違反があった場合</li>
              <li>その他当社が不適切と判断した場合</li>
            </ul>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">第3条（禁止事項）</h2>
            <p>ユーザーは以下の行為を行ってはなりません。</p>
            <ul className="mt-3 space-y-1 list-disc list-inside text-black/50">
              <li>法令または公序良俗に違反する行為</li>
              <li>当社または第三者の知的財産権を侵害する行為</li>
              <li>本サービスの運営を妨害する行為</li>
              <li>不正アクセスその他の不正行為</li>
            </ul>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">第4条（免責事項）</h2>
            <p>当社は、本サービスを通じて締結された契約について、当事者間のトラブルに関し一切の責任を負いません。本サービスは車両レンタルの仲介を行うものであり、レンタル契約はユーザーとレンタル会社の間で成立します。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">第5条（規約の変更）</h2>
            <p>当社は必要に応じて本規約を変更できます。変更後の規約はサービス上に掲示した時点から効力を生じます。</p>
          </section>
          <section>
            <h2 className="font-bold text-black text-base mb-3">第6条（準拠法・管轄裁判所）</h2>
            <p>本規約の解釈には日本法が適用され、紛争が生じた場合は東京地方裁判所を第一審の専属的合意管轄裁判所とします。</p>
          </section>
        </div>
      </main>
      <footer className="border-t border-black/8 py-8 text-center text-black/20 text-xs">
        © 2026 Chat VAN. All rights reserved.
      </footer>
    </div>
  );
}
