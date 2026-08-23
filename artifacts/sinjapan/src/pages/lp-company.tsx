import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';

export default function LPCompany() {
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
          <Link href="/company/login">
            <button className="text-black/50 text-sm hover:text-black transition-colors">ログイン</button>
          </Link>
          <Link href="/company/register">
            <button className="bg-black text-white text-sm font-bold px-5 py-2 hover:bg-black/80 transition-colors">
              パートナー登録
            </button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen bg-white flex flex-col justify-center px-6 md:px-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-end">
          <span className="text-[clamp(6rem,18vw,18rem)] font-black text-black/[0.04] leading-none tracking-tight whitespace-nowrap pr-4">PARTNER</span>
        </div>
        <div className="max-w-5xl mx-auto w-full relative z-10 pt-20">
          <p className="text-black/35 text-xs tracking-[0.4em] uppercase mb-10">For Rental Companies</p>
          <h1 className="font-black leading-[1.05] tracking-tight mb-8">
            <span className="block" style={{ fontSize: 'clamp(1.6rem, 8vw, 6.5rem)' }}>遊んでいる軽バンを、</span>
            <span className="block" style={{ fontSize: 'clamp(1.6rem, 8vw, 6.5rem)' }}>収益に変えよう。</span>
          </h1>
          <p className="text-black/50 text-lg leading-relaxed mb-14 max-w-xl">
            Chat VANに車両を登録するだけ。<br />
            集客・マッチング・契約管理はすべておまかせです。
          </p>
          <Link href="/company/register">
            <button className="group bg-black text-white font-bold text-lg px-12 py-5 hover:bg-black/80 transition-all flex items-center gap-3">
              無料でパートナー登録
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
          <p className="text-black/25 text-sm mt-6">初期費用無料・成約時のみ手数料</p>
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
            { num: '無料', label: '初期費用・月額費用' },
            { num: '全国', label: '対応エリア' },
            { num: '即日', label: '掲載開始スピード' },
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
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>参加の流れ</h2>
          <div className="space-y-0">
            {[
              { num: '01', title: '無料で登録', body: '会社情報を入力するだけ。審査後すぐに利用開始できます。', tags: ['初期費用無料', '審査あり'] },
              { num: '02', title: '車両を登録', body: '保有車両の情報（車種・エリア・空き状況）を登録します。', tags: ['複数台対応', 'いつでも更新可'] },
              { num: '03', title: 'マッチング・提案', body: 'ユーザーからの依頼をもとに、Chat VANがマッチングを行います。提案内容はダッシュボードで確認できます。', tags: ['Chat VANが集客', '提案内容を事前確認'] },
              { num: '04', title: '成約・売上管理', body: '契約が成立したら売上が発生。入金・請求もダッシュボードで一括管理できます。', tags: ['成約時のみ手数料', '売上はダッシュボードで確認'] },
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

      {/* Features */}
      <section className="bg-white py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">Features</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>Chat VANが<br />選ばれる理由</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { title: '集客はおまかせ', body: 'ユーザーの集客・マッチングはすべてChat VANが行います。営業コストをかけずに案件を受けられます。' },
              { title: '初期費用・月額費用なし', body: '登録・掲載は完全無料。手数料は成約時のみ発生するため、リスクなく始められます。' },
              { title: '契約・書類もシステムで完結', body: '電子契約・入金管理・請求書発行もダッシュボードで一括管理。事務作業を大幅に削減できます。' },
              { title: '複数台・複数エリア対応', body: '1社で複数の車両・エリアを登録可能。稼働率の低い車両を効率よく活用できます。' },
            ].map((f) => (
              <div key={f.title} className="flex gap-5">
                <span className="font-black text-lg mt-0.5 shrink-0">—</span>
                <div>
                  <h3 className="font-bold mb-1.5">{f.title}</h3>
                  <p className="text-black/45 text-sm leading-relaxed">{f.body}</p>
                </div>
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
              { q: '手数料はどのくらいですか？', a: '成約時のみ手数料が発生します。金額は審査後にご案内します。月額費用・初期費用は無料です。' },
              { q: '何台から登録できますか？', a: '1台から登録可能です。複数台・複数エリアにも対応しています。' },
              { q: '既存の顧客への営業活動はありますか？', a: 'ありません。Chat VANが新規ユーザーを集客し、条件に合った案件のみご提案します。' },
              { q: '審査にはどのくらいかかりますか？', a: '通常3〜5営業日以内にご連絡します。' },
              { q: 'どのエリアで対応していますか？', a: '全国対応しています。登録時にご対応可能なエリアをお知らせください。' },
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
          <span className="text-black/[0.025] font-black leading-none" style={{ fontSize: 'clamp(6rem, 20vw, 20rem)' }}>JOIN</span>
        </div>
        <div className="relative z-10 max-w-xl mx-auto">
          <h2 className="font-black tracking-tight leading-tight mb-4" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>
            まず、登録してみよう。
          </h2>
          <p className="text-black/35 text-sm mb-12">初期費用無料・成約時のみ手数料・いつでも退会可</p>
          <Link href="/company/register">
            <button className="group bg-black text-white font-bold text-xl px-16 py-6 hover:bg-black/80 transition-all inline-flex items-center gap-4">
              無料でパートナー登録
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-black/8 py-12 px-6 md:px-20">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-6">
          <img src="/logo.png" alt="Chat VAN" className="h-7 w-auto opacity-50" />
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-black/35">
            <Link href="/lp"><span className="hover:text-black cursor-pointer transition-colors">利用者の方はこちら</span></Link>
            <span className="text-black/15">|</span>
            <Link href="/terms"><span className="hover:text-black cursor-pointer transition-colors">利用規約</span></Link>
            <span className="text-black/15">|</span>
            <Link href="/privacy"><span className="hover:text-black cursor-pointer transition-colors">個人情報保護方針</span></Link>
          </div>
          <p className="text-black/20 text-xs">© 2026 Chat VAN. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
