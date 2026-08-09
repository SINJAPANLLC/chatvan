import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { ArrowLeft, Send, MessageSquare } from 'lucide-react';

const BASE = `${import.meta.env.BASE_URL}api`;
const API = (p: string) => `${BASE}${p}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdrs = () => ({ Authorization: `Bearer ${token()}` });

const ROLE_LABELS: Record<string, string> = {
  user: 'ユーザー', rental_company: '協力会社', admin: '管理者',
};

export default function ContractChat() {
  const { id } = useParams<{ id: string }>();
  const contractId = parseInt(id ?? '0');
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const load = async () => {
    const r = await fetch(API(`/contract-chat/${contractId}`), { headers: hdrs() });
    if (r.ok) setMessages(await r.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    return () => clearInterval(pollRef.current);
  }, [contractId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(API(`/contract-chat/${contractId}`), {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      });
      if (r.ok) { setInput(''); await load(); }
    } finally { setSending(false); }
  };

  const isMine = (msg: any) => msg.sender_id === me?.id;

  const backHref = me?.role === 'rental_company' || me?.role === 'admin'
    ? '/company/contracts' : '/mypage';

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation(backHref)} className="p-1.5 rounded hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <MessageSquare className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-sm">契約チャット</p>
          <p className="text-xs text-muted-foreground">契約 #{contractId}</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 pt-16">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">まだメッセージはありません</p>
            <p className="text-xs">協力会社に質問・連絡ができます</p>
          </div>
        ) : (
          messages.map((msg) => {
            const mine = isMine(msg);
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5">
                  {!mine && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                      msg.sender_role === 'rental_company' ? 'bg-blue-100 text-blue-700' :
                      msg.sender_role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {ROLE_LABELS[msg.sender_role] ?? msg.sender_role}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{msg.sender_name}</span>
                </div>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  mine
                    ? 'bg-foreground text-background rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  {msg.message}
                </div>
                <span className="text-xs text-muted-foreground/70">
                  {new Date(msg.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-card">
        <div className="flex gap-2 items-end max-w-2xl mx-auto">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="メッセージを入力…（Enterで送信）"
            rows={1}
            className="flex-1 resize-none border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-32"
            style={{ height: 'auto' }}
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="p-2.5 bg-foreground text-background rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
