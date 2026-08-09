import React, { useState, useEffect } from 'react';
import { useListUsers } from '@workspace/api-client-react';
import { Loader2, Send, Users, User, History, ChevronDown, ChevronUp, Mail, CheckCheck, Settings } from 'lucide-react';
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

// テンプレート
const TEMPLATES = [
  { label: 'カスタム',   subject: '',                          body: '' },
  { label: '配車確定',   subject: '【Chat VAN】配車が確定しました',   body: 'お世話になっております。\nご依頼の案件について、配車が確定いたしました。\n\n引き続きよろしくお願いいたします。' },
  { label: '集荷完了',   subject: '【Chat VAN】集荷が完了しました',   body: 'お世話になっております。\nご依頼の荷物の集荷が完了いたしました。\n\n配送状況については担当者よりご連絡いたします。' },
  { label: '配送完了',   subject: '【Chat VAN】配送が完了しました',   body: 'お世話になっております。\nご依頼の荷物の配送が完了いたしました。\n\nご利用いただきありがとうございました。' },
  { label: '請求書発行', subject: '【Chat VAN】請求書を発行しました', body: 'お世話になっております。\n請求書を発行いたしました。マイページよりご確認ください。\n\nご不明な点がございましたらお気軽にお問い合わせください。' },
  { label: 'お知らせ',   subject: '【Chat VAN】重要なお知らせ',       body: 'お世話になっております。\n以下の通りお知らせいたします。\n\n' },
];

type SendTarget = 'all' | 'select';

