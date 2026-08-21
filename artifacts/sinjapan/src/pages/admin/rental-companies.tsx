import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Edit, Trash2, Building2, Save, Mail, CheckCircle, XCircle, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BASE = () => `${import.meta.env.BASE_URL}api`;
const tok = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const hdrs = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

type BankInfo = { bankName: string; branchName: string; accountType: string; accountNumber: string; accountHolder: string };
const BANK_DEF: BankInfo = { bankName: '', branchName: '', accountType: '普通', accountNumber: '', accountHolder: '' };
const parseBank = (raw?: string | null): BankInfo => { try { return { ...BANK_DEF, ...JSON.parse(raw ?? '') }; } catch { return { ...BANK_DEF }; } };
const encodeBank = (b: BankInfo) => JSON.stringify(b);

const STATUS_LABEL: Record<string, string> = {
  prospect: '申請中', reviewing: '審査中', active: '承認済', suspended: '停止中', terminated: '解約済',
};
const STATUS_COLOR: Record<string, string> = {
  prospect:   'bg-gray-100 text-gray-600',
  reviewing:  'bg-amber-100 text-amber-700',
  active:     'bg-green-100 text-green-700',
  suspended:  'bg-red-100 text-red-700',
  terminated: 'bg-zinc-100 text-zinc-600',
};

const TABS = ['全て', '申請中', '承認済', '停止中'] as const;
type Tab = typeof TABS[number];
const TAB_STATUS: Record<Tab, string | null> = {
  '全て': null, '申請中': 'prospect', '承認済': 'active', '停止中': 'suspended',
};

