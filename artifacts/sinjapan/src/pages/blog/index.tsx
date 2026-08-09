import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowRight, Clock, Tag } from 'lucide-react';

type Post = {
  id: number; slug: string; title: string; excerpt: string;
  category: string; tags?: string; publishedAt?: string; createdAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  'コスト削減':  'bg-amber-100 text-amber-800',
  '物流DX':     'bg-blue-100 text-blue-800',
  '運送会社選び': 'bg-green-100 text-green-800',
  '物流戦略':   'bg-purple-100 text-purple-800',
  '物流運営':   'bg-rose-100 text-rose-800',
  '物流コラム': 'bg-gray-100 text-gray-700',
};

function readingTime(excerpt: string) {
  return Math.max(3, Math.ceil(excerpt.length / 500));
}

export default function BlogIndex() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('すべて');

  useEffect(() => {
    fetch('/api/blog')
      .then(r => r.json())
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
    document.title = 'Chat VAN ブログ｜物流担当者のための実践ガイド';
  }, []);

  const categories = ['すべて', ...Array.from(new Set(posts.map(p => p.category)))];
  const filtered = activeCategory === 'すべて' ? posts : posts.filter(p => p.category === activeCategory);
  const [featured, ...rest] = filtered;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif" }}>

      {/* ヘッダー */}
      <header style={{ borderBottom: '1px solid #e5e5e5', background: '#fff', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/lp">
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 1, color: '#000', cursor: 'pointer' }}>Chat VAN</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Link href="/blog"><span style={{ fontSize: 13, color: '#333', fontWeight: 600 }}>ブログ</span></Link>
            <Link href="/lp">
              <span style={{ fontSize: 13, background: '#000', color: '#fff', padding: '8px 18px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                無料で相談する
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ヒーロー */}
      <section style={{ background: '#000', padding: '60px 24px 48px', textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>CHAT LOGI BLOG</p>
        <h1 style={{ color: '#fff', fontSize: 32, fontWeight: 800, margin: '0 0 16px', lineHeight: 1.3 }}>
          物流担当者のための<br />実践ガイド
        </h1>
        <p style={{ color: '#aaa', fontSize: 14, maxWidth: 480, margin: '0 auto' }}>
          コスト削減・DX・運送会社選びまで。現場で使えるノウハウを発信します。
        </p>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>

        {/* カテゴリフィルター */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 40 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              style={{
                padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                background: activeCategory === cat ? '#000' : '#f0f0f0',
                color: activeCategory === cat ? '#fff' : '#555',
                transition: 'all 0.15s',
              }}>
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa' }}>読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#aaa' }}>記事がありません</div>
        ) : (
          <>
            {/* フィーチャード記事 */}
            {featured && (
              <Link href={`/blog/${featured.slug}`}>
                <div style={{ marginBottom: 48, cursor: 'pointer' }}>
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e5e5', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    {/* 左：背景 */}
                    <div style={{ background: '#111', padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: 11, background: '#fff', color: '#000', padding: '4px 12px', borderRadius: 999, fontWeight: 700 }}>
                          {featured.category}
                        </span>
                        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 20, lineHeight: 1.5 }}>{featured.title}</h2>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
                        <span style={{ color: '#888', fontSize: 12 }}>
                          {featured.publishedAt ? format(new Date(featured.publishedAt), 'yyyy年MM月dd日', { locale: ja }) : ''}
                        </span>
                        <span style={{ color: '#888', fontSize: 12 }}>約{readingTime((featured as any).content ?? featured.excerpt)}分で読める</span>
                      </div>
                    </div>
                    {/* 右：抜粋 */}
                    <div style={{ padding: '48px 40px', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <p style={{ color: '#555', fontSize: 15, lineHeight: 1.9, margin: 0 }}>{featured.excerpt}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 24, fontWeight: 700, fontSize: 14, color: '#000' }}>
                        続きを読む <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* 記事グリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
              {rest.map(post => {
                const catColor = CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS['物流コラム'];
                const tags: string[] = (() => { try { return JSON.parse(post.tags ?? '[]'); } catch { return []; } })();
                return (
                  <Link key={post.id} href={`/blog/${post.slug}`}>
                    <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.2s', background: '#fff' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                      {/* カードヘッダー */}
                      <div style={{ background: '#f7f7f7', padding: '28px 24px 20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, ...Object.fromEntries(catColor.split(' ').map(c => [c.startsWith('bg-') ? 'background' : 'color', c.replace(/^(bg|text)-/, '').replace('-', ' ')])) }} className={catColor}>
                          {post.category}
                        </span>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111', marginTop: 12, lineHeight: 1.55 }}>{post.title}</h3>
                      </div>
                      <div style={{ padding: '16px 24px 24px' }}>
                        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.8, margin: '0 0 16px' }}>{post.excerpt}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#aaa' }}>
                            {post.publishedAt ? format(new Date(post.publishedAt), 'yyyy/MM/dd') : ''}
                          </span>
                          <span style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} />約{readingTime(post.excerpt)}分
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* 下部CTA */}
        <div style={{ marginTop: 80, background: '#000', borderRadius: 16, padding: '48px 40px', textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>CHAT LOGI</p>
          <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 0 16px' }}>
            AIが物流コストを最適化します
          </h2>
          <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 28px' }}>
            チャットで依頼するだけで、最適な運送会社を即時手配。初期費用・月額費用0円。
          </p>
          <Link href="/lp">
            <span style={{ display: 'inline-block', background: '#fff', color: '#000', padding: '14px 36px', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              今すぐ無料で相談する →
            </span>
          </Link>
        </div>
      </div>

      {/* フッター */}
      <footer style={{ borderTop: '1px solid #e5e5e5', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: '#bbb', fontSize: 12 }}>© {new Date().getFullYear()} Chat VAN｜チャットするだけで荷物が運べる</p>
      </footer>
    </div>
  );
}
