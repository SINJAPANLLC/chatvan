import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useListVanMessages, useSendVanMessage, useGetVanApplication } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Loader2, Car, CheckCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

// Status labels for user-facing display
const STATUS_LABELS: Record<string, string> = {
  hearing: '相談受付中',
  vehicle_search: '車両確認中',
  proposal_sent: '提案送信済',
  proposal_accepted: '提案確定',
  kyc_pending: '本人確認待ち',
  screening: '審査中',
  contract_pending: '契約待ち',
  contracting: '契約手続き中',
  active: '利用中',
  return_scheduled: '返却予定',
  completed: '完了',
  rejected: '却下',
};

interface ProposedVehicle {
  id: number;
  maker?: string;
  model?: string;
  grade?: string;
  year?: number;
  prefecture?: string;
  monthlyPrice: number;
  sinJapanFee?: number;
  insuranceFee?: number;
  minPeriodMonths?: number;
  availableFrom?: string;
  imageUrl?: string;
  rentalCompany?: { name?: string };
}

function ProposalCard({ vehicles, onAccept, applicationId }: { vehicles: ProposedVehicle[]; onAccept: (v: ProposedVehicle) => void; applicationId: number }) {
  const [accepting, setAccepting] = useState<number | null>(null);

  const handleAccept = async (v: ProposedVehicle) => {
    setAccepting(v.id);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`/api/van/applications/${applicationId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ vehicleId: v.id }),
      });
      if (r.ok) onAccept(v);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="w-full max-w-[85%] rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-b from-primary/5 to-background shadow-md rounded-bl-sm">
      <div className="bg-primary/10 px-4 py-3 border-b border-primary/15 flex items-center gap-2">
        <Car className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm text-primary">おすすめ車両をご提案します</span>
        <span className="text-xs text-primary/70 ml-auto">{vehicles.length}台</span>
      </div>
      <div className="divide-y divide-border/50">
        {vehicles.map((v) => {
          const totalPrice = Number(v.monthlyPrice) + Number(v.sinJapanFee ?? 0) + Number(v.insuranceFee ?? 0);
          return (
            <div key={v.id} className="p-4">
              <div className="flex gap-3 items-start">
                {v.imageUrl ? (
                  <img src={v.imageUrl} alt={`${v.maker} ${v.model}`} className="w-20 h-16 object-cover rounded-lg shrink-0 bg-muted" />
                ) : (
                  <div className="w-20 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Car className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{v.maker} {v.model}{v.grade ? ` (${v.grade})` : ''}</p>
                  <p className="text-xs text-muted-foreground">{v.year ? `${v.year}年式` : ''} {v.prefecture ?? ''}</p>
                  <p className="text-xs text-muted-foreground">{v.rentalCompany?.name}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-base font-bold text-primary">¥{totalPrice.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/月</span></span>
                    <span className="text-xs text-muted-foreground">最低{v.minPeriodMonths ?? 1}ヶ月〜</span>
                  </div>
                  {v.availableFrom && <p className="text-xs text-muted-foreground mt-0.5">利用開始: {v.availableFrom}</p>}
                </div>
              </div>
              <button
                onClick={() => handleAccept(v)}
                disabled={accepting !== null}
                className="mt-3 w-full py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {accepting === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                この車両で申し込む
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function VanChat() {
  const [, params] = useRoute('/van/:id');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [message, setMessage] = useState('');
  const [accepted, setAccepted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, refetch } = useListVanMessages(applicationId, {
    query: {
      enabled: !!applicationId,
      refetchInterval: 3000,
    }
  });

  const { data: application, refetch: refetchApp } = useGetVanApplication(applicationId, {
    query: {
      enabled: !!applicationId,
      refetchInterval: 5000,
    }
  });

  const sendVanMessage = useSendVanMessage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendVanMessage.isPending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [message]);

  const doSend = async (text: string) => {
    if (!text.trim() || !applicationId || sendVanMessage.isPending) return;
    setMessage('');
    try {
      await sendVanMessage.mutateAsync({ id: applicationId, data: { message: text } });
      await refetch();
    } catch {
      setMessage(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      doSend(message);
    }
  };

  const handleAccept = async (v: ProposedVehicle) => {
    setAccepted(true);
    await refetchApp();
    queryClient.invalidateQueries({ queryKey: ['van-application', applicationId] });
  };

  const status = application?.status;
  const proposedVehicles: ProposedVehicle[] = (application as any)?.proposedVehicles ?? [];
  const showProposalCard = (status === 'proposal_sent' || status === 'proposal_accepted') && proposedVehicles.length > 0;

  const lastAiIndex = messages
    ? [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'assistant').pop()?.i
    : undefined;
  const lastMsgIsAi = messages && messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant';

  const isPostAccept = status && ['kyc_pending', 'screening', 'contract_pending', 'contracting', 'active'].includes(status);

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full h-[calc(100dvh-120px)] relative">
      
      {/* Status bar */}
      {status && status !== 'hearing' && (
        <div className="bg-muted/70 backdrop-blur-sm px-4 py-2 flex items-center gap-2 border-b border-border/50 shrink-0">
          <span className="text-xs text-muted-foreground">ステータス:</span>
          <span className="text-xs font-semibold text-foreground">{STATUS_LABELS[status] || status}</span>
          {isPostAccept && (
            <button onClick={() => setLocation('/mypage')} className="ml-auto text-xs text-primary flex items-center gap-1 hover:underline">
              マイページを見る <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages?.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isLastAi = idx === lastAiIndex && lastMsgIsAi;
          const options = isLastAi && msg.options ? msg.options : [];

          return (
            <div key={msg.id} className="flex flex-col">
              <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm",
                  isUser
                    ? "bg-foreground text-background rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm border border-border/50"
                )}>
                  {isUser ? (
                    msg.content
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1.5 prose-li:my-0 prose-strong:font-semibold prose-strong:text-foreground prose-headings:text-foreground text-foreground">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>

              {options.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-start">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => doSend(opt)}
                      disabled={sendVanMessage.isPending}
                      className="px-4 py-2.5 rounded-full border border-border text-sm font-medium text-foreground bg-background hover:bg-muted transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Inline Proposal Card */}
        {showProposalCard && !accepted && (
          <div className="flex w-full justify-start">
            <ProposalCard
              vehicles={proposedVehicles}
              onAccept={handleAccept}
              applicationId={applicationId}
            />
          </div>
        )}

        {/* Accepted confirmation */}
        {(accepted || isPostAccept) && (
          <div className="flex w-full justify-start">
            <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-green-50 border border-green-200 text-green-900 text-sm rounded-bl-sm shadow-sm">
              <p className="font-semibold mb-1">申し込みを受け付けました ✓</p>
              <p className="text-xs text-green-700">担当スタッフが確認し、本人確認・審査の手続きをご案内します。マイページで進捗を確認できます。</p>
              <button onClick={() => setLocation('/mypage')} className="mt-2 text-xs font-semibold text-green-800 underline underline-offset-2">マイページを確認する →</button>
            </div>
          </div>
        )}

        {sendVanMessage.isPending && (
          <div className="flex w-full justify-start">
            <div className="rounded-2xl px-5 py-4 bg-muted border border-border/50 text-foreground rounded-bl-sm flex items-center gap-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input area - hide when post-accept */}
      {!isPostAccept && (
        <div className="px-4 py-4 shrink-0 bg-background/80 backdrop-blur-md border-t border-border/50">
          <div className="relative bg-muted rounded-2xl border border-border focus-within:border-foreground/30 transition-colors shadow-sm">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力..."
              rows={1}
              disabled={sendVanMessage.isPending}
              className="w-full bg-transparent outline-none resize-none text-[15px] text-foreground placeholder:text-muted-foreground leading-relaxed px-4 pt-3.5 pb-2 min-h-[52px] max-h-[160px] disabled:opacity-50"
            />
            <div className="flex justify-end px-3 pb-2.5">
              <button
                onClick={() => doSend(message)}
                disabled={!message.trim() || sendVanMessage.isPending}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background disabled:bg-muted-foreground/20 disabled:text-muted-foreground transition-colors hover:opacity-90"
              >
                {sendVanMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
