import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';
import { useToast } from '@/hooks/use-toast';

export default function CompanyContact() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const r = await fetch(API('/company/notify-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message }),
      });
      if (r.ok) {
        toast({ title: '送信しました', description: 'SIN JAPANに通知されました。' });
        setMessage('');
      } else {
        toast({ title: 'エラー', variant: 'destructive' });
      }
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">SIN JAPANへ問い合わせ</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        車両情報の変更・保険の更新・その他お問い合わせはこちらからご連絡ください。
        管理者に通知が届きます。
      </p>

      <div className="space-y-3">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="お問い合わせ内容を入力してください..."
          rows={6}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Send className="h-4 w-4" />
          {sending ? '送信中...' : '送信する'}
        </button>
      </div>

      <div className="mt-6 p-4 bg-muted/50 rounded-xl text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">直接連絡先</p>
        <p>📧 info@sinjapan.jp</p>
        <p>🕐 平日 9:00〜18:00</p>
      </div>
    </div>
  );
}
