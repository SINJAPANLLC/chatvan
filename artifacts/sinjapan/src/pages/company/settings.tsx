import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Save, Building2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const inp = "w-full px-3 py-2 border border-input rounded-md text-sm outline-none focus:border-foreground/50 bg-background";

export default function CompanySettings() {
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(API('/company/me'), { headers: authH() })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) setForm({
          name: j.name ?? j.company_name ?? '',
          corporateName: j.corporate_name ?? j.corporateName ?? '',
          contactName: j.contact_name ?? j.contactName ?? '',
          phone: j.phone ?? '',
          email: j.email ?? '',
          address: j.address ?? '',
          serviceAreas: j.service_areas ?? j.serviceAreas ?? '',
          fleetSize: j.fleet_size ?? j.fleetSize ?? '',
          notes: j.notes ?? '',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(API('/company/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({ ...form, fleetSize: form.fleetSize ? Number(form.fleetSize) : undefined }),
      });
      if (r.ok) toast({ title: '設定を保存しました' });
      else { const j = await r.json(); toast({ variant: 'destructive', title: j.error ?? '保存に失敗しました' }); }
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">設定</h1>
        <p className="text-sm text-muted-foreground mt-1">会社情報を管理します。変更は即時反映されます。</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" />会社情報
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">会社名</label>
              <input type="text" value={form.name ?? ''} onChange={set('name')} className={inp} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">法人名 / 屋号</label>
              <input type="text" value={form.corporateName ?? ''} onChange={set('corporateName')} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">担当者名</label>
              <input type="text" value={form.contactName ?? ''} onChange={set('contactName')} className={inp} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">電話番号</label>
              <input type="tel" value={form.phone ?? ''} onChange={set('phone')} className={inp} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">メールアドレス</label>
              <input type="email" value={form.email ?? ''} onChange={set('email')} className={inp} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">住所</label>
              <input type="text" value={form.address ?? ''} onChange={set('address')} placeholder="例: 東京都渋谷区〇〇1-2-3" className={inp} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">対応エリア</label>
              <textarea value={form.serviceAreas ?? ''} onChange={set('serviceAreas')} rows={2}
                placeholder="例: 関東全域、神奈川県、東京都" className={`${inp} resize-none`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">保有台数</label>
              <input type="number" min={0} value={form.fleetSize ?? ''} onChange={set('fleetSize')} className={inp} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">備考</label>
              <textarea value={form.notes ?? ''} onChange={set('notes')} rows={3} className={`${inp} resize-none`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? '保存中...' : '変更を保存'}
        </button>
      </div>
    </div>
  );
}
