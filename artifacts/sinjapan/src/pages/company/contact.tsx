import { useState } from 'react';
import { Send, Mail, Clock, Loader2, Phone, MapPin, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

export default function CompanyContact() {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const inp = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

  const handleSend = async () => {
    if (!message.trim()) {
      toast({ variant: 'destructive', title: '内容を入力してください' });
      return;
    }
    setSending(true);
    try {
      const r = await fetch(API('/company/notify-admin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message }),
      });
      if (r.ok) {
        toast({ title: '送信しました', description: '担当者より折り返しご連絡いたします。' });
        setMessage('');
      } else {
        toast({ variant: 'destructive', title: '送信に失敗しました' });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">お問い合わせ</h1>
        <p className="text-muted-foreground text-sm mt-1">
          車両情報の変更・保険の更新・その他のご質問はこちらからご連絡ください。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左: 送信連絡先 */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <p className="font-semibold text-sm">合同会社SIN JAPAN</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-muted-foreground leading-relaxed">〒243-0303<br />神奈川県愛甲郡愛川町<br />中津7287</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <a href="tel:0505526-9906" className="hover:underline">050-5526-9906</a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <a href="mailto:info@sinjapan.jp" className="hover:underline">info@sinjapan.jp</a>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span>平日 9:00〜18:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右: 本文 */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-5 space-y-4 flex flex-col">
          <p className="font-semibold text-sm">お問い合わせ内容</p>

          <div className="space-y-1.5 flex-1 flex flex-col">
            <label className="text-xs text-muted-foreground">
              内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="お問い合わせ内容を入力してください..."
              rows={8}
              className={`${inp} resize-none flex-1 min-h-[200px] font-sans`}
            />
          </div>

          <div className="bg-muted/30 border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">送信後について</p>
            <p>担当者が内容を確認し、通常2営業日以内にご返信いたします。</p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? '送信中...' : '送信する'}
          </button>
        </div>
      </div>
    </div>
  );
}
