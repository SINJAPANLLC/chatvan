import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useStartAiChat, useGetMe } from '@workspace/api-client-react';
import { Loader2, Mic, Plus, ArrowUp, X, FileText, MicOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DRAFT_KEY = 'sinjapan_draft_message';
const EXAMPLES = ["明日の午後、東京から大阪までパレットを20枚運びたい。"];

// Web Speech API type
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function Home() {
  const [text, setText] = useState(() => localStorage.getItem(DRAFT_KEY) || '');
  const [files, setFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const { data: user } = useGetMe();
  const startAiChat = useStartAiChat();
  const isSubmitting = startAiChat.isPending;

  useEffect(() => {
    if (user) localStorage.removeItem(DRAFT_KEY);
  }, [user]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [text]);

  // ── File upload ──────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...selected]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ── Voice input ──────────────────────────────────────
  const toggleRecording = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: '音声入力非対応', description: 'このブラウザは音声入力に対応していません。' });
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ja-JP';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => setIsRecording(true);
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => {
      setIsRecording(false);
      toast({ title: '音声入力エラー', description: 'もう一度お試しください。' });
    };
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setText(prev => (prev ? prev + ' ' + transcript : transcript));
      textareaRef.current?.focus();
    };

    recognitionRef.current = rec;
    rec.start();
  }, [isRecording, toast]);

  // ── Submit ───────────────────────────────────────────
  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;

    if (!user) {
      localStorage.setItem(DRAFT_KEY, text);
      setLocation('/register');
      return;
    }

    try {
      // Append file names to the message so AI has context
      let message = text;
      if (files.length > 0) {
        message += '\n\n[添付ファイル: ' + files.map(f => f.name).join(', ') + ']';
      }
      const chatRes = await startAiChat.mutateAsync({ data: { message } });
      localStorage.removeItem(DRAFT_KEY);
      setFiles([]);
      setLocation(`/chat/${chatRes.shipmentId}`);
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 max-w-3xl mx-auto w-full">

      {/* Greeting */}
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground mb-16 tracking-tight text-balance">
        チャットするだけ。荷物が運べる。
      </h1>

      {/* Input card */}
      <div className="w-full">
        <div className="relative bg-muted rounded-2xl border border-border/60 shadow-sm hover:border-border transition-colors focus-within:border-border/80">

          {/* Attached files */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="max-w-[160px] truncate text-foreground">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="flex items-start gap-3 px-4 pt-4 pb-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="運びたい荷物を教えてください"
              rows={1}
              disabled={isSubmitting}
              className="flex-1 bg-transparent outline-none resize-none text-base text-foreground placeholder:text-muted-foreground leading-relaxed min-h-[28px] max-h-[200px] disabled:opacity-50"
            />
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-between px-3 pb-3">
            <div className="flex items-center gap-1">
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-background/70 transition-colors"
                disabled={isSubmitting}
                title="ファイルを添付"
              >
                <Plus className="h-5 w-5" />
              </button>

              {/* Voice input */}
              <button
                type="button"
                onClick={toggleRecording}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
                  isRecording
                    ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                }`}
                disabled={isSubmitting}
                title={isRecording ? '録音停止' : '音声入力'}
              >
                {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || isSubmitting}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-foreground text-background disabled:bg-muted-foreground/30 disabled:text-muted-foreground transition-colors hover:opacity-90"
            >
              {isSubmitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowUp className="h-4 w-4" />
              }
            </button>
          </div>
        </div>

        {/* Example chip */}
        <div className="mt-10 flex flex-wrap gap-2 justify-center">
          {EXAMPLES.map((example, i) => (
            <button
              key={i}
              onClick={() => { setText(example); textareaRef.current?.focus(); }}
              className="px-4 py-2 rounded-full border border-border/60 text-sm text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border transition-all duration-150"
              disabled={isSubmitting}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
