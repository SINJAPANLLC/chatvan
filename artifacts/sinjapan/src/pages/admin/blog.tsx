import React, { useState, useEffect } from 'react';
import {
  Loader2, Plus, Trash2, Edit2, Eye, EyeOff, Sparkles,
  FileText, Globe, X, Save, ExternalLink, Check, Calendar, Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

type Post = {
  id: number; slug: string; title: string; excerpt: string; content: string;
  category: string; tags?: string; metaTitle?: string; metaDescription?: string;
  published: boolean; publishedAt?: string; createdAt: string; updatedAt: string;
};

const CATEGORIES = ['コスト削減', '物流DX', '運送会社選び', '物流戦略', '物流運営', '物流コラム'];

const EMPTY_FORM = {
  slug: '', title: '', excerpt: '', content: '', category: '物流コラム',
  metaTitle: '', metaDescription: '', published: false,
};

// ── 記事エディタ ───────────────────────────────────────────────────────────────
function ArticleEditor({
  initial, onSave, onClose,
}: {
  initial?: Post | null;
  onSave: (p: Post) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(
    initial ? {
      slug: initial.slug, title: initial.title, excerpt: initial.excerpt,
      content: initial.content, category: initial.category,
      metaTitle: initial.metaTitle ?? '', metaDescription: initial.metaDescription ?? '',
      published: initial.published,
    } : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'seo'>('content');

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const autoSlug = (title: string) =>
    title.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);

  const handleSave = async () => {
    if (!form.title || !form.slug || !form.content) {
      toast({ title: 'タイトル・スラッグ・本文は必須です', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const result = initial
        ? await apiFetch(`/api/admin/blog/${initial.id}`, { method: 'PATCH', body: JSON.stringify(form) })
        : await apiFetch('/api/admin/blog', { method: 'POST', body: JSON.stringify(form) });
      toast({ title: initial ? '記事を更新しました' : '記事を作成しました' });
      onSave(result);
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {initial ? '記事を編集' : '新規記事を作成'}
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <div onClick={() => set('published', !form.published)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.published ? 'bg-green-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform ${form.published ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className={form.published ? 'text-green-700 font-semibold' : 'text-muted-foreground'}>
                {form.published ? '公開中' : '下書き'}
              </span>
            </label>
            <Button onClick={handleSave} disabled={saving} className="bg-black text-white hover:bg-black/90 gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* タブ */}
        <div className="flex border-b border-border px-6">
          {(['content', 'seo'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t === 'content' ? '本文' : 'SEO設定'}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {activeTab === 'content' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label>タイトル <span className="text-red-500">*</span></Label>
                  <Input value={form.title} onChange={e => {
                    set('title', e.target.value);
                    if (!initial) set('slug', autoSlug(e.target.value));
                  }} placeholder="記事タイトル（SEOキーワードを含む）" />
                </div>
                <div className="space-y-1.5">
                  <Label>スラッグ（URL） <span className="text-red-500">*</span></Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">/blog/</span>
                    <Input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="url-slug" className="font-mono text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>カテゴリ</Label>
                  <select value={form.category} onChange={e => set('category', e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>概要（一覧に表示） <span className="text-xs text-muted-foreground font-normal">120文字以内</span></Label>
                  <Textarea value={form.excerpt} onChange={e => set('excerpt', e.target.value)}
                    placeholder="記事の要約。ブログ一覧カードに表示されます。" className="resize-none min-h-[80px]" maxLength={200} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>本文（Markdown） <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-muted-foreground">## H2見出し, ### H3見出し, **太字**, - リスト, &gt; 引用</p>
                  <Textarea value={form.content} onChange={e => set('content', e.target.value)}
                    className="resize-y min-h-[320px] font-mono text-sm" placeholder="## はじめに&#10;&#10;記事本文をMarkdown形式で記述..." />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>メタタイトル <span className="text-xs text-muted-foreground font-normal">60文字以内</span></Label>
                <Input value={form.metaTitle} onChange={e => set('metaTitle', e.target.value)}
                  placeholder={form.title || 'タイトル｜Chat LOGI ブログ'} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label>メタディスクリプション <span className="text-xs text-muted-foreground font-normal">120文字以内</span></Label>
                <Textarea value={form.metaDescription} onChange={e => set('metaDescription', e.target.value)}
                  placeholder="Googleの検索結果に表示される説明文（120文字以内推奨）" className="resize-none min-h-[80px]" maxLength={200} />
              </div>
              {/* Googleプレビュー */}
              <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-1">
                <p className="text-[#1a0dab] text-base font-medium truncate">
                  {form.metaTitle || form.title || 'タイトルを入力してください'}
                </p>
                <p className="text-[#006621] text-xs">https://chatlogi.jp/blog/{form.slug || 'slug'}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {form.metaDescription || form.excerpt || 'メタディスクリプションを入力してください'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI記事生成ダイアログ ───────────────────────────────────────────────────────
function GenerateDialog({ onGenerated, onClose }: { onGenerated: (d: any) => void; onClose: () => void }) {
  const { toast } = useToast();
  const [keyword, setKeyword] = useState('');
  const [painPoint, setPainPoint] = useState('');
  const [generating, setGenerating] = useState(false);

  const PAIN_PRESETS = [
    '配送コストが高い', '急な配送依頼に対応できない', '運送会社が見つからない',
    '配送状況が把握できない', 'ドライバー不足で困っている', '書類管理が煩雑',
    '物流DXを進めたい', '季節の繁閑差に対応できない',
  ];

  const handleGenerate = async () => {
    if (!keyword.trim()) { toast({ title: 'キーワードを入力してください', variant: 'destructive' }); return; }
    setGenerating(true);
    try {
      const data = await apiFetch('/api/admin/blog/generate', {
        method: 'POST',
        body: JSON.stringify({ keyword, painPoint }),
      });
      toast({ title: 'AIが記事を生成しました' });
      onGenerated(data);
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />AI記事自動生成
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          ターゲットキーワードと顧客の悩みを入力するだけで、SEO最適化された記事をAIが自動生成します。
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>メインキーワード <span className="text-red-500">*</span></Label>
            <Input value={keyword} onChange={e => setKeyword(e.target.value)}
              placeholder="例: 配送コスト削減、物流DX、運送会社 選び方" />
          </div>
          <div className="space-y-2">
            <Label>ターゲットの悩み</Label>
            <div className="flex flex-wrap gap-1.5">
              {PAIN_PRESETS.map(p => (
                <button key={p} onClick={() => setPainPoint(p)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    painPoint === p ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
            <Input value={painPoint} onChange={e => setPainPoint(e.target.value)} placeholder="または自由入力" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 leading-relaxed">
          💡 生成後にエディタで内容を確認・編集してから公開できます。
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleGenerate} disabled={generating} className="bg-black text-white hover:bg-black/90 gap-1.5">
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" />生成中…</>
              : <><Sparkles className="h-4 w-4" />記事を生成する</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ───────────────────────────────────────────────────────────────
type AutoGenStatus = { enabled: boolean; lastRun: string | null; lastTitle: string | null; schedule: string };

export default function AdminBlog() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | null | 'new'>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const [autoGen, setAutoGen] = useState<AutoGenStatus | null>(null);
  const [autoGenLoading, setAutoGenLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setPosts(await apiFetch('/api/admin/blog')); }
    catch { toast({ title: '取得に失敗しました', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const loadAutoGen = async () => {
    try { setAutoGen(await apiFetch('/api/admin/blog/auto-gen')); }
    catch { /* ignore */ }
  };

  useEffect(() => { load(); loadAutoGen(); }, []);

  const handleToggleAutoGen = async () => {
    if (!autoGen) return;
    setAutoGenLoading(true);
    try {
      const updated = await apiFetch('/api/admin/blog/auto-gen', {
        method: 'POST',
        body: JSON.stringify({ enabled: !autoGen.enabled }),
      });
      setAutoGen(updated);
      toast({ title: updated.enabled ? '自動生成を有効にしました' : '自動生成を無効にしました' });
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setAutoGenLoading(false); }
  };

  const handleRunNow = async () => {
    if (!confirm('今すぐ1記事を生成して公開しますか？（1〜2分かかります）')) return;
    setRunning(true);
    try {
      const r = await apiFetch('/api/admin/blog/auto-gen/run', { method: 'POST' });
      toast({ title: `公開しました：${r.title}` });
      load();
      loadAutoGen();
    } catch (e: any) { toast({ title: `生成失敗: ${e.message}`, variant: 'destructive' }); }
    finally { setRunning(false); }
  };

  const handleTogglePublish = async (post: Post) => {
    try {
      const updated = await apiFetch(`/api/admin/blog/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !post.published }),
      });
      setPosts(ps => ps.map(p => p.id === updated.id ? updated : p));
      toast({ title: updated.published ? '公開しました' : '非公開にしました' });
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この記事を削除しますか？')) return;
    try {
      await apiFetch(`/api/admin/blog/${id}`, { method: 'DELETE' });
      setPosts(ps => ps.filter(p => p.id !== id));
      toast({ title: '削除しました' });
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
  };

  const published = posts.filter(p => p.published).length;
  const draft = posts.filter(p => !p.published).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ブログ管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">SEO記事の作成・管理・公開設定を行います。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGenerate(true)} className="gap-1.5">
            <Sparkles className="h-4 w-4" />AI自動生成
          </Button>
          <Button onClick={() => { setPrefill(null); setEditing('new'); }} className="bg-black text-white hover:bg-black/90 gap-1.5">
            <Plus className="h-4 w-4" />新規作成
          </Button>
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3">
        {[['総記事数', posts.length, ''], ['公開中', published, 'text-green-600'], ['下書き', draft, 'text-amber-600']].map(([l, v, cls]) => (
          <div key={l as string} className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">{l}</p>
            <p className={`text-2xl font-bold ${cls}`}>{v}</p>
          </div>
        ))}
      </div>

      {/* 自動生成スケジューラー */}
      {autoGen && (
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg ${autoGen.enabled ? 'bg-green-100' : 'bg-muted'}`}>
              <Calendar className={`h-5 w-5 ${autoGen.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">毎日自動生成</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${autoGen.enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {autoGen.enabled ? '有効' : '無効'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{autoGen.schedule} · 物流テーマを自動ローテーション</p>
              {autoGen.lastRun && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  最終生成: {new Date(autoGen.lastRun).toLocaleString('ja-JP')}
                  {autoGen.lastTitle && ` — ${autoGen.lastTitle}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={running} className="gap-1.5">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              今すぐ生成
            </Button>
            <Button
              size="sm"
              onClick={handleToggleAutoGen}
              disabled={autoGenLoading}
              className={autoGen.enabled ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-black text-white hover:bg-black/90'}
            >
              {autoGenLoading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {autoGen.enabled ? '停止する' : '有効にする'}
            </Button>
          </div>
        </div>
      )}

      {/* 記事一覧 */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl text-muted-foreground text-sm">
          <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p>「AI自動生成」で最初の記事を作りましょう</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">タイトル</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">カテゴリ</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">更新日</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {posts.map(post => (
                <tr key={post.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium max-w-[340px] truncate">{post.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">/blog/{post.slug}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{post.category}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <button onClick={() => handleTogglePublish(post)}>
                      {post.published
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full hover:bg-green-100 transition-colors">
                            <Check className="h-3 w-3" />公開中
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors">
                            <EyeOff className="h-3 w-3" />下書き
                          </span>
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(post.updatedAt), 'yyyy/MM/dd HH:mm')}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      {post.published && (
                        <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => setEditing(post)}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(post.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ブログURL案内 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border border-border rounded-xl text-sm text-muted-foreground">
        <Globe className="h-4 w-4 flex-shrink-0" />
        <span>公開ブログ URL：</span>
        <a href="/blog" target="_blank" rel="noopener noreferrer"
          className="text-foreground font-medium hover:underline flex items-center gap-1">
          /blog <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* エディタ */}
      {editing !== null && (
        <ArticleEditor
          initial={editing === 'new' ? (prefill ? { ...EMPTY_FORM, ...prefill, id: 0, createdAt: '', updatedAt: '' } as any : null) : editing}
          onSave={(saved) => { setPosts(ps => { const idx = ps.findIndex(p => p.id === saved.id); return idx >= 0 ? ps.map(p => p.id === saved.id ? saved : p) : [saved, ...ps]; }); setEditing(null); setPrefill(null); }}
          onClose={() => { setEditing(null); setPrefill(null); }}
        />
      )}

      {/* AI生成ダイアログ */}
      {showGenerate && (
        <GenerateDialog
          onGenerated={(data) => {
            setShowGenerate(false);
            setPrefill(data);
            setEditing('new');
          }}
          onClose={() => setShowGenerate(false)}
        />
      )}
    </div>
  );
}
