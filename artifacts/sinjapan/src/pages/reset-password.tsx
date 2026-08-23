import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('パスワードが一致しません'); return; }
    if (password.length < 6) { setError('6文字以上で入力してください'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'リセットに失敗しました'); return; }
      setDone(true);
      setTimeout(() => setLocation('/login'), 3000);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="font-medium">無効なリンクです</p>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">パスワードリセットをやり直す</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex justify-center mb-2">
            <img src="/logo.png" alt="Chat VAN" className="h-8 w-auto" />
          </Link>
          <h1 className="text-xl font-medium tracking-tight">新しいパスワードの設定</h1>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 rounded-xl shadow-sm">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm font-medium">パスワードを変更しました</p>
              <p className="text-xs text-muted-foreground">3秒後にログイン画面へ移動します…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>新しいパスワード</Label>
                <Input type="password" placeholder="6文字以上" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>パスワード（確認）</Label>
                <Input type="password" placeholder="もう一度入力" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                パスワードを変更する
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
