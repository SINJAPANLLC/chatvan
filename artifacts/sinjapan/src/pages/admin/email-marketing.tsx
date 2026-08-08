import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Send, Users, Plus, Trash2, Loader2, Upload,
  List, History, ChevronDown, Check, Eye, X, Bot, RefreshCw, Clock, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ── API helper ───────────────────────────────────────────────────────────────
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

// ── HTML preview builder (ブラウザ側プレビュー用) ─────────────────────────────
function buildPreviewHtml(subject: string, bodyText: string, ctaText: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  // 冒頭の宛名行（{会社名} {担当者名}）は挨拶と重複するので除去
  const stripped = bodyText.replace(/^[\s\S]*?\n\n/, '');
  const body = esc(stripped).replace(/\{会社名\}/g, '<span style="background:#fffbe6;padding:0 2px">○○株式会社</span>').replace(/\{担当者名\}/g, '<span style="background:#fffbe6;padding:0 2px">田中様</span>');
  const headline = esc(subject.replace(/【Chat LOGI】\s*/g, ''));
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif}@media(max-width:600px){.wrap{padding:16px 8px!important}.inner{width:100%!important}.cell{padding:20px 18px!important}.feat td{display:block!important;width:100%!important;padding:0 0 12px!important}}</style></head><body>
<table width="100%" cellpadding="0" cellspacing="0" class="wrap" style="background:#f0f0f0;padding:24px 12px"><tr><td align="center">
<table class="inner" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td class="cell" style="background:#000;padding:20px 24px;border-radius:12px 12px 0 0">
  <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:1px">Chat LOGI</span>
</td></tr>
<tr><td class="cell" style="background:#111;padding:24px 24px 18px">
  <p style="margin:0;font-size:18px;font-weight:800;color:#fff;line-height:1.4">${headline}</p>
</td></tr>
<tr><td class="cell" style="background:#fff;padding:24px 24px 20px">
  <p style="margin:0 0 14px;font-size:13px;color:#333;font-weight:500">○○株式会社 ご担当者様</p>
  <div style="font-size:13px;color:#333;line-height:1.9">${body}</div>
</td></tr>
<tr><td class="cell" style="background:#f7f7f7;padding:16px 24px;border-top:1px solid #eee;border-bottom:1px solid #eee">
  <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#999;letter-spacing:1px">Chat LOGI の特長</p>
  <table class="feat" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="33%" style="padding-right:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">チャットで依頼</p><p style="margin:0;font-size:11px;color:#666">入力するだけ。最短即日手配。</p></td>
      <td width="33%" style="padding:0 4px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">プロが手配</p><p style="margin:0;font-size:11px;color:#666">Chat LOGIが手配します。</p></td>
      <td width="33%" style="padding-left:8px;vertical-align:top"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">状況を確認</p><p style="margin:0;font-size:11px;color:#666">配送状況を24時間確認可能。</p></td>
    </tr>
  </table>
</td></tr>
<tr><td class="cell" style="background:#fff;padding:22px 24px;text-align:center">
  <div style="display:inline-block;background:#000;border-radius:8px;padding:13px 32px">
    <span style="color:#fff;font-size:13px;font-weight:700">${ctaText || 'Chat LOGIを無料で試す →'}</span>
  </div>
</td></tr>
<tr><td class="cell" style="background:#f7f7f7;padding:14px 24px;border-radius:0 0 12px 12px;border-top:1px solid #ebebeb">
  <p style="margin:0 0 4px;font-size:10px;color:#bbb">このメールは Chat LOGI 営業チームより送信しています。</p>
  <p style="margin:0;font-size:10px;color:#bbb">配信停止をご希望の場合はこのメールに返信ください。© ${year} Chat LOGI</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

// ── テンプレート ──────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    label: '新規ご挨拶',
    subject: '【Chat LOGI】はじめまして',
    body: 'はじめまして。「Chat LOGI」と申します。\n\nChat LOGIはチャットで依頼するだけで、配車・手配をすべて代行するサービスです。\n貴社の物流業務をよりシンプルにできると考え、ご連絡いたしました。\n\nぜひ一度、詳細をご説明する機会をいただけますと幸いです。\n\nよろしくお願いいたします。',
  },
  {
    label: 'サービス案内',
    subject: '【Chat LOGI】物流コスト削減のご提案',
    body: 'お世話になっております。Chat LOGIでございます。\n\nチャットで依頼するだけで、配車・手配をすべて代行するサービスです。\n\n・チャットで即日見積もり\n・複数の運送会社から最適提案\n・ペーパーレスで書類管理もラクラク\n\n無料でお試しいただけますので、お気軽にご連絡ください。',
  },
  {
    label: 'フォローアップ',
    subject: '【Chat LOGI】その後いかがでしょうか',
    body: 'いつもお世話になっております。Chat LOGIでございます。\n\n先日はお時間をいただきありがとうございました。\nその後、弊社サービスのご検討はいかがでしょうか。\n\nご不明な点やご質問があれば、どうぞお気軽にご連絡ください。\n引き続きよろしくお願いいたします。',
  },
  { label: 'カスタム', subject: '', body: '' },
];

