import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, Clock, Mail, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

const TOPICS = [
  '車両情報の変更・訂正',
  '保険の更新・変更',
  '契約内容について',
  '支払い・精算について',
  'その他',
];

const inp = "w-full px-3 py-2 border border-input rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

export default function CompanyContact() {
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const body = topic ? `【${topic}】\n${message}` : message;
      const r = await fetch(API('/company/notify-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ message: body }),
      });
      if (r.ok) {
        toast({ title: '送信しました', description: '担当者より折り返しご連絡いたします。' });
        setMessage(''); setTopic('');
      } else {
        toast({ variant: 'destructive', title: '送信に失敗しました' });
      }
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">お問い合わせ</h1>
        <p className="text-sm text-muted-foreground mt-1">車両情報の変更・保険の更新・その他のご質問はこちらから。</p>
      </div>

      {/* フォーム */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />お問い合わせ内容
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">お問い合わせ種別</label>
            <select value={topic} onChange={e => setTopic(e.target.value)} className={inp}>
              <option value="">選択してください（任意）</option>
              {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">内容 <span className="text-red-500">*</span></label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="お問い合わせ内容を入力してください..."
              rows={6}
              className={`${inp} resize-none`}
            />
          </div>
          <button onClick={handleSend} disabled={sending || !message.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? '送信中...' : '送信する'}
          </button>
        </CardContent>
      </Card>

      {/* 連絡先 */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">直接連絡先</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span>info@sinjapan.jp</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">平日 9:00〜18:00</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
