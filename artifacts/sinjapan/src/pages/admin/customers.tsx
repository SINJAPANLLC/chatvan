import React, { useState, useEffect } from 'react';
import { useListUsers } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, X, Save, ChevronRight, Trash2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

/** Narrow view of backend user — the generated User type omits fields the server actually returns. */
type BackendUser = User & {
  companyName?: string | null;
  billingAddress?: string | null;
  creditStatus?: string | null;
  creditLimit?: string | number | null;
  creditUsed?: string | number | null;
  paymentTerms?: string | null;
  corporateNumber?: string | null;
  preferredPaymentMethod?: string | null;
  cardHolderName?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpiry?: string | null;
};

function roleLabel(role: string) {
  if (role === 'admin') return '管理者';
  if (role === 'rental_company') return '協力会社';
  return '一般';
}

function badge(role: string) {
  return role === 'admin'
    ? 'bg-foreground text-background'
    : 'bg-muted text-muted-foreground border border-border';
}

function creditBadge(status: string) {
  const map: Record<string, string> = {
    approved: 'bg-green-100 text-green-800 border-green-200',
    pending:  'bg-amber-100 text-amber-800 border-amber-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    suspended:'bg-red-100 text-red-800 border-red-200',
    none:     'bg-muted text-muted-foreground border border-border',
  };
  const label: Record<string, string> = {
    approved:'承認済', pending:'審査中', rejected:'否決', suspended:'停止', none:'未申請'
  };
  return { cls: map[status] || map.none, text: label[status] || status };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border/40 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-sm font-medium text-right">{value || '—'}</span>
    </div>
  );
}

