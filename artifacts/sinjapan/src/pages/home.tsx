import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useStartVanChat, useGetMe } from '@workspace/api-client-react';
import { Loader2, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DRAFT_KEY = 'sinjapan_van_draft_message';
const EXAMPLES = [
  "神奈川で来週から軽バンかりたい",
];

export default function Home() {
  const [text, setText] = useState(() => localStorage.getItem(DRAFT_KEY) || '');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: user } = useGetMe();
  const startVanChat = useStartVanChat();
  const isSubmitting = startVanChat.isPending;

  useEffect(() => {
    if (user) localStorage.removeItem(DRAFT_KEY);
  }, [user]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;

    try {
      const chatRes = await startVanChat.mutateAsync({ data: { message: text } });
      localStorage.removeItem(DRAFT_KEY);
      setLocation(`/van/${chatRes.applicationId}`);
    } catch {
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: '申し訳ありません。もう一度お試しください。',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 max-w-3xl mx-auto w-full min-h-[calc(100dvh-100px)]">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground mb-4 tracking-tight text-balance text-center">
        チャットするだけ。軽バンかりれる。
      </h1>
      <p className="text-muted-foreground mb-12 text-center text-balance">
        希望条件をチャットで教えてください。あなたに合った軽バンをご提案します。
      </p>

      <div className="w-full">
        <div className="relative bg-muted rounded-2xl border border-border shadow-sm hover:border-foreground/20 transition-colors focus-within:border-foreground/30">
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="どんな軽バンをお探しですか？"
              rows={1}
              disabled={isSubmitting}
              className="flex-1 bg-transparent outline-none resize-none text-base text-foreground placeholder:text-muted-foreground leading-relaxed min-h-[28px] max-h-[200px] disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-end px-3 pb-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || isSubmitting}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground text-background disabled:bg-muted disabled:text-muted-foreground transition-colors hover:opacity-90"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">よくある条件から選ぶ</span>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLES.map((example, i) => (
              <button
                key={i}
                onClick={() => { setText(example); textareaRef.current?.focus(); }}
                className="px-4 py-2 rounded-full border border-border bg-background text-sm text-foreground hover:bg-muted transition-all duration-150"
                disabled={isSubmitting}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