type Prospect = {
  id: number; companyName: string; contactName?: string; email: string;
  phone?: string; industry?: string; prefecture?: string; status: string;
  sentAt?: string; createdAt: string;
};

// ── 自動クロール ステータス表示 ───────────────────────────────────────────────
function AutoCrawlPanel({ onRefresh }: { onRefresh: () => void }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{
    ranAt: string; industry: string; prefecture: string;
    found: number; sent: number; errors: string[];
  } | null>(null);

  const loadStatus = async () => {
    try {
      const s = await apiFetch('/api/admin/prospects/auto-crawl/status');
      setStatus(s);
    } catch { /* ignore */ }
  };
  useEffect(() => { loadStatus(); }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      await apiFetch('/api/admin/prospects/auto-crawl', { method: 'POST' });
      toast({ title: '自動クロールを開始しました。数分後にリロードしてください。' });
      // 30秒後にステータスと一覧を更新
      setTimeout(() => { loadStatus(); onRefresh(); setRunning(false); }, 30_000);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-muted/30 to-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-foreground" />
          <span className="text-sm font-semibold">毎日自動クロール</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">毎朝9:00 JST</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRun}
          disabled={running}
          className="gap-1.5 text-xs"
        >
          {running
            ? <><Loader2 className="h-3 w-3 animate-spin" />実行中…</>
            : <><RefreshCw className="h-3 w-3" />今すぐ実行</>}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        DuckDuckGo で荷主企業を検索 → AI が品質評価 → 5件を自動登録 → 未送信5件にAI個別メールを自動送信
      </p>

      {status ? (
        <div className="bg-card rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            前回: {new Date(status.ranAt).toLocaleString('ja-JP')}
            　対象: {status.industry} / {status.prefecture}
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-green-700 font-semibold">登録 {status.found}件</span>
            <span className="text-blue-700 font-semibold">送信 {status.sent}件</span>
            {status.errors.length > 0 && (
              <span className="text-amber-600 font-semibold">エラー {status.errors.length}件</span>
            )}
          </div>
          {status.errors.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="flex items-center gap-1 cursor-pointer">
                <AlertCircle className="h-3 w-3 text-amber-500" />エラー詳細
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4">
                {status.errors.slice(0, 5).map((e, i) => <li key={i}>・{e}</li>)}
              </ul>
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
function ProspectList({ onSelectForSend }: { onSelectForSend: (ids: number[]) => void }) {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);

  // 手動追加ダイアログ
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ companyName: '', contactName: '', email: '', phone: '', industry: '', prefecture: '' });
  const [adding, setAdding] = useState(false);

  // CSV
  const csvRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiFetch('/api/admin/prospects');
      setProspects(rows);
    } catch { toast({ title: 'リストの取得に失敗しました', variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleAll = () => {
    setSelected(selected.length === prospects.length ? [] : prospects.map(p => p.id));
  };
  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);


  const handleAdd = async () => {
    if (!addForm.companyName || !addForm.email) { toast({ title: '会社名とメールアドレスは必須です', variant: 'destructive' }); return; }
    setAdding(true);
    try {
      await apiFetch('/api/admin/prospects', { method: 'POST', body: JSON.stringify(addForm) });
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
        const r = await apiFetch('/api/admin/prospects/import', { method: 'POST', body: JSON.stringify({ rows }) });
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

  const unsentSelected = selected.filter(id => prospects.find(p => p.id === id)?.status === 'unsent');
  const total = prospects.length, unsent = prospects.filter(p => p.status === 'unsent').length, sent = prospects.filter(p => p.status === 'sent').length;

  return (
    <div className="space-y-4">
      {/* 自動クロールパネル */}
      <AutoCrawlPanel onRefresh={load} />

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3">
        {[['総数', total, ''], ['未送信', unsent, 'text-amber-600'], ['送信済', sent, 'text-green-600']].map(([label, val, cls]) => (
          <div key={label as string} className="rounded-xl border border-border bg-card px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{val}</p>
          </div>
        ))}
      </div>

      {/* ツールバー */}
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
              onClick={() => { onSelectForSend(selected); }}>
              <Send className="h-4 w-4" />{selected.length}件に送信
            </Button>
            <Button variant="outline" className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4" />{selected.length}件削除
            </Button>
          </>
        )}
      </div>

      {/* テーブル */}
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
                  <input type="checkbox" checked={selected.length === prospects.length} onChange={toggleAll} className="accent-foreground" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">会社名</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">担当者</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">メールアドレス</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">業種</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">都道府県</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">ステータス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {prospects.map(p => (
                <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${selected.includes(p.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} className="accent-foreground" />
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
                      : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">未送信</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 手動追加ダイアログ */}
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
              <div className="space-y-1"><Label>業種</Label><Input value={addForm.industry} onChange={e => setAddForm(f => ({...f, industry: e.target.value}))} /></div>
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

// ── 営業メール送信タブ ─────────────────────────────────────────────────────────
function SendTab({ preselectedIds, prospects, onSent }: {
  preselectedIds: number[];
  prospects: Prospect[];
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [tplIdx, setTplIdx] = useState(0);
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [ctaText, setCtaText] = useState('Chat LOGIを無料で試す →');
  const [targetMode, setTargetMode] = useState<'selected' | 'unsent'>('selected');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const applyTemplate = (idx: number) => {
    setTplIdx(idx);
    setSubject(TEMPLATES[idx].subject);
    setBody(TEMPLATES[idx].body);
  };

  const targetIds = targetMode === 'selected'
    ? preselectedIds
    : prospects.filter(p => p.status === 'unsent').map(p => p.id);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { toast({ title: '件名と本文を入力してください', variant: 'destructive' }); return; }
    if (targetIds.length === 0) { toast({ title: '送信先がありません', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const r = await apiFetch('/api/admin/prospects/send', {
        method: 'POST',
        body: JSON.stringify({ ids: targetIds, subject, bodyText: body, ctaText }),
      });
      toast({ title: r.message });
      onSent();
    } catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
    finally { setSending(false); }
  };

  const previewHtml = buildPreviewHtml(subject || '件名を入力してください', body || '本文を入力してください', ctaText);

  return (
    <div className="space-y-6">
      {/* テンプレート選択 */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">テンプレート</Label>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => applyTemplate(i)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${tplIdx === i ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 送信先 */}
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

      {/* 件名・本文・CTA */}
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
            <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Chat LOGIを無料で試す →" />
          </div>
        </div>

        {/* プレビュー */}
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
function HistoryTab({ prospects }: { prospects: Prospect[] }) {
  const sent = prospects.filter(p => p.status === 'sent').sort((a, b) =>
    (b.sentAt ?? b.createdAt) > (a.sentAt ?? a.createdAt) ? 1 : -1
  );
  if (sent.length === 0) return (
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
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">業種</th>
            <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信日時</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {sent.map(p => (
            <tr key={p.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-5 py-3 font-medium">{p.companyName}</td>
              <td className="px-5 py-3 text-xs text-muted-foreground">{p.email}</td>
              <td className="px-5 py-3 text-xs text-muted-foreground">{p.industry ?? '—'}</td>
              <td className="px-5 py-3 text-xs text-muted-foreground">
                {p.sentAt ? format(new Date(p.sentAt), 'yyyy/MM/dd HH:mm') : '—'}
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

export default function EmailMarketing() {
  const [tab, setTab] = useState('list');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sendTargetIds, setSendTargetIds] = useState<number[]>([]);

  const loadProspects = async () => {
    const token = localStorage.getItem('sinjapan_auth_token');
    const rows = await fetch('/api/admin/prospects', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => r.ok ? (await r.text() ? r.json() : []) : []).catch(() => []);
    setProspects(rows);
  };
  useEffect(() => { loadProspects(); }, []);

  const handleSelectForSend = (ids: number[]) => {
    setSendTargetIds(ids);
    setTab('send');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">メール営業</h1>
        <p className="text-muted-foreground mt-1 text-sm">AIで見込みリストを自動生成し、HTMLメールで一括送信します。</p>
      </div>

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

      {tab === 'list'    && <ProspectList onSelectForSend={handleSelectForSend} />}
      {tab === 'send'    && <SendTab preselectedIds={sendTargetIds} prospects={prospects} onSent={() => { loadProspects(); setTab('history'); }} />}
      {tab === 'history' && <HistoryTab prospects={prospects} />}
    </div>
  );
}
