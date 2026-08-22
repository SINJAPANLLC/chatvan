import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useListVanMessages, getListVanMessagesQueryKey, useSendVanMessage, useGetVanApplication, getGetVanApplicationQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export default function VanChat() {
  const [, params] = useRoute('/van/:id');
  const applicationId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages, refetch } = useListVanMessages(applicationId, {
    query: {
      queryKey: getListVanMessagesQueryKey(applicationId),
      enabled: !!applicationId,
      refetchInterval: 2000,
    }
  });

  const { data: application } = useGetVanApplication(applicationId, {
    query: {
      queryKey: getGetVanApplicationQueryKey(applicationId),
      enabled: !!applicationId,
      refetchInterval: 2000,
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

  useEffect(() => {
    if (!application) return;
    const isComplete = application.status === 'proposed' || application.status === 'application_received' || application.status === 'contracting' || application.status === 'active';
    if (!isComplete) return;

    const key = `modifying_van_${applicationId}`;
    if (sessionStorage.getItem(key)) {
      sessionStorage.removeItem(key);
      return;
    }
    
    // Optionally auto-redirect, or let the user click the banner
    // setLocation(`/van/${applicationId}/proposal`);
  }, [application?.status, applicationId, setLocation]);

  const doSend = async (text: string) => {
    if (!text.trim() || !applicationId || sendVanMessage.isPending) return;
    setMessage('');
    try {
      const res = await sendVanMessage.mutateAsync({ id: applicationId, data: { message: text } });
      await refetch();
      if (res.isComplete) {
        setLocation(`/van/${applicationId}/proposal`);
      }
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

  const lastAiIndex = messages
    ? [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'assistant').pop()?.i
    : undefined;
  const lastMsgIsAi = messages && messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant';

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full h-[calc(100dvh-120px)] relative">
      
      {application?.status === 'proposed' && (
        <div className="bg-primary text-primary-foreground p-4 flex items-center justify-between shadow-sm border-b border-primary/20 shrink-0 cursor-pointer hover:bg-primary/90 transition-colors" onClick={() => setLocation(`/van/${applicationId}/proposal`)}>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            <span className="font-medium">車両の提案が届いています</span>
          </div>
          <span className="text-sm underline underline-offset-2">確認する</span>
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
    </div>
  );
}
