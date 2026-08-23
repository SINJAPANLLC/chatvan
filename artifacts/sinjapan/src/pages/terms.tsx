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
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月23日</p>
        <div className="space-y-10 text-sm leading-relaxed text-black/70">

          <section>
            <h2 className="font-bold text-black text-base mb-3">第1条（適用）</h2>
            <p>本規約は、合同会社SIN JAPAN（以下「当社」）が提供する軽バンレンタル仲介サービス「Chat VAN」（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意した上で本サービスを利用するものとし、本サービスを利用した時点で本規約に同意したものとみなします。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第2条（定義）</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>「本サービス」とは、当社が運営するChat VANプラットフォームおよびそれに付随する一切のサービスをいいます。</li>
              <li>「ユーザー」とは、本サービスに登録した個人・法人・個人事業主をいいます。</li>
              <li>「レンタル会社」とは、本サービスを通じて車両を提供する協力会社をいいます。</li>
              <li>「レンタル契約」とは、ユーザーとレンタル会社の間で成立する車両賃貸借契約をいいます。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第3条（利用登録）</h2>
            <p className="mb-3">本サービスへの登録は所定の方法で申請し、当社が承認した時点で完了します。当社は以下に該当する場合、登録を拒否または取り消すことができます。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>虚偽・不正確な情報を申告した場合</li>
              <li>過去に本規約違反または当社サービスの利用禁止措置を受けたことがある場合</li>
              <li>未成年者で保護者の同意がない場合</li>
              <li>反社会的勢力またはそれに準ずる者と判断される場合</li>
              <li>その他当社が不適切と合理的に判断した場合</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第4条（本サービスの内容）</h2>
            <p className="mb-3">当社は、ユーザーの希望条件（エリア・期間・用途等）をもとに、提携するレンタル会社から適切な車両を選定し提案する仲介サービスを提供します。なお、以下の点をご了承ください。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>本サービスはあくまで仲介であり、実際のレンタル契約はユーザーとレンタル会社の間で成立します。</li>
              <li>車両の提供可否・条件は各レンタル会社の判断によります。</li>
              <li>提案が必ず成立することを保証するものではありません。</li>
              <li>車両の状態・性能に関する責任は各レンタル会社が負います。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第5条（料金・支払い）</h2>
            <p className="mb-3">本サービスの利用登録・相談は無料です。レンタル料金はレンタル会社との契約により定まります。支払い方法はクレジットカード決済または請求書払い（法人）に限ります。支払いが滞った場合、当社は本サービスの利用を停止する場合があります。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第7条（禁止事項）</h2>
            <p className="mb-3">ユーザーは以下の行為を行ってはなりません。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>法令または公序良俗に違反する行為</li>
              <li>当社、レンタル会社または第三者の権利を侵害する行為</li>
              <li>虚偽の情報を登録・入力する行為</li>
              <li>本サービスを通じて得た情報を無断で第三者に提供する行為</li>
              <li>本サービスの運営を妨害し、またはそのおそれのある行為</li>
              <li>不正アクセスその他のシステムへの不正な干渉行為</li>
              <li>反社会的勢力への利益供与その他の協力行為</li>
              <li>その他当社が不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第8条（免責事項）</h2>
            <p className="mb-3">当社は以下について一切の責任を負いません。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>ユーザーとレンタル会社間のトラブル・紛争</li>
              <li>提案した車両の欠陥・不具合による損害</li>
              <li>システム障害・メンテナンス等によるサービス中断</li>
              <li>天災・感染症等の不可抗力による提供不能</li>
              <li>ユーザーが第三者に与えた損害</li>
            </ul>
            <p className="mt-3">当社の故意または重過失による場合を除き、損害賠償は直接かつ現実の損害の範囲に限り、かつ当社がユーザーから受領した料金を上限とします。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第9条（個人情報の取り扱い）</h2>
            <p>ユーザーの個人情報は、別途定める「個人情報保護方針」に従って適切に管理します。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第10条（サービスの変更・停止・終了）</h2>
            <p>当社はユーザーへの事前通知をもって、本サービスの内容変更、停止、終了を行うことができます。やむを得ない場合は事前通知なく対応する場合があります。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第11条（アカウントの管理）</h2>
            <p>ユーザーはID・パスワードを自己の責任において厳重に管理するものとします。第三者による不正使用により生じた損害について、当社は一切の責任を負いません。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第12条（知的財産権）</h2>
            <p>本サービスに関する一切の著作権・商標権その他知的財産権は当社または正当な権利者に帰属します。ユーザーはこれらを無断で複製・転載・改変することはできません。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第13条（規約の変更）</h2>
            <p>当社は必要に応じて本規約を変更できます。変更後の規約はサービス上に掲示した時点から効力を生じ、ユーザーが変更後に本サービスを利用した場合、変更に同意したものとみなします。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">第14条（準拠法・管轄裁判所）</h2>
            <p>本規約の解釈には日本法が適用されます。本サービスに関して生じた紛争については、横浜地方裁判所を第一審の専属的合意管轄裁判所とします。</p>
          </section>

        </div>
      </main>
      <footer className="border-t border-black/8 py-8 text-center text-black/20 text-xs">
        © 2026 Chat VAN. All rights reserved.
      </footer>
    </div>
  );
}
