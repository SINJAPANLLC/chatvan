import React, { useState } from 'react';
import { AlertTriangle, Wrench, ChevronRight, Phone, Send, CheckCircle } from 'lucide-react';
import { useLocation } from 'wouter';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

type Mode = 'select' | 'accident' | 'breakdown' | 'done';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function BreakdownPage() {
  const [mode, setMode] = useState<Mode>('select');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [, setLocation] = useLocation();

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const r = await fetch(API('/van/breakdowns'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, type: mode }),
      });
      if (r.ok) {
        const data = await r.json();
        setMessages([...newMessages, { role: 'assistant', content: data.aiMessage }]);
        if (data.isComplete) setDone(true);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: 'エラーが発生しました。緊急の場合は下記の電話番号にお電話ください。' }]);
      }
    } finally { setLoading(false); }
  };

  if (mode === 'select') {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="px-4 py-6 border-b border-border">
          <button onClick={() => setLocation('/mypage')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            ← マイページへ戻る
          </button>
          <h1 className="text-xl font-bold">事故・故障窓口</h1>
          <p className="text-sm text-muted-foreground mt-1">Chat VANがAIで一次対応します。状況をお知らせください。</p>
        </div>

        {/* 緊急の場合 */}
        <div className="mx-4 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />緊急の場合はまず110番・119番へ
          </p>
          <p className="text-xs text-red-600 mt-1">けが人がいる場合、危険な状況の場合は先に緊急通報してください。</p>
        </div>

        <div className="flex-1 p-4 space-y-3">
          <button onClick={() => { setMode('accident'); setMessages([{ role: 'assistant', content: 'ご連絡ありがとうございます。事故の状況を確認します。\n\nまず、けが人はいますか？' }]); }}
            className="w-full flex items-center justify-between px-5 py-4 bg-card border border-red-200 rounded-xl text-left hover:bg-red-50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="font-semibold text-red-700">事故が起きた</div>
                <div className="text-xs text-muted-foreground">衝突・接触・自損事故など</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <button onClick={() => { setMode('breakdown'); setMessages([{ role: 'assistant', content: 'ご連絡ありがとうございます。故障の状況を確認します。\n\nどのような症状が出ていますか？' }]); }}
            className="w-full flex items-center justify-between px-5 py-4 bg-card border border-border rounded-xl text-left hover:bg-muted transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Wrench className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold">故障・不具合</div>
                <div className="text-xs text-muted-foreground">エンジン不調・警告灯・パンクなど</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground">Chat VANサポート窓口（平日9:00〜18:00）</p>
          <a href="tel:0120-000-000" className="flex items-center justify-center gap-2 mt-2 text-primary font-semibold">
            <Phone className="h-4 w-4" />0120-000-000（仮）
          </a>
        </div>
      </div>
    );
  }

  const isAccident = mode === 'accident';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* ヘッダー */}
      <div className={`px-4 py-3 border-b border-border ${isAccident ? 'bg-red-50' : 'bg-blue-50'}`}>
        <button onClick={() => { setMode('select'); setMessages([]); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1">
          ← 戻る
        </button>
        <div className="flex items-center gap-2">
          {isAccident ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <Wrench className="h-5 w-5 text-blue-600" />}
          <h1 className="font-bold">{isAccident ? '事故報告' : '故障・不具合報告'}</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">AIが状況を確認します。情報が揃い次第、サポートチームへ通知されます。</p>
      </div>

      {done && (
        <div className="mx-4 mt-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">報告を受け付けました</p>
            <p className="text-xs text-green-600">サポートチームが確認次第ご連絡します。</p>
          </div>
        </div>
      )}

      {/* チャット */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-foreground text-background rounded-br-sm'
                : 'bg-card border border-border rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 入力エリア */}
      {!done && (
        <div className="p-4 border-t border-border bg-background">
          <div className="flex gap-2 items-end">
            <textarea
              className="flex-1 border border-border rounded-2xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[44px] max-h-32"
              placeholder="状況を入力..."
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-foreground text-background rounded-full flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            {isAccident ? '⚠️ けが人・危険な状況はまず110番・119番' : '🔧 実際の修理対応はレンタル会社が行います'}
          </p>
        </div>
      )}
    </div>
  );
}
