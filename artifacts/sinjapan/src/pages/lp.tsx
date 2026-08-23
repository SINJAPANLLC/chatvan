import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';

export default function LP() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="font-['Noto_Sans_JP'] bg-white overflow-x-hidden text-black">

      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm border-b border-black/8' : 'bg-white'}`}>
        <img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <Link href="/login">
            <button className="text-black/50 text-sm hover:text-black transition-colors">ログイン</button>
          </Link>
          <Link href="/register">
            <button className="bg-black text-white text-sm font-bold px-5 py-2 hover:bg-black/80 transition-colors">無料で始める</button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen bg-white flex flex-col justify-center px-6 md:px-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-end">
          <span className="text-[clamp(8rem,22vw,20rem)] font-black text-black/[0.04] leading-none tracking-tight whitespace-nowrap pr-4">CHAT VAN</span>
        </div>
        <div className="max-w-5xl mx-auto w-full relative z-10 pt-20">
          <p className="text-black/35 text-xs tracking-[0.4em] uppercase mb-10">軽バンレンタル × チャット</p>
          <h1 className="font-black leading-[1.05] tracking-tight mb-8">
            <span className="block" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>チャットするだけ。</span>
            <span className="block" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>軽バンかりれる。</span>
          </h1>
          <p className="text-black/50 text-lg leading-relaxed mb-14 max-w-lg">
            条件を送るだけ。AIが即日提案。<br />契約・支払いまでオンラインで完結。
          </p>
          <Link href="/register">
            <button className="group bg-black text-white font-bold text-lg px-12 py-5 hover:bg-black/80 transition-all flex items-center gap-3">
              無料で相談する <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
          <p className="text-black/25 text-sm mt-6">登録無料・最短即日・書類手続き不要</p>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <span className="text-black/20 text-[10px] tracking-[0.4em] uppercase">Scroll</span>
          <div className="w-px h-14 bg-gradient-to-b from-black/20 to-transparent" />
        </div>
      </section>

      {/* Numbers */}
      <section className="bg-black py-14 px-6 md:px-20">
        <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/10">
          {[
            { num: '即日', label: '最短提案スピード' },
            { num: '全国', label: '対応エリア' },
            { num: '無料', label: '相談・登録費用' },
          ].map((s) => (
            <div key={s.label} className="text-center px-4 py-2">
              <p className="text-white font-black mb-1" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}>{s.num}</p>
              <p className="text-white/35 text-xs tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">How it works</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>借りるまでの流れ</h2>
          <div className="space-y-0">
            {[
              { num: '01', title: 'チャットで相談', body: 'エリア・期間・用途を入力するだけ。', tags: ['1分で登録完了', '24時間受付'] },
              { num: '02', title: 'AIが提案', body: '条件に合う車両を最短即日でご提案。チャットで質問・条件変更もOK。', tags: ['複数候補から選択', '即日対応'] },
              { num: '03', title: '書類・支払いもオンラインで', body: '電子契約・オンライン決済で完結。印鑑・郵送不要。', tags: ['電子契約', 'カード／請求書払い'] },
              { num: '04', title: '受け取って利用開始', body: '日時・場所を調整して利用開始。サポートもチャットで対応。', tags: ['チャットサポート'] },
            ].map((step) => (
              <div key={step.num} className="flex gap-8 md:gap-16 py-8 border-b border-black/8 last:border-0">
                <p className="font-black text-black/10 leading-none shrink-0" style={{ fontSize: 'clamp(3rem, 6vw, 5rem)' }}>{step.num}</p>
                <div className="flex-1 pt-1">
                  <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                  <p className="text-black/50 text-sm mb-4">{step.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {step.tags.map((t) => (
                      <span key={t} className="text-xs border border-black/15 px-3 py-1 text-black/45">✓ {t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-white py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">Use cases</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>こんな方に</h2>
          <div className="grid md:grid-cols-3 gap-px bg-black/8">
            {[
              { tag: '軽貨物・配送', title: '配送事業を始めたい', body: '購入前に試したい。繁忙期だけ台数を増やしたい。' },
              { tag: '移動販売', title: '移動販売に軽バンを使いたい', body: '1ヶ月から対応。荷物の多い移動販売・出張業務に。' },
              { tag: '法人', title: '複数台まとめて確保したい', body: '請求書払い対応。社員の出張・現場移動用にも。' },
            ].map((c) => (
              <div key={c.tag} className="bg-white p-10">
                <span className="text-[10px] tracking-[0.3em] text-black/30 uppercase border border-black/15 px-2 py-0.5">{c.tag}</span>
                <h3 className="text-lg font-bold mt-4 mb-2">{c.title}</h3>
                <p className="text-black/45 text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">FAQ</p>
          <h2 className="font-black tracking-tight mb-16" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>よくある質問</h2>
          <div className="space-y-0">
            {[
              { q: '個人でも使えますか？', a: '個人・個人事業主・法人のいずれも対応しています。' },
              { q: '利用期間はどのくらいから？', a: '1ヶ月から対応しています。チャットでご相談ください。' },
              { q: '料金はいくらですか？', a: '車両・期間・エリアによって異なります。相談は無料です。' },
              { q: '来店は必要ですか？', a: '契約・決済はオンラインで完結します。車両の受け取り時のみ来店が必要です。' },
              { q: '法人請求書払いは対応していますか？', a: '対応しています。月末締め翌月末払いなどはチャットでご相談ください。' },
            ].map((item) => (
              <details key={item.q} className="group border-b border-black/8 py-6 cursor-pointer">
                <summary className="flex items-center justify-between font-bold text-base list-none">
                  {item.q}
                  <span className="text-black/30 group-open:rotate-45 transition-transform text-xl shrink-0 ml-4">＋</span>
                </summary>
                <p className="text-black/50 text-sm mt-4">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-36 px-6 md:px-20 text-center border-t border-black/8 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
          <span className="text-black/[0.025] font-black leading-none" style={{ fontSize: 'clamp(6rem, 20vw, 20rem)' }}>START</span>
        </div>
        <div className="relative z-10 max-w-xl mx-auto">
          <h2 className="font-black tracking-tight leading-tight mb-4" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>
            まず、チャットで<br />相談してみよう。
          </h2>
          <p className="text-black/35 text-sm mb-12">登録無料&emsp;|&emsp;最短即日&emsp;|&emsp;しつこい営業なし</p>
          <Link href="/register">
            <button className="group bg-black text-white font-bold text-xl px-16 py-6 hover:bg-black/80 transition-all inline-flex items-center gap-4">
              無料で始める <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-black/8 py-12 px-6 md:px-20">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-6">
          <img src="/logo.png" alt="Chat VAN" className="h-7 w-auto opacity-50" />
          {/* SNS */}
          <div className="flex items-center gap-5">
            {/* X (Twitter) */}
            <a href="#" aria-label="X" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.631 5.903-5.631Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            {/* Instagram */}
            <a href="#" aria-label="Instagram" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069Zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/>
              </svg>
            </a>
            {/* LINE */}
            <a href="#" aria-label="LINE" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-black/35">
            <Link href="/company"><span className="hover:text-black cursor-pointer transition-colors">会社概要</span></Link>
            <span className="text-black/15">|</span>
            <Link href="/terms"><span className="hover:text-black cursor-pointer transition-colors">利用規約</span></Link>
            <span className="text-black/15">|</span>
            <Link href="/privacy"><span className="hover:text-black cursor-pointer transition-colors">個人情報保護方針</span></Link>
            <span className="text-black/15">|</span>
            <Link href="/tokusho"><span className="hover:text-black cursor-pointer transition-colors">特定商取引法に基づく表記</span></Link>
          </div>
          <p className="text-black/20 text-xs">© 2026 Chat VAN. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
