import React from 'react';
import { Link } from 'wouter';

export default function Company() {
  return (
    <div className="font-['Noto_Sans_JP'] min-h-screen bg-white text-black">
      <header className="border-b border-black/8 px-6 py-4">
        <Link href="/lp"><img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" /></Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="font-black text-3xl mb-12 tracking-tight">会社概要</h1>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/8">
            {[
              { label: '会社名', value: '合同会社SIN JAPAN' },
              { label: '所在地', value: '〒243-0303 神奈川県愛甲郡愛川町中津7287' },
              { label: '設立', value: '2024年' },
              { label: 'TEL', value: '046-212-2325' },
              { label: 'FAX', value: '046-212-2326' },
              { label: 'メールアドレス', value: 'info@sinjapan.jp' },
              { label: '事業内容', value: '軽バンレンタル仲介サービス「Chat VAN」の運営' },
            ].map((row) => (
              <tr key={row.label}>
                <td className="py-4 pr-8 text-black/40 whitespace-nowrap w-36">{row.label}</td>
                <td className="py-4 text-black/80">{row.value || '—'}</td>
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
