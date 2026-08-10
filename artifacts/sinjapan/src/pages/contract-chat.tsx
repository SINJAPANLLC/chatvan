import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import {
  ArrowLeft, Send, AlertTriangle, Car, Wrench, ShieldAlert,
  HelpCircle, Phone, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';

const BASE = `${import.meta.env.BASE_URL}api`;
const API = (p: string) => `${BASE}${p}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdrs = () => ({ Authorization: `Bearer ${token()}` });

const CATEGORIES = [
  { id: 'accident',   icon: Car,          label: '交通事故',     color: 'bg-red-50 border-red-300 text-red-700'    },
  { id: 'breakdown',  icon: Wrench,        label: '車両故障',     color: 'bg-orange-50 border-orange-300 text-orange-700' },
  { id: 'theft',      icon: ShieldAlert,   label: '盗難・不正使用', color: 'bg-purple-50 border-purple-300 text-purple-700' },
  { id: 'other',      icon: HelpCircle,    label: 'その他トラブル', color: 'bg-muted border-border text-foreground'   },
];

const ROLE_LABELS: Record<string, string> = {
  user: 'あなた', rental_company: '担当者', admin: '担当者',
};

export default function ContractChat() {
  const { id } = useParams<{ id: string }>();
  const contractId = parseInt(id ?? '0');
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();

  const [messages, setMessages]   = useState<any[]>([]);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showEmergency, setShowEmergency]       = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval>>();

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
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const prefix = selectedCategory
      ? `【${CATEGORIES.find(c => c.id === selectedCategory)?.label ?? selectedCategory}】\n`
      : '';
    try {
      const r = await fetch(API(`/contract-chat/${contractId}`), {
        method: 'POST',
        headers: { ...hdrs(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prefix + text }),
      });
      if (r.ok) {
        setInput('');
        setSelectedCategory(null);
        await load();
      }
    } finally { setSending(false); }
  };

  const isMine = (msg: any) => msg.sender_id === me?.id;

  const backHref = me?.role === 'rental_company' || me?.role === 'admin'
    ? '/company/contracts' : '/mypage';

  return (
    <div className="flex flex-col h-[100dvh] bg-background">

      {/* ヘッダー */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setLocation(backHref)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 border border-red-300 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">事故・トラブル報告</p>
              <p className="text-xs text-muted-foreground">担当者に直接連絡できます</p>
            </div>
          </div>
        </div>

        {/* 緊急連絡バナー（折り畳み可） */}
        <div className="border-t border-border">
          <button
            onClick={() => setShowEmergency(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Phone className="h-3.5 w-3.5 text-red-500" />緊急連絡先
            </span>
            {showEmergency ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showEmergency && (
            <div className="px-4 pb-3 grid grid-cols-2 gap-2 text-xs">
              <a href="tel:050-5526-9906"
                className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 hover:bg-red-100 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">SIN JAPAN</span>050-5526-9906</span>
              </a>
              <a href="tel:110"
                className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">警察</span>110</span>
              </a>
              <a href="tel:119"
                className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">救急・消防</span>119</span>
              </a>
              <a href="tel:0120-079-919"
                className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg hover:bg-muted/80 transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold block">JAFロードサービス</span>0120-079-919</span>
              </a>
            </div>
          )}
        </div>
      </header>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center pt-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 pt-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">まだ報告はありません</p>
              <p className="text-xs text-muted-foreground mt-1">
                事故・故障・トラブルが発生した場合は<br />カテゴリを選んでご連絡ください
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const mine = isMine(msg);
            return (
              <div key={msg.id} className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && (
                  <span className="text-xs font-medium text-muted-foreground px-1">
                    {ROLE_LABELS[msg.sender_role_actual] ?? '担当者'}
                  </span>
                )}
                <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  mine
                    ? 'bg-foreground text-background rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm border border-border'
                }`}>
                  {msg.message}
                </div>
                <span className="text-xs text-muted-foreground/70 px-1">
                  {new Date(msg.created_at).toLocaleString('ja-JP', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-4 space-y-2">
        {/* カテゴリ選択 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(active ? null : cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                  active ? cat.color : 'bg-background border-border text-muted-foreground hover:border-foreground/30'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* テキスト入力 */}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={
              selectedCategory
                ? `${CATEGORIES.find(c => c.id === selectedCategory)?.label}の詳細を入力…`
                : '状況を詳しく入力してください…'
            }
            rows={1}
            className="flex-1 resize-none border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 max-h-32 bg-background"
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
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