export default function AdminCustomers() {
  const { data: rawUsers, isLoading } = useListUsers();
  const users = rawUsers as BackendUser[] | undefined;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<BackendUser | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ユーザー追加
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', companyName: '', phone: '', role: 'user', preferredPaymentMethod: 'card' });
  const setAdd = (k: string, v: string) => setAddForm(p => ({ ...p, [k]: v }));

  const handleAdd = async () => {
    if (!addForm.name || !addForm.email || !addForm.password) {
      toast({ variant: 'destructive', title: '氏名・メール・パスワードは必須です' });
      return;
    }
    setAdding(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '');
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setShowAdd(false);
      setAddForm({ name: '', email: '', password: '', companyName: '', phone: '', role: 'user', preferredPaymentMethod: 'card' });
      toast({ title: `ユーザー「${json.name}」を作成しました` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || '作成に失敗しました' });
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    if (selected) {
      setForm({
        name: selected.name || '',
        email: selected.email || '',
        companyName: selected.companyName || '',
        phone: selected.phone || '',
        role: selected.role || 'user',
        billingAddress: selected.billingAddress || '',
        creditStatus: selected.creditStatus || 'none',
        creditLimit: selected.creditLimit || '',
        paymentTerms: selected.paymentTerms || '',
        corporateNumber: selected.corporateNumber || '',
        preferredPaymentMethod: selected.preferredPaymentMethod || 'card',
      });
      setEditMode(false);
    }
  }, [selected]);

  const filtered = users?.filter(u => {
    const q = query.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      (u.companyName || '').toLowerCase().includes(q);
  });

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/users/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      queryClient.setQueryData(['/api/users'], (old: any[]) =>
        old?.map(u => u.id === updated.id ? updated : u)
      );
      setSelected(updated);
      setEditMode(false);
      toast({ title: '保存しました' });
    } catch {
      toast({ variant: 'destructive', title: '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const res = await fetch(`/api/users/${selected.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || '削除に失敗しました');
      queryClient.setQueryData(['/api/users'], (old: any[]) =>
        old?.filter(u => u.id !== selected.id)
      );
      setSelected(null);
      setConfirmDelete(false);
      toast({ title: 'ユーザーを削除しました' });
    } catch (error) {
      toast({ variant: 'destructive', title: error instanceof Error ? error.message : '削除に失敗しました' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">ユーザー管理</h1>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="名前・会社名・メールで検索..."
            className="pl-9 bg-card"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" />ユーザー追加
        </Button>
      </div>

      {/* ユーザー追加モーダル */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">ユーザーを追加</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <Field label="氏名 *">
                <Input value={addForm.name} onChange={e => setAdd('name', e.target.value)} placeholder="山田 太郎" />
              </Field>
              <Field label="メールアドレス *">
                <Input type="email" value={addForm.email} onChange={e => setAdd('email', e.target.value)} placeholder="example@example.com" />
              </Field>
              <Field label="パスワード *">
                <Input type="password" value={addForm.password} onChange={e => setAdd('password', e.target.value)} placeholder="初期パスワード" />
              </Field>
              <Field label="会社名">
                <Input value={addForm.companyName} onChange={e => setAdd('companyName', e.target.value)} placeholder="株式会社〇〇" />
              </Field>
              <Field label="電話番号">
                <Input value={addForm.phone} onChange={e => setAdd('phone', e.target.value)} placeholder="090-0000-0000" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="権限">
                  <Select value={addForm.role} onValueChange={v => setAdd('role', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">一般</SelectItem>
                      <SelectItem value="admin">管理者</SelectItem>
                      <SelectItem value="rental_company">協力会社</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="支払い方法">
                  <Select value={addForm.preferredPaymentMethod} onValueChange={v => setAdd('preferredPaymentMethod', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">カード</SelectItem>
                      <SelectItem value="invoice">請求書</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>キャンセル</Button>
              <Button className="flex-1 gap-1.5" onClick={handleAdd} disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                作成する
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* テーブル */}
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">氏名 / 会社名</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">メール</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">電話</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">権限</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">与信</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">登録日</th>
                <th className="px-5 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : !filtered?.length ? (
                <tr><td colSpan={8} className="py-16 text-center text-muted-foreground text-sm">ユーザーが見つかりません</td></tr>
              ) : filtered.map(user => {
                const credit = creditBadge(user.creditStatus || 'none');
                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(selected?.id === user.id ? null : user)}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${selected?.id === user.id ? 'bg-muted/40' : ''}`}
                  >
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">#{user.id}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium">{user.name}</div>
                      {user.companyName && <div className="text-xs text-muted-foreground mt-0.5">{user.companyName}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{user.email}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{user.phone || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge(user.role)}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${credit.cls}`}>
                        {credit.text}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {user.createdAt ? format(new Date(user.createdAt), 'yyyy/MM/dd') : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 右パネル — fixedスライドイン */}
        {selected && (
          <>
            {/* オーバーレイ背景 */}
            <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setSelected(null)} />
            <div className="fixed top-0 right-0 z-40 h-full w-full sm:w-[420px] bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-xs text-muted-foreground">{selected.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>編集</Button>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="ユーザーを削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>キャンセル</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      保存
                    </Button>
                  </>
                )}
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {editMode ? (
                <>
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">基本情報</p>
                    <Field label="氏名"><Input value={form.name} onChange={e => set('name', e.target.value)} /></Field>
                    <Field label="メール"><Input value={form.email} onChange={e => set('email', e.target.value)} /></Field>
                    <Field label="会社名"><Input value={form.companyName} onChange={e => set('companyName', e.target.value)} /></Field>
                    <Field label="電話番号"><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
                    <Field label="請求先住所"><Input value={form.billingAddress} onChange={e => set('billingAddress', e.target.value)} /></Field>
                    <Field label="権限">
                      <Select value={form.role} onValueChange={v => set('role', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">一般</SelectItem>
                          <SelectItem value="admin">管理者</SelectItem>
                          <SelectItem value="rental_company">協力会社</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">法人 / 与信</p>
                    <Field label="法人番号"><Input value={form.corporateNumber} onChange={e => set('corporateNumber', e.target.value)} /></Field>
                    <Field label="与信ステータス">
                      <Select value={form.creditStatus} onValueChange={v => set('creditStatus', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">未申請</SelectItem>
                          <SelectItem value="pending">審査中</SelectItem>
                          <SelectItem value="approved">承認済</SelectItem>
                          <SelectItem value="rejected">否決</SelectItem>
                          <SelectItem value="suspended">停止</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="与信枠（円）"><Input type="number" value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)} /></Field>
                    <Field label="支払いサイト"><Input value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} /></Field>
                    <Field label="支払い方法">
                      <Select value={form.preferredPaymentMethod} onValueChange={v => set('preferredPaymentMethod', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="card">カード</SelectItem>
                          <SelectItem value="invoice">請求書払い</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">基本情報</p>
                    <InfoRow label="氏名" value={selected.name} />
                    <InfoRow label="会社名" value={selected.companyName} />
                    <InfoRow label="メール" value={selected.email} />
                    <InfoRow label="電話" value={selected.phone} />
                    <InfoRow label="請求先住所" value={selected.billingAddress} />
                    <InfoRow label="権限" value={
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge(selected.role)}`}>
                        {roleLabel(selected.role)}
                      </span>
                    } />
                    <InfoRow label="登録日" value={selected.createdAt ? format(new Date(selected.createdAt), 'yyyy/MM/dd HH:mm') : '—'} />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">法人 / 与信</p>
                    <InfoRow label="法人番号" value={selected.corporateNumber} />
                    <InfoRow label="与信ステータス" value={(() => {
                      const c = creditBadge(selected.creditStatus || 'none');
                      return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`}>{c.text}</span>;
                    })()} />
                    <InfoRow label="与信枠" value={selected.creditLimit ? `¥ ${Number(selected.creditLimit).toLocaleString('ja-JP')}` : null} />
                    <InfoRow label="与信使用額" value={selected.creditUsed ? `¥ ${Number(selected.creditUsed).toLocaleString('ja-JP')}` : null} />
                    <InfoRow label="支払いサイト" value={selected.paymentTerms} />
                    <InfoRow label="支払い方法" value={selected.preferredPaymentMethod === 'invoice' ? '請求書払い' : 'カード'} />
                  </div>

                  {selected.cardLast4 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">カード情報</p>
                      <InfoRow label="カード名義" value={selected.cardHolderName} />
                      <InfoRow label="カード番号" value={`${selected.cardBrand || ''} **** ${selected.cardLast4}`} />
                      <InfoRow label="有効期限" value={selected.cardExpiry} />
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </>
        )}
      {/* 削除確認ダイアログ */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{selected?.name}</span>（{selected?.email}）と、このユーザーに紐づく申込・契約・請求・通知などの関連データを削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
