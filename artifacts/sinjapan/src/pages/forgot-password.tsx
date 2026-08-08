import React, { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '送信に失敗しました');
        return;
      }
      setSent(true);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex justify-center mb-2">
            <img src="/logo.jpg" alt="Chat LOGI" className="h-8 w-auto" />
          </Link>
          <h1 className="text-xl font-medium tracking-tight">パスワードをお忘れの方</h1>
          {!sent && <p className="text-sm text-muted-foreground">登録済みのメールアドレスを入力してください。<br />パスワードリセット用のリンクをお送りします。</p>}
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 rounded-xl shadow-sm">
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm font-medium">メールを送信しました</p>
              <p className="text-xs text-muted-foreground">{email} 宛にパスワードリセットのリンクを送りました。メールをご確認ください。</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>メールアドレス</Label>
                <Input
                  type="email"
                  placeholder="example@domain.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                リセットリンクを送信
              </Button>
            </form>
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">ログインに戻る</Link>
        </div>
      </div>
    </div>
  );
}
