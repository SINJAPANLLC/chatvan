import React, { useState, useEffect } from 'react';
import { Link, useRoute } from 'wouter';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowLeft, Tag, Clock, Share2 } from 'lucide-react';

type Post = {
  id: number; slug: string; title: string; excerpt: string; content: string;
  category: string; tags?: string; metaTitle?: string; metaDescription?: string;
  publishedAt?: string; createdAt: string;
};

// Markdownの基本的なHTMLレンダリング（軽量）
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // --- 水平線
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0">')
    // H2
    .replace(/^## (.+)$/gm, '<h2 style="font-size:20px;font-weight:800;color:#111;margin:40px 0 16px;padding-bottom:10px;border-bottom:2px solid #000">$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:700;color:#222;margin:28px 0 12px">$1</h3>')
    // blockquote
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:4px solid #000;padding:12px 20px;margin:24px 0;background:#f7f7f7;border-radius:0 8px 8px 0;color:#333;font-size:14px">$1</blockquote>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:#000">$1</strong>')
    // チェックボックス（✅）
    .replace(/^✅ (.+)$/gm, '<div style="display:flex;align-items:flex-start;gap:10px;margin:8px 0;font-size:14px"><span style="color:#16a34a;flex-shrink:0;margin-top:2px">✅</span><span>$1</span></div>')
    // unordered list
    .replace(/^- (.+)$/gm, '<li style="margin:6px 0;padding-left:4px;font-size:15px;color:#333;line-height:1.8">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="margin:16px 0;padding-left:20px;list-style:disc">${m}</ul>`)
    // 段落（空行で区切る）
    .replace(/\n{2,}/g, '</p><p style="font-size:15px;color:#333;line-height:2;margin:0 0 20px">')
    // 行末の改行
    .replace(/\n/g, '<br>');
}

const RELATED_LABELS: Record<string, string> = {
  'コスト削減':  '配送コストを削減する方法',
  '物流DX':     '物流DXで業務を効率化',
  '運送会社選び': '最適な運送会社の選び方',
  '物流戦略':   '物流戦略で競争力を高める',
  '物流運営':   '物流運営の現場課題を解決',
};

export default function BlogArticle() {
  const [, params] = useRoute('/blog/:slug');
  const slug = params?.slug;
  const [post, setPost] = useState<Post | null>(null);
  const [related, setRelated] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/blog/${slug}`).then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/blog').then(r => r.json()),
    ]).then(([p, all]) => {
      setPost(p);
      setRelated((all as Post[]).filter((a: Post) => a.slug !== slug && a.category === p.category).slice(0, 3));
      const pageTitle = p.metaTitle ?? `${p.title}｜Chat VAN ブログ`;
      document.title = pageTitle;
      const baseUrl = 'https://chatlogi.jp';
      const canonicalUrl = `${baseUrl}/blog/${p.slug}`;
      // meta description
      const setMeta = (sel: string, attr: string, val: string) => {
        let el = document.querySelector(sel);
        if (!el) { el = document.createElement('meta'); document.head.appendChild(el); }
        el.setAttribute(attr, val);
      };
      if (p.metaDescription) setMeta('meta[name="description"]', 'content', p.metaDescription);
      // canonical
      let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
      canon.href = canonicalUrl;
      // OG tags
      setMeta('meta[property="og:title"]', 'content', pageTitle);
      setMeta('meta[property="og:description"]', 'content', p.metaDescription ?? p.excerpt);
      setMeta('meta[property="og:url"]', 'content', canonicalUrl);
      setMeta('meta[property="og:type"]', 'content', 'article');
      // Twitter
      setMeta('meta[name="twitter:title"]', 'content', pageTitle);
      setMeta('meta[name="twitter:description"]', 'content', p.metaDescription ?? p.excerpt);
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <p style={{ color: '#aaa' }}>読み込み中…</p>
    </div>
  );

  if (notFound || !post) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#fff' }}>
      <p style={{ fontSize: 18, fontWeight: 700 }}>記事が見つかりません</p>
      <Link href="/blog"><span style={{ color: '#666', fontSize: 14 }}>← ブログ一覧に戻る</span></Link>
    </div>
  );

  const tags: string[] = (() => { try { return JSON.parse(post.tags ?? '[]'); } catch { return []; } })();
  const html = renderMarkdown(post.content);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif" }}>

      {/* ヘッダー */}
      <header style={{ borderBottom: '1px solid #e5e5e5', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/lp">
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1, color: '#000', cursor: 'pointer' }}>Chat VAN</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link href="/blog"><span style={{ fontSize: 13, color: '#333' }}>ブログ</span></Link>
            <Link href="/lp">
              <span style={{ fontSize: 13, background: '#000', color: '#fff', padding: '8px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                無料で相談する
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* 記事ヒーロー */}
      <div style={{ background: '#000', padding: '48px 24px 40px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <Link href="/blog">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
              <ArrowLeft size={14} />ブログ一覧
            </span>
          </Link>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, background: '#fff', color: '#000', padding: '4px 12px', borderRadius: 999, fontWeight: 700 }}>
              {post.category}
            </span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, lineHeight: 1.5, margin: '0 0 20px' }}>{post.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <span style={{ color: '#888', fontSize: 13 }}>
              {post.publishedAt ? format(new Date(post.publishedAt), 'yyyy年MM月dd日', { locale: ja }) : ''}
            </span>
            <span style={{ color: '#888', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} />約{Math.max(5, Math.ceil(post.content.length / 400))}分で読める
            </span>
          </div>
        </div>
      </div>

      {/* メインコンテンツ + サイドバー */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 48, alignItems: 'start' }}>

        {/* 記事本文 */}
        <article>
          {/* リード文 */}
          <p style={{ fontSize: 16, color: '#555', lineHeight: 2, padding: '20px 24px', background: '#f7f7f7', borderRadius: 10, marginBottom: 32, borderLeft: '4px solid #000' }}>
            {post.excerpt}
          </p>

          {/* 本文 */}
          <div
            style={{ fontSize: 15, color: '#333', lineHeight: 2 }}
            dangerouslySetInnerHTML={{ __html: `<p style="font-size:15px;color:#333;line-height:2;margin:0 0 20px">${html}</p>` }}
          />

          {/* タグ */}
          {tags.length > 0 && (
            <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Tag size={14} style={{ color: '#aaa' }} />
              {tags.map(t => (
                <span key={t} style={{ fontSize: 12, color: '#666', background: '#f0f0f0', padding: '3px 10px', borderRadius: 999 }}>{t}</span>
              ))}
            </div>
          )}

          {/* ボトムCTA */}
          <div style={{ marginTop: 48, background: '#000', borderRadius: 16, padding: '40px 36px', textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>CHAT LOGI</p>
            <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 14px', lineHeight: 1.4 }}>
              物流コストを今すぐ削減しませんか？
            </h3>
            <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 24px', lineHeight: 1.8 }}>
              AIがチャットで最適な運送プランを提案します。<br />
              初期費用・月額費用0円。まずは無料でお試しください。
            </p>
            <Link href="/lp">
              <span style={{ display: 'inline-block', background: '#fff', color: '#000', padding: '14px 36px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                今すぐ無料で相談する →
              </span>
            </Link>
          </div>
        </article>

        {/* サイドバー */}
        <aside style={{ position: 'sticky', top: 80 }}>
          {/* 相談CTA */}
          <div style={{ background: '#000', borderRadius: 12, padding: '28px 24px', marginBottom: 24, textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 11, letterSpacing: 1.5, marginBottom: 10 }}>CHAT LOGI</p>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, lineHeight: 1.5, margin: '0 0 12px' }}>
              物流コストを<br />削減したいですか？
            </p>
            <p style={{ color: '#aaa', fontSize: 12, margin: '0 0 20px', lineHeight: 1.7 }}>
              チャットするだけ。あとはChat VANが手配します。
            </p>
            <Link href="/lp">
              <span style={{ display: 'block', background: '#fff', color: '#000', padding: '12px 0', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', textAlign: 'center' }}>
                無料で相談する →
              </span>
            </Link>
          </div>

          {/* 関連記事 */}
          {related.length > 0 && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#999', letterSpacing: 1, marginBottom: 12 }}>関連記事</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {related.map(r => (
                  <Link key={r.id} href={`/blog/${r.slug}`}>
                    <div style={{ border: '1px solid #e5e5e5', borderRadius: 10, padding: '16px', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f7')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111', lineHeight: 1.5, margin: 0 }}>{r.title}</p>
                      <p style={{ fontSize: 11, color: '#aaa', margin: '6px 0 0' }}>
                        {r.publishedAt ? format(new Date(r.publishedAt), 'yyyy/MM/dd') : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* SNSシェア */}
          <div style={{ marginTop: 24, padding: '20px 24px', border: '1px solid #e5e5e5', borderRadius: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Share2 size={13} />この記事をシェア
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {[
                { label: 'X (Twitter)', color: '#000', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(window.location.href)}` },
                { label: 'LINE', color: '#06c755', href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(window.location.href)}` },
              ].map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, background: s.color, color: '#fff', padding: '8px 16px', borderRadius: 6, fontWeight: 600, textDecoration: 'none' }}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* フッター */}
      <footer style={{ borderTop: '1px solid #e5e5e5', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: '#bbb', fontSize: 12 }}>© {new Date().getFullYear()} Chat VAN｜チャットするだけで荷物が運べる</p>
      </footer>
    </div>
  );
}
