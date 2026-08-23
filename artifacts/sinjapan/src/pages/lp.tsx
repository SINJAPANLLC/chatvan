import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';

const VAN_PHOTOS = [
  '/images/van-1.png',
  '/images/van-2.png',
  '/images/van-3.png',
  '/images/van-4.png',
  '/images/van-5.png',
];

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
            <span className="block" style={{ fontSize: 'clamp(1.6rem, 8.5vw, 7.5rem)' }}>チャットするだけ。</span>
            <span className="block" style={{ fontSize: 'clamp(1.6rem, 8.5vw, 7.5rem)' }}>軽バンかりれる。</span>
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

        {/* Store Badges */}
        <div className="absolute bottom-14 right-6 md:right-20 flex flex-col items-end gap-2">
          {/* App Store - 準備中 */}
          <div className="relative select-none">
            <div className="flex items-center gap-2.5 bg-black rounded-xl px-4 py-2.5 w-[152px] opacity-35">
              <svg width="20" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="text-white">
                <p className="text-[9px] leading-none opacity-70">Download on the</p>
                <p className="text-[13px] font-semibold leading-tight mt-0.5">App Store</p>
              </div>
            </div>
            <span className="absolute -top-2 -right-2 bg-black text-white text-[9px] font-bold px-2 py-0.5 rounded-full">準備中</span>
          </div>

          {/* Google Play - 準備中 */}
          <div className="relative select-none">
            <div className="flex items-center gap-2.5 bg-black rounded-xl px-4 py-2.5 w-[152px] opacity-35">
              <svg width="20" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M3 20.5v-17c0-.83.94-1.3 1.6-.8l14 8.5c.6.37.6 1.23 0 1.6l-14 8.5c-.66.5-1.6.03-1.6-.8zM5 6.87v10.26L16.01 12 5 6.87z"/>
              </svg>
              <div className="text-white">
                <p className="text-[9px] leading-none opacity-70">GET IT ON</p>
                <p className="text-[13px] font-semibold leading-tight mt-0.5">Google Play</p>
              </div>
            </div>
            <span className="absolute -top-2 -right-2 bg-black text-white text-[9px] font-bold px-2 py-0.5 rounded-full">準備中</span>
          </div>

          {/* LINE 友だち追加 */}
          <a href="#" className="flex items-center gap-2.5 bg-[#06C755] rounded-xl px-4 py-2.5 w-[152px] hover:bg-[#05b34d] transition-colors">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            <div className="text-white">
              <p className="text-[9px] leading-none opacity-80">友だち追加</p>
              <p className="text-[13px] font-semibold leading-tight mt-0.5">LINE</p>
            </div>
          </a>
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

      {/* Van Photo Slider */}
      <section className="bg-white pt-10 pb-4 overflow-hidden">
        <style>{`
          .van-slider {
            overflow: hidden;
            width: 100%;
            -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
            mask-image: linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
          }
          .van-track {
            display: flex;
            width: calc(240px * 20);
            animation: van-scroll 28s linear infinite;
            will-change: transform;
          }
          .van-slide {
            width: 240px;
            height: 160px;
            flex-shrink: 0;
            padding: 0 8px;
          }
          .van-slide img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
          @keyframes van-scroll {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-25%); }
          }
          @media (max-width: 768px) {
            .van-track { width: calc(180px * 20); }
            .van-slide { width: 180px; height: 120px; }
          }
        `}</style>
        <div className="van-slider">
          <div className="van-track">
            {[...VAN_PHOTOS, ...VAN_PHOTOS, ...VAN_PHOTOS, ...VAN_PHOTOS].map((src, i) => (
              <div key={i} className="van-slide">
                <img src={src} alt={`軽バン ${(i % VAN_PHOTOS.length) + 1}`} />
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
              <details key={item.q} className="group border-b border-black/8 last:border-b-0 py-6 cursor-pointer">
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

      {/* 導入パートナー 無限スライダー */}
      <section className="bg-white py-16 border-t border-black/8">
        <style>{`
          .sin-logo-wall {
            --slide-w: 200px;
            --slide-h: 110px;
            --speed: 22s;
          }
          .sin-slider {
            height: var(--slide-h);
            overflow: hidden;
            width: 100%;
            -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%);
            mask-image: linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%);
          }
          .sin-slide-track {
            display: flex;
            width: calc(var(--slide-w) * 16);
            animation: sin-scroll var(--speed) linear infinite;
            will-change: transform;
          }
          .sin-slide {
            width: var(--slide-w);
            height: var(--slide-h);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .sin-slide img {
            max-width: 160px;
            max-height: 72px;
            object-fit: contain;
            display: block;
          }
          @keyframes sin-scroll {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-25%); }
          }
          @media (max-width: 768px) {
            .sin-logo-wall {
              --slide-w: 160px;
              --slide-h: 90px;
              --speed: 18s;
            }
            .sin-slide-track {
              width: calc(var(--slide-w) * 16);
            }
          }
        `}</style>
        <div className="sin-logo-wall">
          <div className="sin-slider">
            <div className="sin-slide-track">
              {(() => {
                const logos = [
                  'https://s3-ap-northeast-1.amazonaws.com/s3.peraichi.com/userData/5b45aaad-02a4-4454-911d-14fb0a0000c5/img/1c9b1920-d996-013e-3faf-0a58a9feac02/70617d441cf711e88062963aecd2c947.jpg',
                  'https://s3-ap-northeast-1.amazonaws.com/s3.peraichi.com/userData/5b45aaad-02a4-4454-911d-14fb0a0000c5/img/095c3f70-d994-013e-82c3-0a58a9feac02/m_logo.png',
                  'https://s3-ap-northeast-1.amazonaws.com/s3.peraichi.com/userData/5b45aaad-02a4-4454-911d-14fb0a0000c5/img/0f974c20-d994-013e-82c4-0a58a9feac02/nikko-logo.jpg',
                  'https://s3-ap-northeast-1.amazonaws.com/s3.peraichi.com/userData/5b45aaad-02a4-4454-911d-14fb0a0000c5/img/1412ad40-d994-013e-82c6-0a58a9feac02/tmp-75613e906c3e5ab6ea00c4f39150e44f-cff486a9ddccba3a97b5c4297fb3c057.jpg',
                ];
                return [...logos, ...logos, ...logos, ...logos].map((src, i) => (
                  <div key={i} className="sin-slide">
                    <img src={src} alt="" />
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white py-36 px-6 md:px-20 text-center border-t border-black/8 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
          <span className="text-black/[0.025] font-black leading-none" style={{ fontSize: 'clamp(6rem, 20vw, 20rem)' }}>START</span>
        </div>
        <div className="relative z-10 max-w-xl mx-auto">
          <h2 className="font-black tracking-tight leading-tight mb-4" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)' }}>
            まず、チャットで相談してみよう。
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
            {/* Facebook */}
            <a href="#" aria-label="Facebook" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            {/* YouTube */}
            <a href="#" aria-label="YouTube" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </a>
            {/* TikTok */}
            <a href="#" aria-label="TikTok" className="text-black/30 hover:text-black transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-black/35">
            <Link href="/lp-company"><span className="hover:text-black cursor-pointer transition-colors">レンタル会社の方はこちら</span></Link>
            <span className="text-black/15">|</span>
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

      {/* Fixed panda */}
      <Link href="/register">
        <img
          src="/images/panda.png"
          alt="登録してね！"
          className="fixed bottom-0 left-0 z-50 cursor-pointer select-none"
          style={{ width: 'clamp(140px, 28vw, 220px)' }}
        />
      </Link>
    </div>
  );
}
