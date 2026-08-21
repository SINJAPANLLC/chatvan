import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, Users, Plus, Trash2, Loader2, Upload,
  List, History, ChevronDown, Check, Eye, X, Bot, RefreshCw, Clock, AlertCircle,
  Building2, Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type ProspectType = 'user' | 'rental_company';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

// ── HTML preview ──────────────────────────────────────────────────────────────
function buildPreviewHtml(subject: string, bodyText: string, ctaText: string, mode: ProspectType) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const stripped = bodyText.replace(/^[\s\S]*?\n\n/, '');
  const body = esc(stripped)
    .replace(/\{会社名\}/g, '<span style="background:#fffbe6;padding:0 2px">○○株式会社</span>')
    .replace(/\{担当者名\}/g, '<span style="background:#fffbe6;padding:0 2px">田中様</span>');
  const headline = esc(subject.replace(/【Chat VAN】\s*/g, ''));
  const year = new Date().getFullYear();

  const featureRow = mode === 'rental_company'
    ? `<tr>
        <td width="33%" style="padding-right:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">安定した収益</p><p style="margin:0;font-size:11px;color:#666">月額固定での契約。</p></td>
        <td width="33%" style="padding:0 4px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">手間なし運営</p><p style="margin:0;font-size:11px;color:#666">Chat VANが顧客対応。</p></td>
        <td width="33%" style="padding-left:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">稼働率アップ</p><p style="margin:0;font-size:11px;color:#666">遊休車両を有効活用。</p></td>
      </tr>`
    : `<tr>
        <td width="33%" style="padding-right:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">チャットで相談</p><p style="margin:0;font-size:11px;color:#666">条件を入力するだけ。</p></td>
        <td width="33%" style="padding:0 4px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">最適な軽バンを提案</p><p style="margin:0;font-size:11px;color:#666">Chat VANが厳選します。</p></td>
        <td width="33%" style="padding-left:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">そのまま契約</p><p style="margin:0;font-size:11px;color:#666">最短で翌日から利用可能。</p></td>
      </tr>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif}@media(max-width:600px){.wrap{padding:16px 8px!important}.inner{width:100%!important}.cell{padding:20px 18px!important}.feat td{display:block!important;width:100%!important;padding:0 0 12px!important}}</style></head><body>
<table width="100%" cellpadding="0" cellspacing="0" class="wrap" style="background:#f0f0f0;padding:24px 12px"><tr><td align="center">
<table class="inner" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td class="cell" style="background:#000;padding:20px 24px;border-radius:12px 12px 0 0">
  <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:1px">Chat VAN</span>
</td></tr>
<tr><td class="cell" style="background:#111;padding:24px 24px 18px">
  <p style="margin:0;font-size:18px;font-weight:800;color:#fff;line-height:1.4">${headline}</p>
</td></tr>
<tr><td class="cell" style="background:#fff;padding:24px 24px 20px">
  <p style="margin:0 0 14px;font-size:13px;color:#333;font-weight:500">○○株式会社 ご担当者様</p>
  <div style="font-size:13px;color:#333;line-height:1.9">${body}</div>
</td></tr>
<tr><td class="cell" style="background:#f7f7f7;padding:16px 24px;border-top:1px solid #eee;border-bottom:1px solid #eee">
  <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#999;letter-spacing:1px">Chat VAN の特長</p>
  <table class="feat" width="100%" cellpadding="0" cellspacing="0">${featureRow}</table>
</td></tr>
<tr><td class="cell" style="background:#fff;padding:22px 24px;text-align:center">
  <div style="display:inline-block;background:#000;border-radius:8px;padding:13px 32px">
    <span style="color:#fff;font-size:13px;font-weight:700">${ctaText || 'Chat VANを無料で試す →'}</span>
  </div>
</td></tr>
<tr><td class="cell" style="background:#f7f7f7;padding:14px 24px;border-radius:0 0 12px 12px;border-top:1px solid #ebebeb">
  <p style="margin:0 0 4px;font-size:10px;color:#bbb">このメールは Chat VAN 営業チームより送信しています。</p>
  <p style="margin:0;font-size:10px;color:#bbb">配信停止をご希望の場合はこのメールに返信ください。© ${year} Chat VAN</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

// ── テンプレート ──────────────────────────────────────────────────────────────
const USER_TEMPLATES = [
  {
    label: '新規ご挨拶',
    subject: '【Chat VAN】はじめまして',
    body: 'はじめまして。「Chat VAN」と申します。\n\nChat VANは、チャットで希望条件をお伝えいただくだけで、最適な軽バンをご提案するレンタルサービスです。\n\n・月額定額で軽バンを利用できる\n・最短1ヶ月から契約可能\n・ETCやドラレコ付き車両も選べる\n\nぜひ一度、詳細をご説明する機会をいただけますと幸いです。\n\nよろしくお願いいたします。',
  },
  {
    label: 'サービス案内',
    subject: '【Chat VAN】軽バンレンタルのご提案',
    body: 'お世話になっております。Chat VANでございます。\n\nチャットで条件を伝えるだけで、最適な軽バンをご提案するサービスです。\n\n・月額定額・最短1ヶ月から\n・エリア・予算・用途に合わせて提案\n・保険・車検込みでコスト管理が簡単\n\nまずはお気軽にご相談ください。',
  },
  {
    label: 'フォローアップ',
    subject: '【Chat VAN】その後いかがでしょうか',
    body: 'いつもお世話になっております。Chat VANでございます。\n\n先日はお時間をいただきありがとうございました。\nその後、軽バンのご利用についてご検討はいかがでしょうか。\n\nご不明な点やご質問があれば、どうぞお気軽にご連絡ください。\n引き続きよろしくお願いいたします。',
  },
  { label: 'カスタム', subject: '', body: '' },
];

const RENTAL_TEMPLATES = [
  {
    label: '新規ご挨拶',
    subject: '【Chat VAN】車両提供のご相談',
    body: 'はじめまして。軽バンのサブスク・レンタルサービス「Chat VAN」と申します。\n\n現在、車両を提供いただけるレンタル会社・リース会社様を探しております。\n\n【Chat VANとは】\nChat VANは、軽バンを法人・個人事業主様にサブスクリプション形式でご提供するサービスです。\n\n【車両提供のメリット】\n・遊休車両の有効活用・稼働率アップ\n・Chat VANが顧客の獲得・対応を担当\n・月額固定でのお支払い（安定収益）\n・車両管理の手間を最小化\n\nご興味をお持ちいただけましたら、ぜひ一度詳細をご説明させてください。\n\nよろしくお願いいたします。',
  },
  {
    label: 'パートナー案内',
    subject: '【Chat VAN】協力会社様募集のご案内',
    body: 'お世話になっております。Chat VANでございます。\n\n弊サービスでは、軽バンを保有・管理されているレンタル会社様と協力体制を構築し、車両の共同活用を推進しております。\n\n【ご提案内容】\n・保有車両をChat VANに提供いただき、定額で買い取り\n・顧客対応・保険手続きはChat VAN側が担当\n・月末締め翌月末払いで安定した入金\n\nまずはオンラインでのご説明の機会をいただけますと幸いです。',
  },
  {
    label: 'フォローアップ',
    subject: '【Chat VAN】先日のご連絡の件',
    body: 'いつもお世話になっております。Chat VANでございます。\n\n先日は車両提供のご相談をお送りしましたが、いかがでしょうか。\n\nご質問やご不明な点がございましたら、どうぞお気軽にご返信ください。\n\n引き続きよろしくお願いいたします。',
  },
  { label: 'カスタム', subject: '', body: '' },
];

type Prospect = {
  id: number; companyName: string; contactName?: string; email: string;
  phone?: string; industry?: string; prefecture?: string; status: string;
  sentAt?: string; createdAt: string; prospectType?: string;
};

type EmailHistory = {
  id: number; prospectId?: number; email: string; companyName?: string;
  subject: string; sent: boolean; reason?: string; sentAt: string;
};

// ── 自動クロールパネル ─────────────────────────────────────────────────────────
function AutoCrawlPanel({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{ ranAt: string; industry: string; prefecture: string; found: number; sent: number; errors: string[] } | null>(null);

  const loadStatus = async () => {
    try { setStatus(await apiFetch('/api/admin/prospects/auto-crawl/status')); } catch { }
  };
  useEffect(() => { loadStatus(); }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      await apiFetch('/api/admin/prospects/auto-crawl', { method: 'POST' });
      toast({ title: '自動クロールを開始しました。数分後にリロードしてください。' });
      setTimeout(() => { loadStatus(); onRefresh(); setRunning(false); }, 30_000);
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); setRunning(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-muted/30 to-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold">毎日自動クロール</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">毎朝9:00 JST</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleRun} disabled={running} className="gap-1.5 text-xs">
          {running ? <><Loader2 className="h-3 w-3 animate-spin" />実行中…</> : <><RefreshCw className="h-3 w-3" />今すぐ実行</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        DuckDuckGo で荷主企業を検索 → AI が品質評価 → 5件を自動登録 → 未送信5件にAI個別メールを自動送信
      </p>
      {status ? (
        <div className="bg-card rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            前回: {new Date(status.ranAt).toLocaleString('ja-JP')}　対象: {status.industry} / {status.prefecture}
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-green-700 font-semibold">登録 {status.found}件</span>
            <span className="text-blue-700 font-semibold">送信 {status.sent}件</span>
            {status.errors.length > 0 && <span className="text-amber-600 font-semibold">エラー {status.errors.length}件</span>}
          </div>
          {status.errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="flex items-center gap-1 cursor-pointer"><AlertCircle className="h-3 w-3 text-amber-500" />エラー詳細</summary>
              <ul className="mt-1 space-y-0.5 pl-4">{status.errors.slice(0, 5).map((e, i) => <li key={i}>・{e}</li>)}</ul>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">まだ実行されていません</p>
      )}
    </div>
  );
}

// ── リスト管理タブ ─────────────────────────────────────────────────────────────
function ProspectList({ mode, onSelectForSend }: { mode: ProspectType; onSelectForSend: (ids: number[]) => void }) {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ companyName: '', contactName: '', email: '', phone: '', industry: '', prefecture: '' });
  const [adding, setAdding] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try { setProspects(await apiFetch(`/api/admin/prospects?type=${mode}`)); }
    catch { toast({ title: 'リストの取得に失敗しました', variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); setSelected([]); }, [mode]);

  const sendableProspects = prospects.filter(p => p.status === 'unsent');
  const toggleAll = () => setSelected(selected.length === sendableProspects.length ? [] : sendableProspects.map(p => p.id));
  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleApprove = async (id: number) => {
    try {
      await apiFetch(`/api/admin/prospects/${id}/approve`, { method: 'PATCH' });
      toast({ title: '確認済みにしました。送信対象に追加されています。' });
      load();
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
  };

  const handleResolveSending = async (id: number, outcome: 'sent' | 'retry') => {
    const message = outcome === 'sent'
      ? 'このメールが送信済みであることを確認しましたか？'
      : 'メールが未送信であることを確認しましたか？ 再送対象に戻すと、次回送信時にメールが送られます。';
    if (!confirm(message)) return;
    try {
      await apiFetch(`/api/admin/prospects/${id}/resolve-sending`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome }),
      });
      toast({ title: outcome === 'sent' ? '送信済みに確定しました' : '再送対象に戻しました' });
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const handleAdd = async () => {
    if (!addForm.companyName || !addForm.email) { toast({ title: '会社名とメールアドレスは必須です', variant: 'destructive' }); return; }
    setAdding(true);
    try {
      await apiFetch('/api/admin/prospects', { method: 'POST', body: JSON.stringify({ ...addForm, prospectType: mode }) });
      toast({ title: '追加しました' });
      setShowAddDialog(false); setAddForm({ companyName: '', contactName: '', email: '', phone: '', industry: '', prefecture: '' });
      load();
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setAdding(false); }
  };

  const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const idx = (n: string) => headers.findIndex(h => h === n || h.toLowerCase() === n.toLowerCase());
      const ci = { companyName: idx('会社名') !== -1 ? idx('会社名') : idx('companyName'), email: idx('メール') !== -1 ? idx('メール') : idx('email'), contactName: idx('担当者名') !== -1 ? idx('担当者名') : idx('contactName'), phone: idx('電話') !== -1 ? idx('電話') : idx('phone'), industry: idx('業種') !== -1 ? idx('業種') : idx('industry'), prefecture: idx('都道府県') !== -1 ? idx('都道府県') : idx('prefecture') };
      const rows = lines.slice(1).map(l => {
        const cols = l.split(',').map(c => c.trim().replace(/"/g, ''));
        return { companyName: cols[ci.companyName] ?? '', email: cols[ci.email] ?? '', contactName: cols[ci.contactName] ?? '', phone: cols[ci.phone] ?? '', industry: cols[ci.industry] ?? '', prefecture: cols[ci.prefecture] ?? '' };
      }).filter(r => r.companyName && r.email);
      if (rows.length === 0) { toast({ title: 'CSVに有効なデータがありません', variant: 'destructive' }); return; }
      try {
        const r = await apiFetch('/api/admin/prospects/import', { method: 'POST', body: JSON.stringify({ rows, prospectType: mode }) });
        toast({ title: `${r.inserted}件インポートしました` }); load();
      } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;
    try {
      await apiFetch('/api/admin/prospects', { method: 'DELETE', body: JSON.stringify({ ids: selected }) });
      toast({ title: `${selected.length}件削除しました` }); setSelected([]); load();
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
  };

  const total = prospects.length, unsent = sendableProspects.length, sent = prospects.filter(p => p.status === 'sent').length, needsReview = prospects.filter(p => p.status === 'needs_review').length;

  return (
    <div className="space-y-4">
      {mode === 'user' && <AutoCrawlPanel onRefresh={load} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['総数', total, ''], ['要確認', needsReview, 'text-violet-600'], ['未送信', unsent, 'text-amber-600'], ['送信済', sent, 'text-green-600']].map(([label, val, cls]) => (
          <div key={label as string} className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{val}</p>
          </div>
        ))}
      </div>
      {needsReview > 0 && (
        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
          「要確認」はAI生成の架空データです。実在する連絡先であることを確認してからクリックし、送信対象に追加してください。
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={() => setShowAddDialog(true)} className="bg-black text-white hover:bg-black/90 gap-1.5">
          <Plus className="h-4 w-4" />手動追加
        </Button>
        <Button variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5">
          <Upload className="h-4 w-4" />CSV取込
        </Button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsv} />
        {selected.length > 0 && (
          <>
            <div className="flex-1" />
            <Button variant="outline" className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => onSelectForSend(selected)}>
              <Send className="h-4 w-4" />{selected.length}件に送信
            </Button>
            <Button variant="outline" className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4" />{selected.length}件削除
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : prospects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm border border-dashed rounded-xl">
          <p>手動追加またはCSV取込でリストを作成してください</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={sendableProspects.length > 0 && selected.length === sendableProspects.length} onChange={toggleAll} disabled={sendableProspects.length === 0} className="accent-foreground" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">会社名</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">担当者</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">メールアドレス</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{mode === 'user' ? '業種' : 'エリア'}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">都道府県</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {prospects.map(p => (
                <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${selected.includes(p.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} disabled={p.status !== 'unsent'} className="accent-foreground disabled:opacity-30" />
                  </td>
                  <td className="px-4 py-3 font-medium max-w-[200px]">
                    <div className="flex items-center gap-1.5 truncate">
                      {(p as any).notes?.startsWith('[自動取得]') && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                          <Bot className="h-2.5 w-2.5" />AI
                        </span>
                      )}
                      <span className="truncate">{p.companyName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{p.email}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.industry ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.prefecture ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {p.status === 'sent'
                      ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><Check className="h-3 w-3" />送信済</span>
                      : p.status === 'needs_review'
                        ? <button onClick={() => handleApprove(p.id)} className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full hover:bg-violet-100">
                            <AlertCircle className="h-3 w-3" />要確認
                          </button>
                        : p.status === 'sending'
                          ? <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"><Loader2 className="h-3 w-3 animate-spin" />送信確認中</span>
                              <span className="flex gap-1">
                                <button onClick={() => handleResolveSending(p.id, 'sent')} className="text-[10px] text-blue-700 hover:underline">送信済みに確定</button>
                                <button onClick={() => handleResolveSending(p.id, 'retry')} className="text-[10px] text-amber-700 hover:underline">再送対象へ戻す</button>
                              </span>
                            </div>
                        : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">未送信</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2"><Plus className="h-5 w-5" />手動追加</h2>
              <button onClick={() => setShowAddDialog(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>会社名 *</Label><Input value={addForm.companyName} onChange={e => setAddForm(f => ({...f, companyName: e.target.value}))} /></div>
              <div className="space-y-1"><Label>担当者名</Label><Input value={addForm.contactName} onChange={e => setAddForm(f => ({...f, contactName: e.target.value}))} /></div>
              <div className="space-y-1"><Label>電話番号</Label><Input value={addForm.phone} onChange={e => setAddForm(f => ({...f, phone: e.target.value}))} /></div>
              <div className="col-span-2 space-y-1"><Label>メールアドレス *</Label><Input value={addForm.email} onChange={e => setAddForm(f => ({...f, email: e.target.value}))} /></div>
              <div className="space-y-1"><Label>{mode === 'user' ? '業種' : 'エリア・特徴'}</Label><Input value={addForm.industry} onChange={e => setAddForm(f => ({...f, industry: e.target.value}))} /></div>
              <div className="space-y-1"><Label>都道府県</Label><Input value={addForm.prefecture} onChange={e => setAddForm(f => ({...f, prefecture: e.target.value}))} /></div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>キャンセル</Button>
              <Button onClick={handleAdd} disabled={adding} className="bg-black text-white hover:bg-black/90">
                {adding ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />追加中…</> : '追加する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 送信タブ ──────────────────────────────────────────────────────────────────
function SendTab({ mode, preselectedIds, prospects, onSent }: {
  mode: ProspectType; preselectedIds: number[]; prospects: Prospect[]; onSent: () => void;
}) {
  const { toast } = useToast();
  const templates = mode === 'user' ? USER_TEMPLATES : RENTAL_TEMPLATES;
  const defaultCta = mode === 'user' ? 'Chat VANを無料で試す →' : 'Chat VAN 車両提供の詳細を見る →';
  const [tplIdx, setTplIdx] = useState(0);
  const [subject, setSubject] = useState(templates[0].subject);
  const [body, setBody] = useState(templates[0].body);
  const [ctaText, setCtaText] = useState(defaultCta);
  const [targetMode, setTargetMode] = useState<'selected' | 'unsent'>('selected');
  const [sending, setSending] = useState(false);

  const applyTemplate = (idx: number) => { setTplIdx(idx); setSubject(templates[idx].subject); setBody(templates[idx].body); };

  // modeが変わったらテンプレートをリセット
  useEffect(() => { setTplIdx(0); setSubject(templates[0].subject); setBody(templates[0].body); setCtaText(defaultCta); }, [mode]);

  const targetIds = targetMode === 'selected'
    ? preselectedIds
    : prospects.filter(p => p.status === 'unsent').map(p => p.id);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { toast({ title: '件名と本文を入力してください', variant: 'destructive' }); return; }
    if (targetIds.length === 0) { toast({ title: '送信先がありません', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const r = await apiFetch('/api/admin/prospects/send', { method: 'POST', body: JSON.stringify({ ids: targetIds, subject, bodyText: body, ctaText, prospectType: mode }) });
      toast({ title: r.message }); onSent();
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setSending(false); }
  };

  const previewHtml = buildPreviewHtml(subject || '件名を入力してください', body || '本文を入力してください', ctaText, mode);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-semibold">テンプレート</Label>
        <div className="flex flex-wrap gap-2">
          {templates.map((t, i) => (
            <button key={i} onClick={() => applyTemplate(i)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${tplIdx === i ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">送信対象</Label>
        <div className="flex gap-2">
          <button onClick={() => setTargetMode('selected')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${targetMode === 'selected' ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
            <Users className="h-3.5 w-3.5" />選択した{preselectedIds.length}件
          </button>
          <button onClick={() => setTargetMode('unsent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${targetMode === 'unsent' ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
            <Mail className="h-3.5 w-3.5" />未送信全件（{prospects.filter(p => p.status === 'unsent').length}件）
          </button>
        </div>
        <p className="text-xs text-muted-foreground">送信対象: {targetIds.length}件</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>件名</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="メールの件名" />
          </div>
          <div className="space-y-1.5">
            <Label>本文 <span className="text-muted-foreground text-xs font-normal">（{'{会社名}'} {'{担当者名}'} が自動置換されます）</span></Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} className="min-h-[220px] resize-none font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>CTAボタンテキスト</Label>
            <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder={defaultCta} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-semibold">HTMLメールプレビュー</Label>
          </div>
          <div className="border border-border rounded-xl overflow-hidden shadow-sm" style={{ height: 440 }}>
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full"
              style={{ border: 'none', transform: 'scale(0.78)', transformOrigin: 'top left', width: '128%', height: '128%' }}
              title="メールプレビュー"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleSend} disabled={sending || targetIds.length === 0} className="bg-black text-white hover:bg-black/90 gap-2">
        {sending ? <><Loader2 className="h-4 w-4 animate-spin" />送信中…</> : <><Send className="h-4 w-4" />{targetIds.length}件に送信する</>}
      </Button>
    </div>
  );
}

// ── 送信履歴タブ ──────────────────────────────────────────────────────────────
function HistoryTab({ mode }: { mode: ProspectType }) {
  const { toast } = useToast();
  const [history, setHistory] = useState<EmailHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/admin/prospects/send-history?type=${mode}`)
      .then(setHistory)
      .catch(() => toast({ title: '送信履歴の取得に失敗しました', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [mode, toast]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (history.length === 0) return (
    <div className="text-center py-16 text-muted-foreground text-sm border border-dashed rounded-xl">
      <History className="h-8 w-8 mx-auto mb-3 opacity-30" />
      <p>送信履歴はありません</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border overflow-x-auto shadow-sm">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">会社名</th>
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">メールアドレス</th>
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">件名</th>
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">結果</th>
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信日時</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {history.map(item => (
            <tr key={item.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-5 py-3 font-medium">{item.companyName ?? '—'}</td>
              <td className="px-5 py-3 text-xs text-muted-foreground">{item.email}</td>
              <td className="px-5 py-3 text-xs text-muted-foreground max-w-[240px] truncate">{item.subject}</td>
              <td className="px-5 py-3 text-xs">
                {item.sent
                  ? <span className="text-green-700">送信済み</span>
                  : <span className="text-amber-700">{item.reason ?? '送信確認中'}</span>}
              </td>
              <td className="px-5 py-3 text-xs text-muted-foreground">
                {format(new Date(item.sentAt), 'yyyy/MM/dd HH:mm')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── メインページ ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'list',    label: 'リスト管理', icon: List },
  { key: 'send',    label: 'メール送信', icon: Send },
  { key: 'history', label: '送信履歴',  icon: History },
];

const MODES: { key: ProspectType; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'user',           label: 'ユーザー営業',       icon: Building2, desc: '軽バンを利用したい法人・個人事業主向け' },
  { key: 'rental_company', label: 'レンタル会社営業',   icon: Truck,     desc: '車両を提供いただけるレンタル会社向け' },
];

export default function EmailMarketing() {
  const [mode, setMode] = useState<ProspectType>('user');
  const [tab, setTab] = useState('list');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sendTargetIds, setSendTargetIds] = useState<number[]>([]);

  const loadProspects = async () => {
    const token = localStorage.getItem('sinjapan_auth_token');
    const rows = await fetch(`/api/admin/prospects?type=${mode}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => r.ok ? r.json() : []).catch(() => []);
    setProspects(rows);
  };
  useEffect(() => { loadProspects(); setSendTargetIds([]); }, [mode]);

  const handleSelectForSend = (ids: number[]) => { setSendTargetIds(ids); setTab('send'); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">メール営業</h1>
        <p className="text-muted-foreground mt-1 text-sm">AIで見込みリストを自動生成し、HTMLメールで一括送信します。</p>
      </div>

      {/* モード切替 */}
      <div className="flex gap-3">
        {MODES.map(m => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button key={m.key} onClick={() => { setMode(m.key); setTab('list'); }}
              className={`flex-1 flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/30'
              }`}>
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${active ? 'text-background' : 'text-muted-foreground'}`} />
              <div>
                <p className={`text-sm font-semibold ${active ? 'text-background' : 'text-foreground'}`}>{m.label}</p>
                <p className={`text-xs mt-0.5 ${active ? 'text-background/70' : 'text-muted-foreground'}`}>{m.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'list'    && <ProspectList mode={mode} onSelectForSend={handleSelectForSend} />}
      {tab === 'send'    && <SendTab mode={mode} preselectedIds={sendTargetIds} prospects={prospects} onSent={() => { loadProspects(); setTab('history'); }} />}
      {tab === 'history' && <HistoryTab mode={mode} />}
    </div>
  );
}
