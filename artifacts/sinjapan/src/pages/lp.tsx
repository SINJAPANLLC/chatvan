import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';

function Nav({ scrolled }: { scrolled: boolean }) {
  return (
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
  );
}

export default function LP() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="font-['Noto_Sans_JP'] bg-white overflow-x-hidden text-black">
      <Nav scrolled={scrolled} />

      {/* ── Hero ── */}
      <section className="min-h-screen bg-white flex flex-col justify-center px-6 md:px-20 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-end">
          <span className="text-[clamp(8rem,22vw,20rem)] font-black text-black/[0.04] leading-none tracking-tight whitespace-nowrap pr-4">
            CHAT VAN
          </span>
        </div>
        <div className="max-w-5xl mx-auto w-full relative z-10 pt-20">
          <p className="text-black/35 text-xs tracking-[0.4em] uppercase mb-10">軽バンレンタル × チャット</p>
          <h1 className="font-black leading-[1.05] tracking-tight mb-8">
            <span className="block" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>チャットするだけ。</span>
            <span className="block" style={{ fontSize: 'clamp(2.8rem, 9vw, 7.5rem)' }}>軽バンかりれる。</span>
          </h1>
          <p className="text-black/50 text-base md:text-xl leading-relaxed mb-14 max-w-xl">
            希望エリア・利用期間・用途をチャットで伝えるだけ。<br />
            専任スタッフが条件に合った軽バンを最短即日でご提案します。<br />
            契約・支払いまで、すべてオンラインで完結。
          </p>
          <Link href="/register">
            <button className="group bg-black text-white font-bold text-lg px-12 py-5 hover:bg-black/80 transition-all flex items-center gap-3">
              無料で相談する
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </button>
          </Link>
          <p className="text-black/25 text-sm mt-6">登録無料・最短即日対応・対面不要</p>
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <span className="text-black/20 text-[10px] tracking-[0.4em] uppercase">Scroll</span>
          <div className="w-px h-14 bg-gradient-to-b from-black/20 to-transparent" />
        </div>
      </section>

      {/* ── Numbers ── */}
      <section className="bg-black py-16 px-6 md:px-20">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-0 divide-x divide-white/10">
          {[
            { num: '即日', label: '最短提案スピード' },
            { num: '全国', label: '対応エリア' },
            { num: '0円', label: '相談・登録費用' },
          ].map((s) => (
            <div key={s.label} className="text-center px-4 py-2">
              <p className="text-white font-black mb-1" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}>{s.num}</p>
              <p className="text-white/35 text-xs tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow ── */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">How it works</p>
          <h2 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            借りるまでの流れ
          </h2>
          <p className="text-black/45 mb-20 max-w-lg">すべてスマホひとつで完結。店舗に行く必要は一切ありません。</p>

          <div className="space-y-0">
            {[
              {
                num: '01',
                title: 'チャットで要望を入力',
                body: 'アカウント登録後、チャット画面からご利用エリア・希望期間・用途（配送・移動販売・出張など）を自由に入力。難しい書類作成は不要です。',
                sub: ['登録は1分で完了', 'LINEのように気軽に送るだけ', '24時間受付'],
              },
              {
                num: '02',
                title: '専任スタッフが車両を提案',
                body: '入力内容をもとに専任スタッフが車両・レンタル条件・料金をまとめてご提案。複数の候補から選べます。不明点はチャットでそのまま質問できます。',
                sub: ['最短即日提案', '複数候補から選択可', '条件の変更・追加相談OK'],
              },
              {
                num: '03',
                title: '書類・支払いもチャットで完結',
                body: '提案内容に納得したら、必要書類のアップロードと電子契約・オンライン決済までチャット上で完結。印鑑不要・郵送不要です。',
                sub: ['電子契約対応', 'クレジットカード決済', '請求書払い（法人）対応'],
              },
              {
                num: '04',
                title: '車両を受け取って利用開始',
                body: '受け取り日時・場所を調整して利用開始。利用中は専用アプリで車両ステータスを確認できます。トラブル時もチャットでサポートします。',
                sub: ['GPS位置確認機能あり', '事故・故障サポート', 'チャットで返却手続き'],
              },
            ].map((step, i) => (
              <div key={step.num} className="flex gap-8 md:gap-16 py-10 border-b border-black/8 last:border-0">
                <div className="shrink-0">
                  <p className="font-black text-black/10 leading-none" style={{ fontSize: 'clamp(3rem, 6vw, 5rem)' }}>
                    {step.num}
                  </p>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-bold mb-3">{step.title}</h3>
                  <p className="text-black/50 leading-relaxed mb-5 text-sm md:text-base">{step.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {step.sub.map((s) => (
                      <span key={s} className="text-xs border border-black/15 px-3 py-1 text-black/50">
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="bg-white py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">Use cases</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            こんな用途に使われています
          </h2>
          <div className="grid md:grid-cols-3 gap-px bg-black/8">
            {[
              {
                tag: '軽貨物・配送',
                title: '配送事業を始めたい',
                body: '軽貨物の仕事を始めたばかりで車両がない。購入前にまず借りて試したい。月額でまとめて複数台確保したい。',
              },
              {
                tag: '移動販売・キッチンカー',
                title: '移動販売の車両が必要',
                body: 'イベント期間だけ車両を借りたい。荷物が多いので軽バンが必要。キャンペーン期間の短期レンタルをしたい。',
              },
              {
                tag: '法人・出張',
                title: '法人で複数台確保したい',
                body: '繁忙期だけ台数を増やしたい。社員の出張・現場移動用に借りたい。請求書払いで経費処理したい。',
              },
            ].map((c) => (
              <div key={c.tag} className="bg-white p-10">
                <span className="text-[10px] tracking-[0.3em] text-black/30 uppercase border border-black/15 px-2 py-0.5">
                  {c.tag}
                </span>
                <h3 className="text-lg font-bold mt-4 mb-3">{c.title}</h3>
                <p className="text-black/45 text-sm leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-[#f7f7f7] py-28 px-6 md:px-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">Features</p>
          <h2 className="font-black tracking-tight mb-20" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Chat VANを選ぶ理由
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                title: '最短即日対応',
                body: 'チャット送信後、最短当日中に車両をご提案。急に車両が必要になった場合でも素早く対応します。',
              },
              {
                title: '全国対応',
                body: '全国各地のレンタル会社と提携。北海道から沖縄まで、あなたのエリアに合った車両をご案内します。',
              },
              {
                title: '書類・手続きが不要',
                body: '来店不要・印鑑不要・郵送不要。必要書類のアップロードから電子契約・決済まで、すべてスマホで完結します。',
              },
              {
                title: '法人請求書払い対応',
                body: '月末締め翌月末払いなど、法人に合わせた請求書払いに対応。経費処理がスムーズになります。',
              },
              {
                title: 'GPS・車両管理機能',
                body: '利用中は専用画面で車両の位置をリアルタイム確認。返却・状態確認もアプリ上で完結します。',
              },
              {
                title: '専任スタッフサポート',
                body: '契約後もチャットで気軽に相談可能。事故・故障・返却時のトラブルにも迅速に対応します。',
              },
            ].map((f) => (
              <div key={f.title} className="flex gap-5">
                <span className="text-black font-black text-lg mt-0.5 shrink-0">—</span>
                <div>
                  <h3 className="font-bold mb-1.5">{f.title}</h3>
                  <p className="text-black/45 text-sm leading-relaxed">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white py-28 px-6 md:px-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] tracking-[0.4em] text-black/30 uppercase mb-3">FAQ</p>
          <h2 className="font-black tracking-tight mb-16" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            よくある質問
          </h2>
          <div className="space-y-0">
            {[
              {
                q: '個人でも利用できますか？',
                a: 'はい、個人・個人事業主・法人のいずれも対応しています。用途に応じてご相談ください。',
              },
              {
                q: '利用期間はどのくらいから借りられますか？',
                a: '短期（数日〜）から長期（月単位）まで対応しています。利用期間はチャットでご相談ください。',
              },
              {
                q: '料金はどのくらいかかりますか？',
                a: '車両の種類・期間・エリアによって異なります。まずチャットで条件をお聞きし、お見積もりをご提示します。相談は無料です。',
              },
              {
                q: '来店や書類の郵送は必要ですか？',
                a: '不要です。本人確認書類のアップロードから電子契約・オンライン決済まで、すべてオンラインで完結します。',
              },
              {
                q: '法人での利用・請求書払いは対応していますか？',
                a: '対応しています。月末締め翌月末払いなどの法人向け支払い条件についてはチャットでご相談ください。',
              },
            ].map((item) => (
              <details key={item.q} className="group border-b border-black/8 py-6 cursor-pointer">
                <summary className="flex items-center justify-between font-bold text-base list-none">
                  {item.q}
                  <span className="text-black/30 group-open:rotate-45 transition-transform text-xl shrink-0 ml-4">＋</span>
                </summary>
                <p className="text-black/50 text-sm leading-relaxed mt-4">{item.a}</p>
              </details>
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
          <h2 className="text-black font-black tracking-tight leading-tight mb-4" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}>
            まず、チャットで<br />相談してみよう。
          </h2>
          <p className="text-black/40 text-base mb-4">相談は無料。しつこい営業は一切しません。</p>
          <p className="text-black/25 text-sm mb-12 tracking-wider">
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
          <img src="/logo.png" alt="Chat VAN" className="h-7 w-auto opacity-50" />
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
