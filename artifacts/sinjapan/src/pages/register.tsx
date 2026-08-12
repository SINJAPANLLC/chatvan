import React from 'react';
import { useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRegister, useGetMe, useStartVanChat } from '@workspace/api-client-react';

const DRAFT_KEY = 'sinjapan_van_draft_message';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  name: z.string().min(1, '氏名を入力してください'),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('正しいメールアドレスを入力してください'),
  password: z.string().min(6, '6文字以上で入力してください')
});

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const register = useRegister();
  const startVanChat = useStartVanChat();
  
  const { data: user, isLoading } = useGetMe();
  
  React.useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'admin') setLocation('/admin');
      else setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', companyName: '', phone: '', email: '', password: '' }
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    try {
      const res = await register.mutateAsync({ data });
      if ((res as any).token) {
        localStorage.setItem('sinjapan_auth_token', (res as any).token);
      }
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const chatRes = await startVanChat.mutateAsync({ data: { message: draft } });
          localStorage.removeItem(DRAFT_KEY);
          setLocation(`/van/${chatRes.applicationId}`);
          return;
        } catch {
          // 失敗してもトップに戻る
        }
      }
      setLocation('/');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "登録失敗",
        description: "エラーが発生しました。別のメールアドレスをお試しください。"
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
          <h1 className="text-xl font-medium tracking-tight">新規アカウント登録</h1>
        </div>

        <div className="bg-card border border-border p-6 sm:p-8 rounded-xl shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>氏名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="山田 太郎" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>会社名</FormLabel>
                    <FormControl>
                      <Input placeholder="株式会社◯◯" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話番号</FormLabel>
                    <FormControl>
                      <Input placeholder="090-0000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              <Button type="submit" className="w-full mt-2" disabled={register.isPending}>
                {register.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                登録する
              </Button>
            </form>
          </Form>
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <div>
            すでにアカウントをお持ちですか？{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              ログイン
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
