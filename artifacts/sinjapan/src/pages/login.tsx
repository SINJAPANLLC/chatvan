import React from 'react';
import { useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin, useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  email: z.string().email('正しいメールアドレスを入力してください'),
  password: z.string().min(6, '6文字以上で入力してください')
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const queryClient = useQueryClient();

  // Check if already logged in
  const { data: user, isLoading } = useGetMe();
  
  React.useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'admin') setLocation('/admin');
      else if (user.role === 'rental_company') setLocation('/company');
      else setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' }
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      const res = await login.mutateAsync({ data });
      // Store token for Bearer auth (cookie-independent)
      if ((res as any).token) {
        localStorage.setItem('sinjapan_auth_token', (res as any).token);
      }
      // キャッシュにユーザーを即セット（遷移先で isLoading=false&&user=null になるのを防ぐ）
      queryClient.setQueryData(getGetMeQueryKey(), res.user);
      if (res.user.role === 'admin') setLocation('/admin');
      else if (res.user.role === 'rental_company') setLocation('/company');
      else setLocation('/');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "ログイン失敗",
        description: "メールアドレスまたはパスワードが間違っています。"
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/10">
      <div className="w-full max-w-md space-y-8 my-8">
        <div className="text-center">
          <Link href="/" className="inline-flex justify-center mb-2">
            <img src="/logo.jpg" alt="Chat VAN" className="h-8 w-auto" />
          </Link>
          <h1 className="text-xl font-medium tracking-tight">ログイン</h1>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 rounded-xl shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>メールアドレス <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="example@domain.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>パスワード <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="6文字以上" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full mt-2 bg-black text-white hover:bg-black/90" disabled={login.isPending}>
                {login.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                ログイン
              </Button>
            </form>
          </Form>
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-3">
          <div>
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              パスワードをお忘れの方
            </Link>
          </div>
          <div>
            アカウントをお持ちでないですか？{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              新規登録
            </Link>
          </div>
          <div>
            レンタル会社様の新規登録は{' '}
            <Link href="/company/register" className="font-medium text-primary hover:underline">
              こちら
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
