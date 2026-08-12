import { useState } from 'react';

const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const _ = PREFS; // suppress unused warning

export default function CompanyRegister() {
  const [form, setForm] = useState({
    companyName: '', corporateName: '', contactName: '', phone: '', email: '',
    address: '', serviceAreas: '', fleetSize: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName || !form.contactName || !form.phone || !form.email) {
      setError('会社名・担当者名・電話番号・メールアドレスは必須です'); return;
    }
    setSubmitting(true); setError('');
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/company/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, fleetSize: form.fleetSize ? Number(form.fleetSize) : undefined }),
      });
      if (r.ok) { setSuccess(true); }
      else { const j = await r.json(); setError(j.error ?? '送信に失敗しました'); }
    } catch { setError('ネットワークエラーが発生しました'); }
    finally { setSubmitting(false); }
  };

  const ic = "w-full px-3 py-2 border border-input rounded-md text-sm outline-none focus:ring-1 focus:ring-foreground/30 bg-background";

  if (success) return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/20 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold">申請を受け付けました</h2>
        <p className="text-sm text-muted-foreground">担当者より3〜5営業日以内にご登録いただいたメールアドレス宛にご連絡いたします。</p>
        <a href="/" className="block text-sm text-muted-foreground hover:underline">トップページへ戻る</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-muted/20 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="text-center space-y-2">
          <img src="/logo.jpg" alt="Chat VAN" className="h-10 w-auto mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">協力会社パートナー登録</h1>
          <p className="text-sm text-muted-foreground">軽バン車両を提供して安定した収益を得ませんか？</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">会社名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.companyName} onChange={set('companyName')} placeholder="例: 株式会社〇〇レンタカー" className={ic} required />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">法人名 / 屋号 <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <input type="text" value={form.corporateName} onChange={set('corporateName')} placeholder="登記名称または屋号" className={ic} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">担当者名 <span className="text-red-500">*</span></label>
                <input type="text" value={form.contactName} onChange={set('contactName')} placeholder="例: 山田 太郎" className={ic} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">電話番号 <span className="text-red-500">*</span></label>
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="例: 03-1234-5678" className={ic} required />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">メールアドレス <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="例: info@company.jp" className={ic} required />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">住所 <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <input type="text" value={form.address} onChange={set('address')} placeholder="例: 東京都渋谷区〇〇1-2-3" className={ic} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">対応エリア <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <textarea value={form.serviceAreas} onChange={set('serviceAreas')} placeholder="例: 関東全域、神奈川県、東京都" rows={2} className={ic} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">保有台数 <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <input type="number" min={0} value={form.fleetSize} onChange={set('fleetSize')} placeholder="例: 5" className={ic} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium">ご質問・備考 <span className="text-muted-foreground text-xs font-normal">（任意）</span></label>
                <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="ご質問やご要望があればご記入ください" className={ic} />
              </div>
            </div>

            {error && <p className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg">{error}</p>}

            <button type="submit" disabled={submitting}
              className="w-full py-3 bg-foreground text-background font-medium rounded-lg hover:opacity-90 disabled:opacity-50 text-sm">
              {submitting ? '送信中...' : '申請する'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          既にアカウントをお持ちの方は{' '}
          <a href="/login" className="text-foreground underline underline-offset-2">こちらからログイン</a>
        </p>
      </div>
    </div>
  );
}
