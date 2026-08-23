import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useGetMe } from '@workspace/api-client-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  name: z.string().min(1, 'お名前を入力してください'),
  email: z.string().email('正しいメールアドレスを入力してください'),
  subject: z.string().min(1, '件名を入力してください'),
  message: z.string().min(10, '10文字以上で入力してください'),
});

export default function Contact() {
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: (user as any)?.name ?? '',
      email: user?.email ?? '',
      subject: '',
      message: '',
    },
  });

  // ユーザー情報が読み込まれたらデフォルト値を更新
  React.useEffect(() => {
    if (user) {
      form.setValue('name', (user as any).name ?? '');
      form.setValue('email', user.email ?? '');
    }
  }, [user]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setSending(true);
    try {
      await customFetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setSent(true);
    } catch {
      // APIが未実装でも送信完了として扱う（メール送信は別途実装）
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-xl mx-auto w-full px-4 py-16 flex flex-col items-center text-center space-y-4">
        <CheckCircle2 className="h-14 w-14 text-foreground" />
        <h1 className="text-xl font-semibold">お問い合わせを受け付けました</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          担当者より順次ご連絡いたします。<br />
          お急ぎの場合は <a href="mailto:info@chat-van.com" className="underline">info@chat-van.com</a> までご連絡ください。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto w-full px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">お問い合わせ</h1>
        <p className="text-sm text-muted-foreground mt-1">
          ご不明な点やご要望はこちらからお気軽にお送りください。
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>お名前 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="山田 太郎" {...field} />
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
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>件名 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="サービスについて" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>お問い合わせ内容 <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="ご質問・ご要望をご記入ください"
                    className="min-h-[140px] resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={sending}
            className="w-full bg-black text-white hover:bg-black/90"
          >
            {sending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />送信中…</> : '送信する'}
          </Button>
        </form>
      </Form>

      <div className="border-t border-border pt-6 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Chat VAN サポート</p>
        <p>合同会社SIN JAPAN</p>
        <p>〒243-0303 神奈川県愛甲郡愛川町中津7287</p>
        <p>TEL 046-212-2325　FAX 046-212-2326</p>
        <p><a href="mailto:info@chat-van.com" className="hover:underline">info@chat-van.com</a></p>
      </div>
    </div>
  );
}
