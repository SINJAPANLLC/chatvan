import React, { useState, useEffect } from 'react';
import { useListUsers } from '@workspace/api-client-react';
import type { User as ApiUser } from '@workspace/api-client-react';
import {
  Loader2, Send, Users, User, History, ChevronDown, ChevronUp,
  Mail, CheckCheck, Settings, Wrench, Calendar, Clock, AlertTriangle, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(`${import.meta.env.BASE_URL}api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

// ── テンプレート ───────────────────────────────────────────────────────────────
const TEMPLATES = [
  { label: 'カスタム',   subject: '',                                          body: '' },
  { label: '提案送信',   subject: '【Chat VAN】軽バンのご提案をお送りしました', body: 'お世話になっております。\nご相談いただいた条件に合わせた軽バンのご提案をお送りしました。\n\nマイページよりご確認いただけます。\nご不明な点がございましたらお気軽にお問い合わせください。' },
  { label: '申込確認',   subject: '【Chat VAN】お申込みを受け付けました',         body: 'お世話になっております。\nお申込みありがとうございます。\n\n内容を確認のうえ、担当者よりご連絡いたします。\n引き続きよろしくお願いいたします。' },
  { label: '利用開始',   subject: '【Chat VAN】ご利用開始のご案内',               body: 'お世話になっております。\n本日より軽バンのご利用を開始いただけます。\n\n車両の受け渡しについては担当者よりご連絡いたします。\nご不明な点がございましたらお気軽にお問い合わせください。' },
  { label: '請求書発行', subject: '【Chat VAN】請求書を発行しました',             body: 'お世話になっております。\n今月の請求書を発行いたしました。マイページよりご確認ください。\n\nご不明な点がございましたらお気軽にお問い合わせください。' },
  { label: 'お知らせ',   subject: '【Chat VAN】重要なお知らせ',                   body: 'お世話になっております。\n以下の通りお知らせいたします。\n\n' },
];

type SendTarget = 'all' | 'select';

/** Narrow view of backend user — the generated User type omits fields the server actually returns. */
type BackendUser = ApiUser & {
  companyName?: string | null;
};

// ── 送信フォーム ───────────────────────────────────────────────────────────────
function SendForm({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const { data: rawUsers } = useListUsers();
  const users = rawUsers as BackendUser[] | undefined;
  const [target, setTarget] = useState<SendTarget>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [templateIdx, setTemplateIdx] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userListOpen, setUserListOpen] = useState(false);

  const applyTemplate = (idx: number) => {
    setTemplateIdx(idx);
    setSubject(TEMPLATES[idx].subject);
    setBody(TEMPLATES[idx].body);
  };

  const toggleUser = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filteredUsers = users?.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || (u.companyName || '').toLowerCase().includes(q);
  }) ?? [];

  const recipientCount = target === 'all'
    ? (users?.filter(u => u.role === 'user').length ?? 0)
    : selectedIds.size;

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({ variant: 'destructive', title: '件名と本文を入力してください' }); return;
    }
    if (target === 'select' && selectedIds.size === 0) {
      toast({ variant: 'destructive', title: '送信先を選択してください' }); return;
    }
    setSending(true); setResult(null);
    try {
      const payload = target === 'all'
        ? { sendAll: true, subject, body }
        : { userIds: [...selectedIds], subject, body };
      const res = await apiFetch('/admin/notifications/send', { method: 'POST', body: JSON.stringify(payload) });
      setResult(res);
      toast({ title: res.message });
      onSent();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '送信に失敗しました', description: e.message });
    } finally { setSending(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-sm">送信先</p>
          <div className="grid grid-cols-2 gap-2">
            {(['all', 'select'] as SendTarget[]).map(t => (
              <button key={t} onClick={() => setTarget(t)}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  target === t ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {t === 'all' ? <><Users className="h-4 w-4" />全ユーザー</> : <><User className="h-4 w-4" />個別選択</>}
              </button>
            ))}
          </div>

          {target === 'select' && (
            <div className="space-y-2">
              <Input placeholder="名前・メール・会社名で絞り込み..." value={userSearch}
                onChange={e => setUserSearch(e.target.value)} className="text-sm" />
              <div className="border border-border rounded-lg overflow-hidden">
                <button className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/30"
                  onClick={() => setUserListOpen(v => !v)}>
                  <span>{selectedIds.size > 0 ? `${selectedIds.size}名選択中` : 'ユーザーを選択'}</span>
                  {userListOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {userListOpen && (
                  <div className="max-h-52 overflow-y-auto divide-y divide-border border-t border-border">
                    {filteredUsers.filter(u => u.role === 'user').map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleUser(u.id)} className="accent-foreground" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.companyName || u.email}</div>
                        </div>
                      </label>
                    ))}
                    {filteredUsers.filter(u => u.role === 'user').length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">該当なし</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {recipientCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <Mail className="h-4 w-4" />
              <span><strong className="text-foreground">{recipientCount}名</strong> に送信されます</span>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-semibold text-sm">テンプレート</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t, i) => (
              <button key={i} onClick={() => applyTemplate(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  templateIdx === i ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4 flex flex-col">
        <p className="font-semibold text-sm">メール内容</p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">件名 *</Label>
          <Input value={subject} onChange={e => { setSubject(e.target.value); setTemplateIdx(0); }}
            placeholder="【Chat VAN】件名を入力..." />
        </div>
        <div className="space-y-1.5 flex-1 flex flex-col">
          <Label className="text-xs text-muted-foreground">本文 *</Label>
          <Textarea value={body} onChange={e => { setBody(e.target.value); setTemplateIdx(0); }}
            placeholder="本文を入力してください..." className="flex-1 min-h-[240px] resize-none font-mono text-sm leading-relaxed" />
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">送信イメージ</p>
          <p>宛先：{target === 'all' ? '全ユーザー' : `${selectedIds.size}名`}</p>
          <p>件名：{subject || '（未入力）'}</p>
        </div>
        <Button className="w-full gap-2" onClick={handleSend}
          disabled={sending || !subject.trim() || !body.trim() || recipientCount === 0}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? '送信中...' : `${recipientCount}名に送信する`}
        </Button>
        {result && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
            <p className="font-medium text-green-700">{result.message}</p>
            {result.results?.some((r: any) => !r.sent) && <p className="text-xs text-muted-foreground mt-1">
              送信できなかった対象は「送信履歴」から理由を確認し、再送できます。
            </p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 送信履歴 ───────────────────────────────────────────────────────────────────
function SendHistory() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [resending, setResending] = useState<number | null>(null);
  const { toast } = useToast();
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    apiFetch(`/admin/notifications?limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`)
      .then(data => {
        setLogs(data.notifications ?? []);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        setLogs([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [offset, query]);

  const resend = async (id: number) => {
    setResending(id);
    try {
      const result = await apiFetch(`/admin/notifications/${id}/resend`, { method: 'POST' });
      toast({ title: result.sent ? 'メールを再送しました' : 'メールを再送できませんでした', description: result.reason });
      const data = await apiFetch(`/admin/notifications?limit=${limit}&offset=${offset}&q=${encodeURIComponent(query)}`);
      setLogs(data.notifications ?? []);
      setTotal(data.total ?? 0);
    } catch (error: any) {
      toast({ title: '再送に失敗しました', description: error.message, variant: 'destructive' });
    } finally {
      setResending(null);
    }
  };

  const statusLabel = (status?: string) => {
    if (status === 'sent') return <span className="text-green-700">送信済み</span>;
    if (status === 'skipped') return <span className="text-amber-700">SMTP未設定</span>;
    if (status === 'failed') return <span className="text-destructive">失敗</span>;
    if (status === 'sending') return <span className="text-muted-foreground">送信中</span>;
    return <span className="text-muted-foreground">システム内通知のみ</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <Input value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }}
          placeholder="件名・本文・送信先で検索..." className="max-w-md" />
        <p className="text-sm text-muted-foreground">{total}件の送信履歴</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">送信履歴はありません</div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">件名</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信先</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">本文</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">メール結果</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信日時</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {logs.map((item: any) => {
                return (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="px-5 py-3.5 font-medium max-w-[200px]"><div className="truncate">{item.title}</div></td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[160px]"><div className="line-clamp-2">{item.companyName || item.userName || item.userEmail || '—'}</div></td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[240px]"><div className="line-clamp-2 whitespace-pre-wrap">{item.message}</div></td>
                    <td className="px-5 py-3.5 text-xs">
                      <div className="font-medium">{statusLabel(item.emailStatus)}</div>
                      {item.emailError && <div className="mt-1 max-w-44 text-muted-foreground line-clamp-2">{item.emailError}</div>}
                      {item.emailAttemptCount > 1 && <div className="mt-1 text-muted-foreground">再送 {item.emailAttemptCount - 1}回</div>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {item.createdAt ? format(new Date(item.createdAt), 'yyyy/MM/dd HH:mm') : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {item.emailStatus !== 'sent' && item.emailStatus !== 'not_requested' && (
                        <Button variant="outline" size="sm" onClick={() => resend(item.id)} disabled={resending === item.id}>
                          {resending === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '再送'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > limit && (
        <div className="flex justify-end items-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset(v => Math.max(0, v - limit))}>前へ</Button>
          <span className="text-muted-foreground">{Math.floor(offset / limit) + 1} / {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={offset + limit >= total || loading} onClick={() => setOffset(v => v + limit)}>次へ</Button>
        </div>
      )}
    </div>
  );
}

// ── 自動通知設定 ───────────────────────────────────────────────────────────────
type NotificationRule = {
  key: string;
  category: string;
  label: string;
  trigger: string;
  recipients: string[];
  email: boolean;
  inApp: 'always' | 'registered_recipient' | 'none';
};

const PREVIEW_DATA: Record<string, { badge?: string; name: string; subject: string; body: string; cta: string; accentColor?: string }> = {
  '会員登録': {
    name: '山田 太郎',
    subject: '【Chat VAN】ご登録ありがとうございます',
    body: 'この度はChat VANにご登録いただきありがとうございます。\n\nチャットで希望条件をお伝えいただくだけで、あなたに合った軽バンをご提案します。\nいつでもお気軽にご相談ください。',
    cta: '軽バンを探してみる →',
  },
  'パスワードリセット': {
    name: '山田 太郎',
    subject: '【Chat VAN】パスワードリセットのご案内',
    body: 'パスワードリセットのリクエストを受け付けました。\n\n下のボタンからパスワードを再設定してください。\nリンクの有効期限は1時間です。\n\n心当たりのない場合はこのメールを無視してください。',
    cta: 'パスワードを再設定する →',
  },
  '提案送信': {
    badge: '提案送信',
    name: '山田 太郎',
    subject: '【Chat VAN】軽バンのご提案をお送りしました',
    body: 'ご相談いただいた条件に合わせた軽バンをご提案いたします。\n\nエリア：神奈川県\n月額：30,000円〜\n\n提案車両の詳細はマイページよりご確認ください。\n気になる車両がございましたらそのままお申込みいただけます。',
    cta: '提案を確認する →',
  },
  '申込受付': {
    badge: '申込受付',
    name: '山田 太郎',
    subject: '【Chat VAN】お申込みを受け付けました',
    body: 'お申込みありがとうございます。\n\n内容を確認のうえ、担当者より2営業日以内にご連絡いたします。\n引き続きよろしくお願いいたします。',
    cta: '申込内容を確認する →',
  },
  '利用開始': {
    badge: '利用開始',
    name: '山田 太郎',
    subject: '【Chat VAN】ご利用開始のご案内',
    body: '本日より軽バンのご利用を開始いただけます。\n\n車両の受け渡し場所・時間については担当者よりご連絡いたします。\n安全にご利用いただき、ありがとうございます。',
    cta: '契約内容を確認する →',
  },
  '返却予定': {
    badge: '返却予定',
    name: '山田 太郎',
    subject: '【Chat VAN】返却予定日のご確認',
    body: '契約期間終了まで残り7日となりました。\n\n返却手続きについては担当者よりご連絡いたします。\n契約延長をご希望の場合はお早めにご連絡ください。',
    cta: '契約内容を確認する →',
  },
  '契約終了': {
    badge: '契約終了',
    name: '山田 太郎',
    subject: '【Chat VAN】ご利用ありがとうございました',
    body: 'ご契約期間が終了いたしました。\n\nこのたびはChat VANをご利用いただきありがとうございました。\nまたのご相談をお待ちしております。',
    cta: '再度相談する →',
  },
  'キャンセル': {
    badge: 'キャンセル',
    name: '山田 太郎',
    subject: '【Chat VAN】相談をキャンセルしました',
    body: '相談のキャンセルが完了いたしました。\n\nご利用いただきありがとうございました。またのご相談をお待ちしております。',
    cta: 'マイページを確認する →',
  },
  '決済完了': {
    badge: '決済完了',
    name: '山田 太郎',
    subject: '【Chat VAN】決済が完了しました',
    body: 'クレジットカードの決済が完了いたしました。\n\nご利用いただきありがとうございました。\n領収書・請求書はマイページよりご確認いただけます。',
    cta: '領収書を確認する →',
  },
  '受付確認': {
    name: '山田 太郎',
    subject: '【Chat VAN】お問い合わせを受け付けました',
    body: 'お問い合わせいただきありがとうございます。\n\n内容を確認次第、担当者よりご連絡いたします。\n通常2営業日以内にご返信いたします。',
    cta: 'マイページを確認する →',
  },
  '返信通知': {
    name: '山田 太郎',
    subject: '【Chat VAN】お問い合わせへの回答',
    body: 'お問い合わせへのご回答をお送りします。\n\n--- 担当者からの回答 ---\nご質問いただいた件につきまして、以下の通りご回答申し上げます。\n\n詳細はマイページよりご確認ください。',
    cta: 'お問い合わせを確認する →',
  },
};

function EmailPreview() {
  const keys = Object.keys(PREVIEW_DATA);
  const [selected, setSelected] = React.useState(keys[0]);
  const p = PREVIEW_DATA[selected];
  const year = new Date().getFullYear();

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-3 flex-wrap">
        <p className="text-sm font-semibold shrink-0">メールプレビュー</p>
        <div className="flex flex-wrap gap-1.5">
          {keys.map(k => (
            <button key={k} onClick={() => setSelected(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                selected === k ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 bg-muted/10">
        <div style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif", maxWidth: 560 }}>
          <div style={{ background: '#000', padding: '20px 28px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>Chat VAN</span>
            {p.badge && (
              <span style={{ background: '#fff', color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{p.badge}</span>
            )}
          </div>
          <div style={{ background: '#fff', padding: '32px 32px 24px', border: '1px solid #e5e5e5', borderTop: 'none' }}>
            <p style={{ margin: '0 0 20px', fontSize: 15, color: '#333', fontWeight: 500 }}>{p.name} 様</p>
            <div style={{ fontSize: 14, color: '#333', lineHeight: 1.9, marginBottom: 28, whiteSpace: 'pre-wrap' }}>{p.body}</div>
            <table cellPadding={0} cellSpacing={0} style={{ marginBottom: 28 }}>
              <tbody><tr><td style={{ background: '#000', borderRadius: 8 }}>
                <span style={{ display: 'inline-block', padding: '12px 28px', color: '#fff', fontSize: 13, fontWeight: 700 }}>{p.cta}</span>
              </td></tr></tbody>
            </table>
            <hr style={{ border: 'none', borderTop: '1px solid #ebebeb', margin: '0 0 20px' }} />
            <p style={{ margin: 0, fontSize: 11, color: '#aaa', lineHeight: 1.7 }}>
              このメールは <strong>Chat VAN</strong> から自動送信されています。<br />
              心当たりのない場合や、ご不明な点は担当者までお問い合わせください。
            </p>
          </div>
          <div style={{ background: '#f7f7f7', padding: '14px 28px', borderRadius: '0 0 10px 10px', border: '1px solid #e5e5e5', borderTop: 'none', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>© {year} Chat VAN</span>
            <span style={{ fontSize: 11, color: '#bbb' }}>合同会社SIN JAPAN</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AutoSettings() {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/admin/notification-rules')
      .then(data => setRules(data.rules ?? []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, []);

  const inAppLabel = (delivery: NotificationRule['inApp']) => {
    if (delivery === 'always') return <span className="inline-flex items-center gap-1 text-green-700"><CheckCheck className="h-3.5 w-3.5" />送信</span>;
    if (delivery === 'registered_recipient') return <span className="text-amber-700">アカウント保有者</span>;
    return <span className="text-muted-foreground">なし</span>;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
        Chat VANの実際の配信仕様を表示しています。メール送信にはSMTP設定が必要です。<br />
        「アカウント保有者」は、受信者にログイン用アカウントがある場合だけシステム内通知を作成します。アカウントがない送信先にもメールの送信結果は記録されます。
      </div>
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">カテゴリ</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">種別</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">トリガー条件</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信先</th>
              <th className="px-5 py-3 text-center font-medium text-muted-foreground">メール</th>
              <th className="px-5 py-3 text-center font-medium text-muted-foreground">システム内通知</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />通知仕様を読み込み中です</td></tr>
            ) : rules.map(r => (
              <tr key={r.key} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{r.category}</td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-foreground text-background text-xs font-semibold">{r.label}</span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{r.trigger}</td>
                <td className="px-5 py-3.5 text-xs text-muted-foreground">{r.recipients.join('・')}</td>
                <td className="px-5 py-3.5 text-center">{r.email ? <span className="inline-flex items-center gap-1 text-green-700"><Mail className="h-3.5 w-3.5" />送信</span> : <span className="text-muted-foreground">なし</span>}</td>
                <td className="px-5 py-3.5 text-center text-xs">{inAppLabel(r.inApp)}</td>
              </tr>
            ))}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">通知仕様を取得できませんでした</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <EmailPreview />
    </div>
  );
}

// ── メンテナンス通知 ───────────────────────────────────────────────────────────
type MaintenanceLevel = 'info' | 'warning' | 'critical';

const LEVEL_CONFIG: Record<MaintenanceLevel, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  info:     { label: '通常メンテナンス', color: '#1d4ed8', bgColor: '#eff6ff', borderColor: '#bfdbfe', icon: Info },
  warning:  { label: '重要メンテナンス', color: '#92400e', bgColor: '#fffbeb', borderColor: '#fde68a', icon: AlertTriangle },
  critical: { label: '緊急メンテナンス', color: '#991b1b', bgColor: '#fef2f2', borderColor: '#fecaca', icon: AlertTriangle },
};

const MAINTENANCE_TEMPLATES = [
  {
    label: '定期メンテナンス',
    level: 'info' as MaintenanceLevel,
    scope: '一部機能',
    detail: '定期メンテナンスを実施いたします。\n該当時間帯はサービスが一時的にご利用いただけない場合がございます。\n\nご不便をおかけして申し訳ありません。\n完了次第、通常通りご利用いただけます。',
  },
  {
    label: '緊急メンテナンス',
    level: 'critical' as MaintenanceLevel,
    scope: '全サービス',
    detail: '緊急メンテナンスを実施いたします。\n全サービスが一時的にご利用いただけなくなります。\n\n復旧次第、改めてご連絡いたします。\nご迷惑をおかけして誠に申し訳ございません。',
  },
  {
    label: '機能リリース',
    level: 'info' as MaintenanceLevel,
    scope: '一部機能',
    detail: 'システムアップデートを実施いたします。\n新機能のリリースに伴い、一部機能が一時的にご利用いただけない場合がございます。\n\nアップデート後はより便利な機能をご利用いただけます。',
  },
];

function MaintenanceForm({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const { data: users } = useListUsers();

  // フォーム状態
  const todayStr = new Date().toISOString().slice(0, 16);
  const [level, setLevel] = useState<MaintenanceLevel>('info');
  const [startDatetime, setStartDatetime] = useState('');
  const [endDatetime, setEndDatetime] = useState('');
  const [scope, setScope] = useState('一部機能');
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [tplIdx, setTplIdx] = useState(-1);

  const applyTemplate = (i: number) => {
    const t = MAINTENANCE_TEMPLATES[i];
    setTplIdx(i);
    setLevel(t.level);
    setScope(t.scope);
    setDetail(t.detail);
  };

  // 件名・本文を自動生成
  const levelLabel = LEVEL_CONFIG[level].label;
  const startFmt = startDatetime ? format(new Date(startDatetime), 'yyyy年MM月dd日 HH:mm') : '○月○日 ○○:○○';
  const endFmt   = endDatetime   ? format(new Date(endDatetime),   'yyyy年MM月dd日 HH:mm') : '○月○日 ○○:○○';

  const autoSubject = `【Chat VAN】${levelLabel}のお知らせ（${startFmt}〜）`;
  const autoBody = [
    'いつもChat VANをご利用いただきありがとうございます。',
    '',
    `以下の通り、${levelLabel}を実施いたします。`,
    '',
    `▼ メンテナンス概要`,
    `日時：${startFmt} 〜 ${endFmt}`,
    `影響範囲：${scope}`,
    '',
    detail,
    '',
    'ご不便をおかけして申し訳ございません。\n引き続きChat VANをよろしくお願いいたします。',
  ].join('\n');

  const recipientCount = users?.filter(u => u.role === 'user').length ?? 0;

  const handleSend = async () => {
    if (!startDatetime) { toast({ variant: 'destructive', title: 'メンテナンス開始日時を入力してください' }); return; }
    if (!endDatetime)   { toast({ variant: 'destructive', title: 'メンテナンス終了日時を入力してください' }); return; }
    if (new Date(endDatetime) <= new Date(startDatetime)) { toast({ variant: 'destructive', title: '終了日時は開始日時より後にしてください' }); return; }
    if (!detail.trim()) { toast({ variant: 'destructive', title: '詳細説明を入力してください' }); return; }
    setSending(true);
    try {
      const res = await apiFetch('/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ sendAll: true, subject: autoSubject, body: autoBody }),
      });
      toast({ title: res.message });
      onSent();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '送信に失敗しました', description: e.message });
    } finally { setSending(false); }
  };

  const cfg = LEVEL_CONFIG[level];
  const year = new Date().getFullYear();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* 左：設定 */}
      <div className="lg:col-span-2 space-y-5">

        {/* テンプレート */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-semibold text-sm">テンプレート</p>
          <div className="flex flex-col gap-2">
            {MAINTENANCE_TEMPLATES.map((t, i) => {
              const Icon = LEVEL_CONFIG[t.level].icon;
              return (
                <button key={i} onClick={() => applyTemplate(i)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    tplIdx === i ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted/30'
                  }`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 重要度 */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-semibold text-sm">重要度</p>
          <div className="flex flex-col gap-2">
            {(Object.entries(LEVEL_CONFIG) as [MaintenanceLevel, typeof LEVEL_CONFIG[MaintenanceLevel]][]).map(([k, v]) => {
              const Icon = v.icon;
              return (
                <button key={k} onClick={() => setLevel(k)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${
                    level === k ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted/30'
                  }`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 送信先 */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <p className="font-semibold text-sm">送信先</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            <Users className="h-4 w-4" />
            <span>全ユーザー <strong className="text-foreground">{recipientCount}名</strong> に一斉送信</span>
          </div>
        </div>
      </div>

      {/* 右：フォーム + プレビュー */}
      <div className="lg:col-span-3 space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-sm">メンテナンス情報</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />開始日時 *</Label>
              <input type="datetime-local" value={startDatetime} onChange={e => setStartDatetime(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />終了日時 *</Label>
              <input type="datetime-local" value={endDatetime} onChange={e => setEndDatetime(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">影響範囲</Label>
            <div className="flex gap-2 flex-wrap">
              {['全サービス', '一部機能', 'チャット機能', '決済機能', '管理画面'].map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    scope === s ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}>
                  {s}
                </button>
              ))}
              <Input value={!['全サービス', '一部機能', 'チャット機能', '決済機能', '管理画面'].includes(scope) ? scope : ''}
                onChange={e => setScope(e.target.value)} placeholder="カスタム入力" className="h-7 text-xs w-28" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">詳細説明 *</Label>
            <Textarea value={detail} onChange={e => setDetail(e.target.value)}
              placeholder="メンテナンスの内容・理由・影響について記述してください..." className="min-h-[120px] resize-none text-sm" />
          </div>
        </div>

        {/* メールプレビュー */}
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <p className="text-sm font-semibold">送信メールプレビュー</p>
          </div>
          <div className="p-4 bg-muted/10">
            <div style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif", maxWidth: 540 }}>
              {/* ヘッダー */}
              <div style={{ background: '#000', padding: '18px 24px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>Chat VAN</span>
                <span style={{ background: level === 'critical' ? '#ef4444' : level === 'warning' ? '#f59e0b' : '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                  {levelLabel}
                </span>
              </div>
              {/* アラートバナー */}
              <div style={{ background: cfg.bgColor, borderLeft: `4px solid ${cfg.color}`, padding: '12px 20px', border: `1px solid ${cfg.borderColor}`, borderTop: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{levelLabel}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: cfg.color, lineHeight: 1.5 }}>
                  <span>日時: {startFmt} 〜 {endFmt}</span><br />
                  <span>影響範囲: {scope}</span>
                </div>
              </div>
              {/* ボディ */}
              <div style={{ background: '#fff', padding: '24px 24px 20px', border: '1px solid #e5e5e5', borderTop: 'none', fontSize: 13, color: '#333', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {detail || '詳細説明を入力してください'}
              </div>
              {/* フッター */}
              <div style={{ background: '#f7f7f7', padding: '12px 24px', borderRadius: '0 0 10px 10px', border: '1px solid #e5e5e5', borderTop: 'none', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#bbb' }}>© {year} Chat VAN</span>
                <span style={{ fontSize: 10, color: '#bbb' }}>合同会社SIN JAPAN</span>
              </div>
            </div>
          </div>
        </div>

        <Button className="w-full gap-2 bg-black text-white hover:bg-black/90" onClick={handleSend}
          disabled={sending || !startDatetime || !endDatetime || !detail.trim() || recipientCount === 0}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? '送信中...' : `全ユーザー ${recipientCount}名 にメンテナンス通知を送信`}
        </Button>
      </div>
    </div>
  );
}

// ── メインページ ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'send',        label: 'メール送信',       icon: Send },
  { key: 'maintenance', label: 'メンテナンス通知',  icon: Wrench },
  { key: 'history',     label: '送信履歴',          icon: History },
  { key: 'auto',        label: '自動通知設定',       icon: Settings },
];

export default function AdminNotifications() {
  const [tab, setTab] = useState('send');
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">通知管理</h1>
        <p className="text-muted-foreground mt-1 text-sm">ユーザーへの通知メール送信・自動通知ルールの確認を行います。</p>
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

      {tab === 'send'        && <SendForm onSent={() => setHistoryKey(k => k + 1)} />}
      {tab === 'maintenance' && <MaintenanceForm onSent={() => setHistoryKey(k => k + 1)} />}
      {tab === 'history'     && <SendHistory key={historyKey} />}
      {tab === 'auto'        && <AutoSettings />}
    </div>
  );
}
