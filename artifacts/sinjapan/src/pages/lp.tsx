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

      {/* ── Nav ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm border-b border-black/8' : 'bg-white'}`}>
        <img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <Link href="/login">
            <button className="text-black/50 text-sm hover:text-black transition-colors">ログイン</button>
          </Link>
          <Link href="/register">
            <button className="bg-black text-white text-sm font-bold px-5 py-2 hover:bg-black/80 transition-colors">
              無料で始める
            </button>
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="min-h-screen bg-white flex flex-col justify-center px-6 md:px-20 relative overflow-hidden">
        {/* bg watermark */}
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-end pr-4 md:pr-0">
          <span className="text-[clamp(8rem,22vw,20rem)] font-black text-black/[0.04] leading-none tracking-tight whitespace-nowrap">
            CHAT VAN
          </span>
        </div>

        <div className="max-w-5xl mx-auto w-full relative z-10 pt-20">
          <p className="text-black/35 text-xs tracking-[0.4em] uppercase mb-10">軽バンレンタル × チャット</p>

          <h1 className="font-black leading-[1.05] tracking-tight mb-8">
            <span className="block text-black" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>
              チャットするだけ。
            </span>
            <span className="block text-black" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>
              軽バンかりれる。
            </span>
          </h1>

          <p className="text-black/50 text-base md:text-xl leading-relaxed mb-14 max-w-lg">
            エリア・期間・用途をチャットで伝えるだけ。<br />
            手続きゼロで、あなたに合う車両をすぐ提案します。
          </p>

          <Link href="/register">
            <button className="group bg-black text-white font-bold text-lg px-12 py-5 hover:bg-black/80 transition-all flex items-center gap-3">
              無料で相談する
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>

          <p className="text-black/25 text-sm mt-6">登録無料・最短即日対応・対面不要</p>
        </div>

        {/* scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <span className="text-black/20 text-[10px] tracking-[0.4em] uppercase">Scroll</span>
          <div className="w-px h-14 bg-gradient-to-b from-black/20 to-transparent" />
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">How it works</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            3ステップで完結
          </h2>

          <div className="grid md:grid-cols-3 gap-0 md:divide-x divide-black/10">
            {[
              {
                num: '01',
                title: 'チャットで相談',
                body: 'エリア・利用期間・用途をチャットに入力するだけ。難しいフォームも書類も不要です。',
              },
              {
                num: '02',
                title: '車両をご提案',
                body: '条件に合った軽バンを最短即日でご提案。複数の候補からお好みで選べます。',
              },
              {
                num: '03',
                title: 'そのまま契約',
                body: '書類のやりとりもチャットで完結。面倒な対面手続きは一切ありません。',
              },
            ].map((s) => (
              <div key={s.num} className="px-0 md:px-10 py-8 first:pl-0 last:pr-0">
                <p className="font-black text-black/8 leading-none mb-6" style={{ fontSize: 'clamp(4rem, 8vw, 6rem)' }}>
                  {s.num}
                </p>
                <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                <p className="text-black/50 leading-relaxed text-sm">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-white py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">Features</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Chat VANを<br />選ぶ理由
          </h2>

          <div className="grid md:grid-cols-2 gap-px bg-black/8">
            {[
              {
                title: '最短即日対応',
                body: 'チャット送信後、最短当日中に車両をご提案。急なニーズにもすぐ動きます。',
              },
              {
                title: '全国対応',
                body: '全国各地のレンタル会社と提携。あなたのエリアに合った車両をご案内します。',
              },
              {
                title: '完全チャット完結',
                body: '相談・提案・契約まですべてチャット。店舗に行く手間は一切不要です。',
              },
              {
                title: '法人・個人どちらも対応',
                body: '個人事業主から中小企業まで。軽貨物・出張・移動販売など用途は自由。',
              },
            ].map((f) => (
              <div key={f.title} className="bg-white p-10 md:p-12">
                <h3 className="text-black text-xl font-bold mb-4">{f.title}</h3>
                <p className="text-black/45 leading-relaxed text-sm">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For ── */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">For you</p>
          <h2 className="font-black tracking-tight mb-16" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            こんな方に
          </h2>

          <div className="grid md:grid-cols-2 gap-0">
            {[
              '軽貨物の配送事業を始めたい',
              '急に車両が必要になった',
              '移動販売・出張業務で使いたい',
              '法人で複数台まとめて借りたい',
              '短期間だけ車両が必要',
              '対面手続きが面倒、時間が取れない',
            ].map((item, i) => (
              <div key={item} className="flex items-center gap-5 py-5 border-b border-black/8 bg-[#f7f7f7]">
                <span className="text-black/20 font-black text-sm tabular-nums w-8 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-black/70 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-white py-36 px-6 md:px-20 text-center relative overflow-hidden border-t border-black/8">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
          <span className="text-black/[0.025] font-black leading-none" style={{ fontSize: 'clamp(6rem, 20vw, 20rem)' }}>
            START
          </span>
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="text-black font-black tracking-tight leading-tight mb-6" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>
            まず、チャットで<br />相談してみよう。
          </h2>
          <p className="text-black/30 text-base mb-12 tracking-wider">
            登録無料&emsp;|&emsp;最短即日&emsp;|&emsp;対面不要
          </p>
          <Link href="/register">
            <button className="group bg-black text-white font-bold text-xl px-16 py-6 hover:bg-black/80 transition-all inline-flex items-center gap-4">
              無料で始める
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-black/8 py-8 px-6 md:px-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/logo.png" alt="Chat VAN" className="h-7 w-auto opacity-60" />
          <div className="flex items-center gap-6 text-black/30 text-xs">
            <Link href="/login"><span className="hover:text-black cursor-pointer transition-colors">ログイン</span></Link>
            <Link href="/register"><span className="hover:text-black cursor-pointer transition-colors">新規登録</span></Link>
          </div>
          <p className="text-black/20 text-xs">© 2026 Chat VAN. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
