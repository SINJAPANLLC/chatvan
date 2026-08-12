import { useEffect, useState } from 'react';
import { Loader2, Save, Building2, User, MapPin, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const inp = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";
const sel = "w-full px-3 py-2 border rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

function Section({ title }: { title: string }) {
  return (
    <p className="col-span-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1 border-t border-border">
      {title}
    </p>
  );
}

function Field({ label, children, full, note }: { label: string; children: React.ReactNode; full?: boolean; note?: string }) {
  return (
    <div className={`space-y-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-sm font-medium">{label}</label>
      {children}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

const TABS = [
  { key: 'company', label: '会社情報', icon: Building2 },
  { key: 'contact', label: '連絡先・エリア', icon: MapPin  },
];

export default function CompanySettings() {
  const [form, setForm] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tab, setTab] = useState('company');
  const [status, setStatus] = useState<string>('');
  const { toast } = useToast();

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    fetch(API('/company/me'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j) return;
        setStatus(j.status ?? '');
        setForm({
          name:          j.name          ?? j.company_name    ?? '',
          corporateName: j.corporate_name ?? j.corporateName  ?? '',
          contactName:   j.contact_name   ?? j.contactName    ?? '',
          phone:         j.phone          ?? '',
          email:         j.email          ?? '',
          address:       j.address        ?? '',
          serviceAreas:  j.service_areas  ?? j.serviceAreas   ?? '',
          fleetSize:     j.fleet_size     ?? j.fleetSize       ?? '',
          bankName:      j.bank_name      ?? j.bankName        ?? '',
          bankBranch:    j.bank_branch    ?? j.bankBranch      ?? '',
          bankAccount:   j.bank_account   ?? j.bankAccount     ?? '',
          bankHolder:    j.bank_holder    ?? j.bankHolder      ?? '',
          notes:         j.notes          ?? '',
        });
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const r = await fetch(API('/company/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, fleetSize: form.fleetSize ? Number(form.fleetSize) : undefined }),
      });
      if (r.ok) {
        toast({ title: '設定を保存しました' });
      } else {
        const j = await r.json();
        toast({ variant: 'destructive', title: j.error ?? '保存に失敗しました' });
      }
    } finally { setIsSaving(false); }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <p className="text-muted-foreground text-sm mt-1">会社プロフィールと連絡先情報を管理します。</p>
        </div>

        {/* ステータスバッジ */}
        {status && (
          <span className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
            status === 'active'   ? 'bg-green-100 text-green-700' :
            status === 'prospect' ? 'bg-yellow-100 text-yellow-700' :
            'bg-muted text-muted-foreground'
          }`}>
            {status === 'active' ? '承認済み' : status === 'prospect' ? '審査中' : status}
          </span>
        )}
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 会社情報タブ */}
      {tab === 'company' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border bg-muted/20">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">会社情報</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Section title="基本情報" />
              <Field label="会社名" full>
                <input type="text" value={form.name ?? ''} onChange={set('name')} placeholder="例: 株式会社○○" className={inp} />
              </Field>
              <Field label="法人名 / 屋号" full>
                <input type="text" value={form.corporateName ?? ''} onChange={set('corporateName')} placeholder="例: 合同会社○○運輸" className={inp} />
              </Field>
              <Field label="保有台数">
                <input type="number" min={0} value={form.fleetSize ?? ''} onChange={set('fleetSize')} placeholder="例: 5" className={inp} />
              </Field>
              <Field label="備考" full>
                <textarea value={form.notes ?? ''} onChange={set('notes')} rows={3} className={inp} />
              </Field>

              <Section title="振込先情報" />
              <Field label="銀行名">
                <input type="text" value={form.bankName ?? ''} onChange={set('bankName')} placeholder="例: 三菱UFJ銀行" className={inp} />
              </Field>
              <Field label="支店名">
                <input type="text" value={form.bankBranch ?? ''} onChange={set('bankBranch')} placeholder="例: 渋谷支店" className={inp} />
              </Field>
              <Field label="口座番号">
                <input type="text" value={form.bankAccount ?? ''} onChange={set('bankAccount')} placeholder="例: 1234567" className={inp} />
              </Field>
              <Field label="口座名義">
                <input type="text" value={form.bankHolder ?? ''} onChange={set('bankHolder')} placeholder="例: カ）○○" className={inp} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* 連絡先・エリアタブ */}
      {tab === 'contact' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border bg-muted/20">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">連絡先・エリア</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Section title="担当者情報" />
              <Field label="担当者名">
                <input type="text" value={form.contactName ?? ''} onChange={set('contactName')} placeholder="例: 山田 太郎" className={inp} />
              </Field>
              <Field label="電話番号">
                <input type="tel" value={form.phone ?? ''} onChange={set('phone')} placeholder="例: 03-0000-0000" className={inp} />
              </Field>
              <Field label="メールアドレス" full note="ログインに使用しているメールアドレスです">
                <input type="email" value={form.email ?? ''} onChange={set('email')} className={inp} />
              </Field>

              <Section title="所在地・対応エリア" />
              <Field label="住所" full>
                <input type="text" value={form.address ?? ''} onChange={set('address')} placeholder="例: 東京都渋谷区○○1-2-3" className={inp} />
              </Field>
              <Field label="対応エリア" full note="マッチングの際に参照されます">
                <textarea value={form.serviceAreas ?? ''} onChange={set('serviceAreas')} rows={3}
                  placeholder="例: 関東全域、神奈川県、東京都" className={inp} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* インフォバナー */}
      <div className="rounded-xl border border-border bg-muted/30 px-5 py-4 flex items-start gap-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>変更内容は「変更を保存」を押した後に反映されます。ステータスや承認状態の変更は管理者が行います。</p>
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? '保存中...' : '変更を保存'}
        </button>
      </div>
    </div>
  );
}
