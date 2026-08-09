import React, { useState, useEffect } from 'react';
import { useGetMe, useUpdateUser } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey } from '@workspace/api-client-react';

function Field({
  label, value, onChange, type = 'text', placeholder = '', disabled = false
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={type === 'password' ? type : undefined}
        className={`w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors
          ${disabled ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-background focus:border-foreground/40'}`}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  );
}

function SaveButton({ pending, disabled }: { pending: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
    >
      {pending ? '保存中…' : '保存'}
    </button>
  );
}

export default function Settings() {
  const { data: user } = useGetMe();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Profile
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  // Billing
  const [billingAddress, setBillingAddress] = useState('');

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setCompanyName((user as any).companyName ?? '');
    setPhone((user as any).phone ?? '');
    setBillingAddress((user as any).billingAddress ?? '');
  }, [user]);

  const save = async (data: Record<string, string>) => {
    if (!user?.id) return;
    try {
      await updateUser.mutateAsync({ id: user.id, data });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: '保存しました' });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? '保存に失敗しました', variant: 'destructive' });
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    save({ name, companyName, phone });
  };

  const handleBillingSave = (e: React.FormEvent) => {
    e.preventDefault();
    save({ billingAddress });
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: '新しいパスワードが一致しません', variant: 'destructive' }); return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'パスワードは8文字以上にしてください', variant: 'destructive' }); return;
    }
    try {
      await updateUser.mutateAsync({ data: { currentPassword, newPassword } });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast({ title: 'パスワードを変更しました' });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? 'パスワードの変更に失敗しました', variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full px-4 py-10 space-y-10">
      <h1 className="text-xl font-semibold">設定</h1>

      {/* ── プロフィール ── */}
      <Section title="プロフィール">
        <form onSubmit={handleProfileSave} className="space-y-4">
          <Field label="メールアドレス" value={user?.email ?? ''} disabled />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="氏名" value={name} onChange={setName} placeholder="山田 太郎" />
            <Field label="会社名" value={companyName} onChange={setCompanyName} placeholder="株式会社〇〇" />
          </div>
          <Field label="電話番号" value={phone} onChange={setPhone} placeholder="090-0000-0000" type="tel" />
          <SaveButton pending={updateUser.isPending} />
        </form>
      </Section>

      <div className="border-t border-border" />

      {/* ── 請求先住所 ── */}
      <Section title="請求先">
        <form onSubmit={handleBillingSave} className="space-y-4">
          <Field
            label="請求先住所"
            value={billingAddress}
            onChange={setBillingAddress}
            placeholder="東京都渋谷区〇〇 1-2-3"
          />
          <SaveButton pending={updateUser.isPending} />
        </form>
      </Section>

      <div className="border-t border-border" />

      {/* ── パスワード変更 ── */}
      <Section title="パスワード変更">
        <form onSubmit={handlePasswordSave} className="space-y-4">
          <Field label="現在のパスワード" value={currentPassword} onChange={setCurrentPassword} type="password" />
          <Field label="新しいパスワード" value={newPassword} onChange={setNewPassword} type="password" />
          <Field label="新しいパスワード（確認）" value={confirmPassword} onChange={setConfirmPassword} type="password" />
          <SaveButton pending={updateUser.isPending} disabled={!currentPassword || !newPassword || !confirmPassword} />
        </form>
      </Section>

      <div className="pb-10" />
    </div>
  );
}
