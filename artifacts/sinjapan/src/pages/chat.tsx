import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useListConversations, useSendMessage, useGetShipment, getGetShipmentQueryKey, getListConversationsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export default function Chat() {
  const [, params] = useRoute('/chat/:id');
  const shipmentId = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations, refetch } = useListConversations(shipmentId, {
    query: {
      enabled: !!shipmentId,
      queryKey: getListConversationsQueryKey(shipmentId),
      refetchInterval: 2000,
    }
  });

  const { data: shipment } = useGetShipment(shipmentId, {
    query: {
      enabled: !!shipmentId,
      queryKey: getGetShipmentQueryKey(shipmentId),
      refetchInterval: 2000,
    }
  });

  const sendMessage = useSendMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations, sendMessage.isPending]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [message]);

  // Navigate to proposal if status changes — but skip if we just came from "条件を変更する"
  useEffect(() => {
    if (!shipment) return;
    const isComplete = shipment.status === '見積提示' || shipment.status === '顧客承認' || shipment.status === '手配中';
    if (!isComplete) return;

    const key = `modifying_${shipmentId}`;
    if (sessionStorage.getItem(key)) {
      sessionStorage.removeItem(key);
      return; // skip redirect once; status reset is happening in background
    }

    // キャッシュを無効化してから遷移（古いキャッシュが提案ページに渡るのを防ぐ）
    queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
    setLocation(`/proposal/${shipmentId}`);
  }, [shipment?.status, shipmentId, setLocation, queryClient]);

  const doSend = async (text: string) => {
    if (!text.trim() || !shipmentId || sendMessage.isPending) return;
    setMessage('');
    try {
      const res = await sendMessage.mutateAsync({ id: shipmentId, data: { message: text } });
      await refetch();
      if (res.isComplete) {
        // 提案データがDBに書き込まれた後にキャッシュを無効化して遷移
        await queryClient.invalidateQueries({ queryKey: getGetShipmentQueryKey(shipmentId) });
        setLocation(`/proposal/${shipmentId}`);
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

  // Parse options from structuredData
  const getOptions = (msg: any): string[] => {
    if (!msg.structuredData) return [];
    try {
      const data = typeof msg.structuredData === 'string'
        ? JSON.parse(msg.structuredData)
        : msg.structuredData;
      return Array.isArray(data.options) ? data.options : [];
    } catch {
      return [];
    }
  };

  // Only show options on the last AI message (before user replies again)
  const lastAiIndex = conversations
    ? [...conversations].map((m, i) => ({ m, i })).filter(({ m }) => m.sender === 'ai').pop()?.i
    : undefined;
  const lastMsgIsAi = conversations && conversations.length > 0 &&
    conversations[conversations.length - 1].sender === 'ai';

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {conversations?.map((msg, idx) => {
          const isUser = msg.sender === 'user';
          const isLastAi = idx === lastAiIndex && lastMsgIsAi;
          const options = isLastAi ? getOptions(msg) : [];

          return (
            <div key={msg.id} className="flex flex-col">
              <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                  isUser
                    ? "bg-foreground text-background rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                )}>
                  {isUser ? (
                    msg.message
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1.5 prose-li:my-0 prose-strong:font-semibold prose-strong:text-foreground prose-headings:text-foreground">
                      <ReactMarkdown>{msg.message}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick-reply option buttons */}
              {options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-start pl-0">
                  {options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => doSend(opt)}
                      disabled={sendMessage.isPending}
                      className="px-4 py-2 rounded-full border border-border text-sm text-foreground bg-background hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Thinking indicator */}
        {sendMessage.isPending && (
          <div className="flex w-full justify-start">
            <div className="rounded-2xl px-4 py-3 bg-muted text-foreground rounded-tl-sm flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="relative bg-muted rounded-2xl border border-border/60 focus-within:border-border/80 transition-colors">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            rows={1}
            disabled={sendMessage.isPending}
            className="w-full bg-transparent outline-none resize-none text-[15px] text-foreground placeholder:text-muted-foreground leading-relaxed px-4 pt-3.5 pb-2 min-h-[52px] max-h-[160px] disabled:opacity-50"
          />
          <div className="flex justify-end px-3 pb-2.5">
            <button
              onClick={() => doSend(message)}
              disabled={!message.trim() || sendMessage.isPending}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background disabled:bg-muted-foreground/30 disabled:text-muted-foreground transition-colors hover:opacity-90"
            >
              {sendMessage.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowUp className="h-4 w-4" />
              }
            </button>
          </div>
        </div>
        <p className="text-center mt-2 text-xs text-muted-foreground">Chat LOGIが最適な配送プランをご提案します。</p>
      </div>
    </div>
  );
}
