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
        <p className="text-black/40 text-sm mb-12">最終更新日：2026年8月23日</p>
        <div className="space-y-10 text-sm leading-relaxed text-black/70">

          <p>合同会社SIN JAPAN（以下「当社」）は、Chat VANの運営にあたり取得するお客様の個人情報を適切に保護することを重要な責務と認識し、個人情報の保護に関する法律（個人情報保護法）その他関連法令を遵守します。</p>

          <section>
            <h2 className="font-bold text-black text-base mb-3">1. 事業者情報</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-black/8">
                {[
                  { label: '事業者名', value: '合同会社SIN JAPAN' },
                  { label: '所在地', value: '〒243-0303 神奈川県愛甲郡愛川町中津7287' },
                  { label: '連絡先', value: 'info@sinjapan.jp' },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="py-3 pr-6 text-black/40 whitespace-nowrap w-28">{row.label}</td>
                    <td className="py-3 text-black/70">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">2. 取得する個人情報</h2>
            <p className="mb-3">当社は、本サービスの提供にあたり以下の情報を取得します。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>氏名・会社名（法人の場合）</li>
              <li>住所・電話番号・メールアドレス</li>
              <li>運転免許証その他の本人確認書類</li>
              <li>チャット上でご入力いただいた利用目的・条件・要望等</li>
              <li>決済に関する情報（カード番号等は決済代行会社が管理し当社では保持しません）</li>
              <li>本サービスの利用履歴・ログ情報</li>
              <li>Cookie等により自動取得するアクセス情報</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">3. 利用目的</h2>
            <p className="mb-3">取得した個人情報は以下の目的に限り利用します。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>本サービス（車両マッチング・提案・契約仲介）の提供</li>
              <li>提携レンタル会社への車両手配の仲介および必要情報の共有</li>
              <li>本人確認・契約書類の作成・管理</li>
              <li>料金の請求・決済処理</li>
              <li>お問い合わせ・サポートへの対応</li>
              <li>本サービスの改善・新機能の開発</li>
              <li>サービスに関するご案内・重要なお知らせの送信</li>
              <li>不正利用の防止・セキュリティの確保</li>
              <li>法令上の義務の履行</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">4. 第三者提供</h2>
            <p className="mb-3">当社は、以下の場合を除き、個人情報を第三者に提供しません。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>ご本人の同意がある場合</li>
              <li>法令に基づく場合（裁判所・警察等からの適法な開示要請等）</li>
              <li>車両のマッチング・手配のために必要な範囲でレンタル会社に提供する場合（利用目的の範囲内）</li>
              <li>業務委託先（決済代行会社・システム運営会社等）に対して、業務遂行に必要な範囲で提供する場合（委託先との間で適切な契約を締結します）</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">5. 安全管理措置</h2>
            <p>当社は、個人情報の漏えい・滅失・き損を防止するため、適切な技術的・組織的安全管理措置を講じます。また、個人情報を取り扱う従業者および委託先に対して、適切な監督を行います。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">6. 保有期間</h2>
            <p>個人情報は、利用目的の達成に必要な期間を超えて保有しません。ただし、法令上の保存義務がある場合はその期間に従います。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">7. 開示・訂正・削除・利用停止の請求</h2>
            <p className="mb-3">ご本人は、当社が保有する自己の個人情報について、以下の請求を行うことができます。</p>
            <ul className="space-y-2 list-disc list-inside">
              <li>保有個人データの開示</li>
              <li>内容の訂正・追加・削除</li>
              <li>利用の停止または消去</li>
              <li>第三者提供の停止</li>
            </ul>
            <p className="mt-3">請求は info@sinjapan.jp までメールにてお申し込みください。本人確認の上、法令の定める期間内に対応します。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">8. Cookieの利用</h2>
            <p>当社のウェブサービスはCookieを使用しています。Cookieはユーザー体験の向上・利用状況の分析のために使用します。ブラウザの設定によりCookieを無効にすることができますが、一部機能が利用できなくなる場合があります。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">9. 方針の改定</h2>
            <p>当社は必要に応じて本方針を改定することがあります。改定後の方針はウェブサイト上に掲示した時点から効力を生じます。</p>
          </section>

          <section>
            <h2 className="font-bold text-black text-base mb-3">10. お問い合わせ窓口</h2>
            <p>個人情報の取り扱いに関するご意見・ご質問・苦情は以下の窓口までお寄せください。</p>
            <div className="mt-3 border border-black/10 p-5">
              <p className="font-bold text-black mb-2">合同会社SIN JAPAN 個人情報担当</p>
              <p>〒243-0303 神奈川県愛甲郡愛川町中津7287</p>
              <p>Mail: info@sinjapan.jp</p>
              <p>TEL: 046-212-2325（平日10:00〜18:00）</p>
            </div>
          </section>

        </div>
      </main>
      <footer className="border-t border-black/8 py-8 text-center text-black/20 text-xs">
        © 2026 Chat VAN. All rights reserved.
      </footer>
    </div>
  );
}
