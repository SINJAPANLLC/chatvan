import React, { useState, useEffect } from 'react';
import { Save, Globe, Loader2, Send, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

type SeoField = { label: string; key: string; type: 'input' | 'textarea'; placeholder: string };

const SEO_FIELDS: SeoField[] = [
  { label: 'サイトタイトル',        key: 'title',          type: 'input',    placeholder: 'Chat LOGI | チャットするだけで荷物が運べる' },
  { label: 'メタディスクリプション', key: 'description',    type: 'textarea', placeholder: 'チャットで依頼するだけ。あとはChat LOGIが配車・手配をすべて代行します。' },
  { label: 'メタキーワード',         key: 'keywords',       type: 'input',    placeholder: '物流, 配送, 物流代行, 配車, 運送' },
  { label: 'OGタイトル（SNS表示）', key: 'ogTitle',        type: 'input',    placeholder: 'Chat LOGI | チャットするだけで荷物が運べる' },
  { label: 'OG説明文（SNS表示）',   key: 'ogDescription',  type: 'textarea', placeholder: 'チャットで依頼するだけ。Chat LOGIが手配します。' },
  { label: 'OG画像URL',            key: 'ogImage',        type: 'input',    placeholder: 'https://example.com/og-image.png' },
  { label: 'Google Analyticsタグ', key: 'gaTag',          type: 'input',    placeholder: 'G-XXXXXXXXXX' },
  { label: 'Googleサーチコンソール確認コード', key: 'gscCode', type: 'input', placeholder: 'google-site-verification=...' },
  { label: 'robots.txt 内容',      key: 'robotsTxt',      type: 'textarea', placeholder: 'User-agent: *\nAllow: /' },
];

type PingResult = { engine: string; ok: boolean; status?: number; error?: string };

export default function AdminSeo() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResults, setPingResults] = useState<PingResult[] | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/seo')
      .then(d => { setValues(d ?? {}); })
      .catch(() => setValues({}))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/seo', { method: 'POST', body: JSON.stringify(values) });
      toast({ title: 'SEO設定を保存しました' });
    } catch {
      toast({ title: '保存に失敗しました', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSitemapPing = async () => {
    setPinging(true);
    setPingResults(null);
    try {
      const data = await apiFetch('/api/admin/seo/sitemap-ping', { method: 'POST' });
      setPingResults(data.results);
      const allOk = data.results.every((r: PingResult) => r.ok);
      toast({ title: allOk ? 'サイトマップを送信しました ✅' : '一部の送信に失敗しました', variant: allOk ? 'default' : 'destructive' });
    } catch {
      toast({ title: 'サイトマップ送信に失敗しました', variant: 'destructive' });
    } finally {
      setPinging(false);
    }
  };

  const set = (key: string, val: string) => setValues(prev => ({ ...prev, [key]: val }));

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SEO設定</h1>
          <p className="text-muted-foreground mt-1 text-sm">サイトのメタ情報・アナリティクス設定を管理します。</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-black text-white hover:bg-black/90">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />保存中…</> : <><Save className="h-4 w-4 mr-2" />保存</>}
        </Button>
      </div>

      <div className="space-y-6">
        {SEO_FIELDS.map(f => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm font-medium">{f.label}</Label>
            {f.type === 'input' ? (
              <Input value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
            ) : (
              <Textarea value={values[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} className="resize-none min-h-[80px]" />
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Globe className="h-4 w-4" />プレビュー（Googleでの表示イメージ）</h2>
        <div className="border border-border rounded-xl p-4 bg-muted/20 space-y-1">
          <p className="text-[#1a0dab] text-base font-medium truncate">{values.title || 'Chat LOGI | AI物流マッチング'}</p>
          <p className="text-[#006621] text-xs">https://chatlogi.jp</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{values.description || 'メタディスクリプションを入力してください。'}</p>
        </div>
      </div>

      {/* サイトマップ送信 */}
      <div className="border border-border rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Send className="h-4 w-4" />サイトマップ送信</h2>
          <p className="text-xs text-muted-foreground mt-1">Google・Bing にサイトマップのURLを通知し、クロールを促進します。</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleSitemapPing} disabled={pinging} variant="outline" className="font-medium">
            {pinging ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />送信中…</> : <><Send className="h-4 w-4 mr-2" />Google・Bingに送信</>}
          </Button>
          <a href="https://chatlogi.jp/sitemap.xml" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" />sitemap.xml を確認
          </a>
          <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3 w-3" />Search Console を開く
          </a>
        </div>

        {pingResults && (
          <div className="space-y-2">
            {pingResults.map(r => (
              <div key={r.engine} className="flex items-center gap-2 text-sm">
                {r.ok
                  ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                <span className="font-medium w-16">{r.engine}</span>
                <span className="text-muted-foreground">
                  {r.ok ? `送信成功（HTTP ${r.status}）` : `失敗: ${r.error ?? `HTTP ${r.status}`}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving} className="bg-black text-white hover:bg-black/90">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />保存中…</> : <><Save className="h-4 w-4 mr-2" />保存する</>}
      </Button>
    </div>
  );
}