export default function AdminRentalCompanies() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('全て');
  const [changingStatus, setChangingStatus] = useState<number | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ name: '', contactPerson: '', phone: '', email: '', address: '', serviceArea: '', notes: '', fleetSize: '' });
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [inviteCompany, setInviteCompany] = useState<any | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE()}/van/rental-companies`, { headers: hdrs() });
      const d = await r.json();
      setCompanies(Array.isArray(d) ? d : []);
    } catch { toast({ variant: 'destructive', title: '読み込み失敗' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabCount = (t: Tab) => {
    const s = TAB_STATUS[t];
    if (!s) return companies.length;
    return companies.filter(c => t === '停止中' ? (c.status === 'suspended' || c.status === 'terminated') : c.status === s).length;
  };

  const filtered = (() => {
    const s = TAB_STATUS[tab];
    if (!s) return companies;
    if (tab === '停止中') return companies.filter(c => c.status === 'suspended' || c.status === 'terminated');
    return companies.filter(c => c.status === s);
  })();

  const changeStatus = async (id: number, status: string) => {
    setChangingStatus(id);
    try {
      const r = await fetch(`${BASE()}/van/rental-companies/${id}/status`, {
        method: 'PATCH', headers: hdrs(), body: JSON.stringify({ status }),
      });
      if (r.ok) { toast({ title: 'ステータスを変更しました' }); load(); }
      else { const j = await r.json(); toast({ variant: 'destructive', title: j.error ?? 'エラー' }); }
    } finally { setChangingStatus(null); }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', serviceArea: '', notes: '', fleetSize: '' });
    setNewPassword(''); setIsModalOpen(true);
  };

  const handleOpenEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ ...c, contactPerson: c.contactPerson || c.contact_name || '', serviceArea: c.serviceArea || c.service_areas || '' });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const r = await fetch(`${BASE()}/van/rental-companies/${editingId}`, {
          method: 'PATCH', headers: hdrs(), body: JSON.stringify(form),
        });
        if (r.ok) { toast({ title: '更新しました' }); setIsModalOpen(false); load(); }
        else { const j = await r.json(); toast({ variant: 'destructive', title: j.error ?? '更新失敗' }); }
      } else {
        const r = await fetch(`${BASE()}/van/rental-companies`, {
          method: 'POST', headers: hdrs(), body: JSON.stringify(form),
        });
        const created = await r.json();
        if (r.ok) {
          if (newPassword && created?.id) {
            await fetch(`${BASE()}/van/rental-companies/${created.id}/invite`, {
              method: 'POST', headers: hdrs(),
              body: JSON.stringify({ email: form.email, password: newPassword }),
            });
          }
          toast({ title: '登録しました' }); setIsModalOpen(false); load();
        } else { toast({ variant: 'destructive', title: created.error ?? '登録失敗' }); }
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return;
    const r = await fetch(`${BASE()}/van/rental-companies/${id}`, { method: 'DELETE', headers: hdrs() });
    if (r.ok) { toast({ title: '削除しました' }); load(); }
    else toast({ variant: 'destructive', title: '削除失敗' });
  };

  const handleInvite = async () => {
    if (!inviteCompany) return;
    setInviting(true);
    try {
      const r = await fetch(`${BASE()}/van/rental-companies/${inviteCompany.id}/invite`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ email: inviteEmail || inviteCompany.email }),
      });
      const j = await r.json();
      if (r.ok) { setInviteResult(j); toast({ title: j.message ?? 'アカウントを発行しました' }); }
      else toast({ variant: 'destructive', title: j.error });
    } finally { setInviting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">レンタル会社管理</h1>
          <p className="text-muted-foreground text-sm mt-1">提携するレンタル会社（車両提供元）を管理します。</p>
        </div>
        <button onClick={handleOpenCreate}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 flex items-center gap-2">
          <Plus className="h-4 w-4" />新規登録
        </button>
      </div>

      {/* ステータスタブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t}
            <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">{tabCount(t)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">会社名</th>
                <th className="px-5 py-3 font-medium">担当者</th>
                <th className="px-5 py-3 font-medium">連絡先</th>
                <th className="px-5 py-3 font-medium">エリア</th>
                <th className="px-5 py-3 font-medium">ステータス</th>
                <th className="px-5 py-3 font-medium">車両</th>
                <th className="px-5 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">該当する会社はありません</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <div className="font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />{c.name}
                    </div>
                    {c.address && <div className="text-xs text-muted-foreground mt-0.5 pl-6">{c.address}</div>}
                  </td>
                  <td className="px-5 py-4 text-sm">{c.contactPerson || c.contact_name || '—'}</td>
                  <td className="px-5 py-4">
                    <div className="text-xs">{c.phone || '—'}</div>
                    <div className="text-xs text-muted-foreground">{c.email || '—'}</div>
                  </td>
                  <td className="px-5 py-4 text-xs">{c.serviceArea || c.service_areas || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Car className="h-3.5 w-3.5" />{c.vehicleCount ?? 0}台
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      {/* ステータス変更 */}
                      {(c.status === 'prospect' || c.status === 'reviewing') && (<>
                        <button onClick={() => changeStatus(c.id, 'active')} disabled={changingStatus === c.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-medium disabled:opacity-50">
                          <CheckCircle className="h-3 w-3" />承認
                        </button>
                        <button onClick={() => changeStatus(c.id, 'suspended')} disabled={changingStatus === c.id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium disabled:opacity-50">
                          <XCircle className="h-3 w-3" />却下
                        </button>
                      </>)}
                      {c.status === 'active' && (
                        <button onClick={() => changeStatus(c.id, 'suspended')} disabled={changingStatus === c.id}
                          className="px-2.5 py-1 text-xs bg-amber-100 text-amber-700 rounded-md hover:bg-amber-200 font-medium disabled:opacity-50">
                          停止
                        </button>
                      )}
                      {c.status === 'suspended' && (
                        <button onClick={() => changeStatus(c.id, 'active')} disabled={changingStatus === c.id}
                          className="px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 font-medium disabled:opacity-50">
                          再開
                        </button>
                      )}
                      {/* 共通操作 */}
                      <button onClick={() => { setInviteCompany(c); setInviteEmail(c.email ?? ''); setInviteResult(null); }}
                        title="アカウント招待" className="px-2 py-1 text-xs text-muted-foreground hover:text-primary rounded">
                        アカウント招待
                      </button>
                      <button onClick={() => handleOpenEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 編集/作成モーダル */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '会社情報の編集' : 'レンタル会社の登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: '会社名', key: 'name' }, { label: '担当者名', key: 'contactPerson' },
              { label: '電話番号', key: 'phone' }, { label: 'メールアドレス', key: 'email', type: 'email' },
              { label: '住所', key: 'address' }, { label: '対応エリア', key: 'serviceArea', placeholder: '例: 関東全域、神奈川県' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-sm font-medium">{f.label}</label>
                <input type={f.type ?? 'text'} value={form[f.key] || ''} placeholder={f.placeholder}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">保有台数</label>
              <input type="number" min={0} value={form.fleetSize ?? ''}
                onChange={e => setForm({ ...form, fleetSize: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ログインパスワード <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="入力するとアカウントも同時に発行します"
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
            )}
            {/* 振込先口座 */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-semibold">振込先口座</p>
              <div className="grid grid-cols-2 gap-3">
                {[{label:'銀行名',key:'bankName',ph:'例: ○○銀行'},{label:'支店名',key:'branchName',ph:'例: 渋谷支店'}].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{f.label}</label>
                    <input type="text" value={parseBank(form.bankInformation)[f.key as keyof BankInfo] || ''} placeholder={f.ph}
                      onChange={e => setForm({...form, bankInformation: encodeBank({...parseBank(form.bankInformation), [f.key]: e.target.value})})}
                      className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">口座種別</label>
                  <select value={parseBank(form.bankInformation).accountType || '普通'}
                    onChange={e => setForm({...form, bankInformation: encodeBank({...parseBank(form.bankInformation), accountType: e.target.value})})}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background">
                    <option>普通</option><option>当座</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-muted-foreground">口座番号</label>
                  <input type="text" value={parseBank(form.bankInformation).accountNumber || ''}
                    onChange={e => setForm({...form, bankInformation: encodeBank({...parseBank(form.bankInformation), accountNumber: e.target.value})})}
                    className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">口座名義（カナ）</label>
                <input type="text" value={parseBank(form.bankInformation).accountHolder || ''}
                  onChange={e => setForm({...form, bankInformation: encodeBank({...parseBank(form.bankInformation), accountHolder: e.target.value})})}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備考</label>
              <textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})}
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 h-20 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存する
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 招待ダイアログ */}
      <Dialog open={!!inviteCompany} onOpenChange={open => { if (!open) { setInviteCompany(null); setInviteResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>協力会社アカウント招待</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{inviteCompany?.name}</span> にポータルアクセス用アカウントを発行します。
            </p>
            {!inviteResult ? (<>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">メールアドレス</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder={inviteCompany?.email ?? 'example@company.jp'}
                  className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50" />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setInviteCompany(null)} className="px-4 py-2 border rounded-md text-sm hover:bg-muted">キャンセル</button>
                <button onClick={handleInvite} disabled={inviting}
                  className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium disabled:opacity-50">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}アカウント発行
                </button>
              </div>
            </>) : (
              <div className="space-y-3">
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-1">
                  <p className="text-sm font-medium text-green-700">アカウントを発行しました</p>
                  <p className="text-sm text-green-700">メール: <span className="font-mono font-medium">{inviteResult.email}</span></p>
                  {inviteResult.tempPassword && (
                    <p className="text-sm text-green-700">仮パスワード: <span className="font-mono font-medium bg-green-100 px-1 rounded">{inviteResult.tempPassword}</span></p>
                  )}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => { setInviteCompany(null); setInviteResult(null); }}
                    className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium">閉じる</button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