// ── 送信フォーム ───────────────────────────────────────────────────────────────
function SendForm({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const { data: users } = useListUsers();
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
      toast({ variant: 'destructive', title: '件名と本文を入力してください' });
      return;
    }
    if (target === 'select' && selectedIds.size === 0) {
      toast({ variant: 'destructive', title: '送信先を選択してください' });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const payload = target === 'all'
        ? { sendAll: true, subject, body }
        : { userIds: [...selectedIds], subject, body };
      const res = await apiFetch('/api/admin/notifications/send', { method: 'POST', body: JSON.stringify(payload) });
      setResult(res);
      toast({ title: res.message });
      onSent();
    } catch (e: any) {
      toast({ variant: 'destructive', title: '送信に失敗しました', description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* 左：設定 */}
      <div className="lg:col-span-2 space-y-5">

        {/* 送信先 */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-sm">送信先</p>
          <div className="grid grid-cols-2 gap-2">
            {(['all', 'select'] as SendTarget[]).map(t => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  target === t ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'all' ? <><Users className="h-4 w-4" />全ユーザー</> : <><User className="h-4 w-4" />個別選択</>}
              </button>
            ))}
          </div>

          {target === 'select' && (
            <div className="space-y-2">
              <Input
                placeholder="名前・メール・会社名で絞り込み..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="text-sm"
              />
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/30"
                  onClick={() => setUserListOpen(v => !v)}
                >
                  <span>{selectedIds.size > 0 ? `${selectedIds.size}名選択中` : 'ユーザーを選択'}</span>
                  {userListOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {userListOpen && (
                  <div className="max-h-52 overflow-y-auto divide-y divide-border border-t border-border">
                    {filteredUsers.filter(u => u.role === 'user').map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="accent-foreground"
                        />
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

        {/* テンプレート */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-semibold text-sm">テンプレート</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => applyTemplate(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  templateIdx === i ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 右：本文 */}
      <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4 flex flex-col">
        <p className="font-semibold text-sm">メール内容</p>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">件名 *</Label>
          <Input
            value={subject}
            onChange={e => { setSubject(e.target.value); setTemplateIdx(0); }}
            placeholder="【Chat VAN】件名を入力..."
          />
        </div>

        <div className="space-y-1.5 flex-1 flex flex-col">
          <Label className="text-xs text-muted-foreground">本文 *</Label>
          <Textarea
            value={body}
            onChange={e => { setBody(e.target.value); setTemplateIdx(0); }}
            placeholder="本文を入力してください..."
            className="flex-1 min-h-[240px] resize-none font-mono text-sm leading-relaxed"
          />
        </div>

        {/* プレビュー */}
        <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">送信イメージ</p>
          <p>宛先：{target === 'all' ? '全ユーザー' : `${selectedIds.size}名`}</p>
          <p>件名：{subject || '（未入力）'}</p>
        </div>

        <Button
          className="w-full gap-2"
          onClick={handleSend}
          disabled={sending || !subject.trim() || !body.trim() || recipientCount === 0}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? '送信中...' : `${recipientCount}名に送信する`}
        </Button>

        {result && (
          <div className="rounded-lg bg-muted/30 border border-border p-3 text-sm">
            <p className="font-medium text-green-700">{result.message}</p>
            {result.results?.some((r: any) => !r.sent) && (
              <p className="text-xs text-muted-foreground mt-1">
                ※ SMTP未設定のためメール送信はスキップされました。システム内通知は作成済みです。
              </p>
            )}
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

  useEffect(() => {
    const token = localStorage.getItem('sinjapan_auth_token');
    setLoading(true);
    fetch('/api/admin/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(async r => {
      if (!r.ok) return;
      const text = await r.text();
      if (text) setLogs(JSON.parse(text));
    }).finally(() => setLoading(false));
  }, []);

  // 件名でグループ化して表示
  const grouped = logs.reduce((acc: Record<string, any[]>, item) => {
    const key = `${item.title}__${item.createdAt?.slice(0, 10)}`;
    (acc[key] = acc[key] ?? []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">送信履歴はありません</div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">件名</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信先</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">本文</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">送信数</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">既読</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">送信日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {(Object.entries(grouped) as [string, any[]][]).map(([key, items]) => {
                const first = items[0];
                const readCount = items.filter((i: any) => i.readStatus).length;
                const recipients = items.map((i: any) => i.companyName || i.userName).filter(Boolean).join('、');
                return (
                  <tr key={key} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="px-5 py-3.5 font-medium max-w-[200px]">
                      <div className="truncate">{first.title}</div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[160px]">
                      <div className="line-clamp-2">{recipients || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground max-w-[240px]">
                      <div className="line-clamp-2 whitespace-pre-wrap">{first.message}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium">{items.length}名</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <CheckCheck className={`h-4 w-4 ${readCount === items.length ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <span className="text-xs text-muted-foreground">{readCount}/{items.length}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {first.createdAt ? format(new Date(first.createdAt), 'yyyy/MM/dd HH:mm') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 自動通知設定 ───────────────────────────────────────────────────────────────
const AUTO_RULES = [
  { category: '会員',     status: '会員登録',         trigger: 'ユーザーが新規登録した時',                         mail: true  },
  { category: '会員',     status: 'パスワードリセット', trigger: 'パスワードリセットをリクエストした時',             mail: true  },
  { category: '案件',     status: '配車確定',          trigger: '管理者がステータスを「配車確定」に変更した時',      mail: true  },
  { category: '案件',     status: '集荷完了',          trigger: '管理者がステータスを「集荷完了」に変更した時',      mail: true  },
  { category: '案件',     status: '配送中',            trigger: '管理者がステータスを「配送中」に変更した時',        mail: true  },
  { category: '案件',     status: '納品完了',          trigger: '管理者がステータスを「納品完了」に変更した時',      mail: true  },
  { category: '案件',     status: '請求完了',          trigger: '管理者がステータスを「請求完了」に変更した時',      mail: true  },
  { category: '案件',     status: 'キャンセル',        trigger: 'キャンセルが承認された時',                         mail: true  },
  { category: '決済',     status: '決済完了',          trigger: '管理者がカード決済をキャプチャした時',              mail: true  },
  { category: 'お問合せ', status: '受付確認',          trigger: 'お問い合わせフォームが送信された時（ユーザーへ）',  mail: true  },
  { category: 'お問合せ', status: '返信通知',          trigger: '管理者がお問い合わせに返信した時（ユーザーへ）',    mail: true  },
];

// プレビューデータ
const PREVIEW_DATA: Record<string, { badge?: string; name: string; subject: string; body: string; cta: string }> = {
  '会員登録': {
    name: '山田 太郎',
    subject: '【Chat VAN】ご登録ありがとうございます',
    body: 'この度はChat VANにご登録いただきありがとうございます。\n\nチャットで運びたい荷物を教えていただくだけで、Chat VANがすべて手配いたします。\nいつでもお気軽にご利用ください。',
    cta: 'Chat VANを使ってみる →',
  },
  'パスワードリセット': {
    name: '山田 太郎',
    subject: '【Chat VAN】パスワードリセットのご案内',
    body: 'パスワードリセットのリクエストを受け付けました。\n\n下のボタンからパスワードを再設定してください。\nリンクの有効期限は1時間です。\n\n心当たりのない場合はこのメールを無視してください。',
    cta: 'パスワードを再設定する →',
  },
  '配車確定': {
    badge: '配車確定',
    name: '山田 太郎',
    subject: '【Chat VAN】配車が確定しました',
    body: '担当ドライバーの手配が完了いたしました。\n\nルート：東京都渋谷区 → 大阪府大阪市北区\n\n集荷日時が近づきましたら担当者よりご連絡いたします。',
    cta: '案件の詳細を確認する →',
  },
  '集荷完了': {
    badge: '集荷完了',
    name: '山田 太郎',
    subject: '【Chat VAN】集荷が完了しました',
    body: '荷物の集荷が完了いたしました。\n\nルート：東京都渋谷区 → 大阪府大阪市北区\n\nこれより配送を開始いたします。',
    cta: '配送状況を確認する →',
  },
  '配送中': {
    badge: '配送中',
    name: '山田 太郎',
    subject: '【Chat VAN】配送を開始しました',
    body: '荷物の配送を開始いたしました。\n\nルート：東京都渋谷区 → 大阪府大阪市北区\n\n到着予定時刻については担当者よりご連絡いたします。',
    cta: '配送状況を確認する →',
  },
  '納品完了': {
    badge: '納品完了',
    name: '山田 太郎',
    subject: '【Chat VAN】納品が完了しました',
    body: '荷物が無事に納品完了いたしました。\n\nこのたびはChat VANをご利用いただきありがとうございました。',
    cta: '案件の詳細を確認する →',
  },
  '請求完了': {
    badge: '請求完了',
    name: '山田 太郎',
    subject: '【Chat VAN】請求書を発行しました',
    body: '請求書を発行いたしました。\n\nマイページよりご確認・ダウンロードいただけます。\nご不明な点がございましたらお気軽にお問い合わせください。',
    cta: '請求書を確認する →',
  },
  'キャンセル': {
    badge: 'キャンセル',
    name: '山田 太郎',
    subject: '【Chat VAN】案件がキャンセルされました',
    body: '案件のキャンセルが完了いたしました。\n\nご利用いただきありがとうございました。またのご依頼をお待ちしております。',
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

function AutoSettings() {
  return (
    <div className="space-y-5">
      {/* 説明 */}
      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground leading-relaxed">
        案件のステータスが変更されると、対象ユーザーへ自動的に通知メールが送信されます。<br />
        以下のルールは常時有効です。SMTP設定を行うことで実際のメール送信が有効になります。
      </div>

      {/* ルール一覧 */}
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">カテゴリ</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">種別</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">トリガー条件</th>
              <th className="px-5 py-3 text-center font-medium text-muted-foreground">メール</th>
              <th className="px-5 py-3 text-center font-medium text-muted-foreground">システム内通知</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {AUTO_RULES.map(r => (
              <tr key={r.category + r.status} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{r.category}</td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-foreground text-background text-xs font-semibold">
                    {r.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">{r.trigger}</td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="有効" />
                </td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="有効" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* メールプレビュー */}
      <EmailPreview />
    </div>
  );
}

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
            <button
              key={k}
              onClick={() => setSelected(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                selected === k
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5 bg-muted/10">
        <div style={{ fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif", maxWidth: 560 }}>
          {/* ヘッダー */}
          <div style={{ background: '#000', padding: '20px 28px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>Chat VAN</span>
            </div>
            {p.badge && (
              <span style={{ background: '#fff', color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{p.badge}</span>
            )}
          </div>
          {/* ボディ */}
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
          {/* フッター */}
          <div style={{ background: '#f7f7f7', padding: '14px 28px', borderRadius: '0 0 10px 10px', border: '1px solid #e5e5e5', borderTop: 'none', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#bbb' }}>© {year} Chat VAN</span>
            <span style={{ fontSize: 11, color: '#bbb' }}>合同会社SIN JAPAN</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── メインページ ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'send',    label: 'メール送信',   icon: Send },
  { key: 'history', label: '送信履歴',     icon: History },
  { key: 'auto',    label: '自動通知設定', icon: Settings },
];

export default function AdminNotifications() {
  const [tab, setTab] = useState('send');
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">通知管理</h1>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'text-foreground border-b-2 border-foreground -mb-px' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'send'    && <SendForm onSent={() => { setHistoryKey(k => k + 1); }} />}
      {tab === 'history' && <SendHistory key={historyKey} />}
      {tab === 'auto'    && <AutoSettings />}
    </div>
  );
}
