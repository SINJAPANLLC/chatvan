import { useState, useEffect } from 'react';
import {
  MessageSquare, Send, Mail, Clock, CheckCheck,
  ChevronDown, ChevronUp, Loader2, Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

const TOPICS = [
  '車両情報の変更・訂正',
  '保険の更新・変更',
  '契約内容について',
  '支払い・精算について',
  'その他',
];

// ─── 送信フォーム ─────────────────────────────────────────────────────────────
function SendForm({ onSent }: { onSent: () => void }) {
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) { toast({ variant: 'destructive', title: '内容を入力してください' }); return; }
    setSending(true);
    try {
      const body = topic ? `【${topic}】\n${message}` : message;
      const r = await fetch(API('/company/notify-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message: body, subject: topic || 'お問い合わせ' }),
      });
      if (r.ok) {
        toast({ title: '送信しました', description: '担当者より折り返しご連絡いたします。' });
        setMessage(''); setTopic('');
        onSent();
      } else {
        toast({ variant: 'destructive', title: '送信に失敗しました' });
      }
    } finally { setSending(false); }
  };

  const inp = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* 左: 連絡先情報 + 種別 */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <p className="font-semibold text-sm">お問い合わせ種別</p>
          <div className="space-y-2">
            {TOPICS.map(t => (
              <button key={t} onClick={() => setTopic(topic === t ? '' : t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  topic === t
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="font-semibold text-sm">直接連絡先</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span>info@sinjapan.jp</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span>平日 9:00〜18:00</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右: 本文 */}
      <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4 flex flex-col">
        <p className="font-semibold text-sm">お問い合わせ内容</p>

        {topic && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-lg text-sm">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">種別：</span>
            <span className="font-medium">{topic}</span>
          </div>
        )}

        <div className="space-y-1.5 flex-1 flex flex-col">
          <label className="text-xs text-muted-foreground">内容 <span className="text-red-500">*</span></label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="お問い合わせ内容を入力してください..."
            rows={8}
            className={`${inp} resize-none flex-1 min-h-[200px] font-sans`}
          />
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">送信後について</p>
          <p>担当者が内容を確認し、通常2営業日以内にご返信いたします。</p>
        </div>

        <button onClick={handleSend} disabled={sending || !message.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? '送信中...' : '送信する'}
        </button>
      </div>
    </div>
  );
}

// ─── 問い合わせ履歴 ───────────────────────────────────────────────────────────
function InquiryHistory() {
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    apiFetch(API('/company/contacts'))
      .then(d => setInquiries(Array.isArray(d) ? d : (d.contacts ?? [])))
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (inquiries.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
      <MessageSquare className="h-10 w-10 opacity-30" />
      <p className="text-sm">送信履歴はありません</p>
    </div>
  );

  const unreplied = inquiries.filter(i => !i.replied);
  const replied   = inquiries.filter(i =>  i.replied);

  const InquiryCard = ({ inquiry }: { inquiry: any }) => {
    const isOpen = expanded === inquiry.id;
    return (
      <div className={`border rounded-xl overflow-hidden ${inquiry.replied ? 'border-border/50' : 'border-border'}`}>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
          onClick={() => setExpanded(isOpen ? null : inquiry.id)}>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              {inquiry.replied
                ? <CheckCheck className="h-3.5 w-3.5 text-foreground shrink-0" />
                : <Mail       className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <span className="font-medium text-sm truncate">{inquiry.subject || inquiry.topic || 'お問い合わせ'}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {inquiry.createdAt || inquiry.created_at
                ? format(new Date(inquiry.createdAt ?? inquiry.created_at), 'yyyy/MM/dd HH:mm')
                : '—'}
              {inquiry.replied && <span className="ml-2 text-foreground font-medium">・返信済み</span>}
            </p>
          </div>
          {isOpen
            ? <ChevronUp   className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {isOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-border/50">
            <div className="pt-3 text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
              {inquiry.message}
            </div>
            {inquiry.replied && inquiry.replyBody && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCheck className="h-3.5 w-3.5" />担当者からの返信
                </p>
                <div className="text-sm whitespace-pre-wrap bg-muted/20 border border-border rounded-lg p-3">
                  {inquiry.replyBody}
                </div>
              </div>
            )}
            {!inquiry.replied && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />返信をお待ちください（通常2営業日以内）
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {unreplied.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Mail className="h-4 w-4" />返信待ち ({unreplied.length})
          </h2>
          {unreplied.map(i => <InquiryCard key={i.id} inquiry={i} />)}
        </div>
      )}
      {replied.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <CheckCheck className="h-4 w-4" />返信済み ({replied.length})
          </h2>
          {replied.map(i => <InquiryCard key={i.id} inquiry={i} />)}
        </div>
      )}
    </div>
  );
}

// ─── メイン ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'send',    label: '新規送信'  },
  { key: 'history', label: '送信履歴'  },
];

export default function CompanyContact() {
  const [tab, setTab] = useState('send');
  const [sentCount, setSentCount] = useState(0);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">お問い合わせ</h1>
        <p className="text-muted-foreground text-sm mt-1">
          車両情報の変更・保険の更新・その他のご質問はこちらからご連絡ください。
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'send'    && <SendForm onSent={() => { setSentCount(c => c + 1); setTab('history'); }} />}
      {tab === 'history' && <InquiryHistory key={sentCount} />}
    </div>
  );
}
