import React, { useState, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import {
  useGetVanApplication,
  useUpdateVanApplication,
  useListVehicles,
  useSendVanProposal,
  useListVanMessages,
} from '@workspace/api-client-react';
import {
  Loader2, ChevronLeft, Save, Send, Check, Printer,
  User, Car, MessageSquare, FileText, CreditCard, ClipboardList,
  Phone, Mail, MapPin, Calendar, Banknote, Shield, BadgeCheck,
  Truck, Wrench, Camera, Package,
  ScrollText, Wallet, MapPinned, AlertTriangle, ClipboardCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ─── helpers ─────────────────────────────────────────────────────────────────
const yen = (n: number | null | undefined) =>
  n != null ? `¥${Number(n).toLocaleString()}` : '-';

const STATUS_STYLES: Record<string, string> = {
  new:                  'bg-gray-100 text-gray-700 border-gray-200',
  hearing:              'bg-orange-50 text-orange-700 border-orange-200',
  proposed:             'bg-blue-50 text-blue-700 border-blue-200',
  application_received: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  screening:            'bg-purple-50 text-purple-700 border-purple-200',
  approved:             'bg-teal-50 text-teal-700 border-teal-200',
  contracting:          'bg-indigo-50 text-indigo-700 border-indigo-200',
  active:               'bg-green-50 text-green-700 border-green-200',
  return_pending:       'bg-amber-50 text-amber-700 border-amber-200',
  completed:            'bg-gray-50 text-gray-500 border-gray-200',
  cancelled:            'bg-red-50 text-red-400 border-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  new:                  '新規',
  hearing:              'ヒアリング中',
  proposed:             '提案送信済',
  application_received: '申込受付',
  screening:            '審査中',
  approved:             '承認済',
  contracting:          '契約手続き',
  active:               '利用中',
  return_pending:       '返却予定',
  completed:            '契約終了',
  cancelled:            'キャンセル',
};

const ALL_STATUSES = Object.keys(STATUS_STYLES);

type Tab = 'overview' | 'customer' | 'vehicle' | 'chat' | 'instruction' | 'master'
         | 'contract' | 'payment' | 'insurance' | 'gps' | 'incident' | 'screening';

const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'overview',    label: '概要',           icon: ClipboardList },
  { id: 'customer',    label: '顧客情報',       icon: User },
  { id: 'vehicle',     label: '車両情報',       icon: Car },
  { id: 'chat',        label: 'チャット',       icon: MessageSquare },
  { id: 'contract',    label: '契約',           icon: ScrollText },
  { id: 'payment',     label: '決済',           icon: Wallet },
  { id: 'insurance',   label: '保険',           icon: Shield },
  { id: 'gps',         label: 'GPS',            icon: MapPinned },
  { id: 'incident',    label: '事故・故障',     icon: AlertTriangle },
  { id: 'screening',   label: '審査',           icon: ClipboardCheck },
  { id: 'instruction', label: '指示書',         icon: FileText },
  { id: 'master',      label: 'マスターカード', icon: CreditCard },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── DL row ──────────────────────────────────────────────────────────────────
function DL({ label, value, span2 }: { label: string; value?: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm font-medium">{value || <span className="text-muted-foreground">-</span>}</dd>
    </div>
  );
}

// ─── 契約作成フォーム ─────────────────────────────────────────────────────────
function CreateContractForm({ applicationId, userId, vehicles, onCreated }: {
  applicationId: number;
  userId: number;
  vehicles: any[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    vehicleId: '',
    monthlyPrice: '',
    sinJapanFee: '5000',
    startDate: '',
    minimumTerm: '1',
    paymentDay: '1',
  });

  const handleCreate = async () => {
    if (!form.vehicleId || !form.monthlyPrice || !form.startDate) {
      toast({ variant: 'destructive', title: '必須項目を入力してください' });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          applicationId,
          userId,
          vehicleId: Number(form.vehicleId),
          monthlyPrice: Number(form.monthlyPrice),
          sinJapanFee: Number(form.sinJapanFee),
          startDate: form.startDate,
          minimumTerm: Number(form.minimumTerm),
          paymentDay: Number(form.paymentDay),
          status: 'draft',
        }),
      });
      if (r.ok) {
        toast({ title: '契約を作成しました' });
        setOpen(false);
        onCreated();
      } else {
        const err = await r.json();
        toast({ variant: 'destructive', title: 'エラー', description: err.error ?? '作成に失敗しました' });
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-800">契約がまだ作成されていません</p>
          <p className="text-xs text-amber-600 mt-0.5">審査承認済みです。契約を作成してユーザーが署名・決済に進めるようにしてください。</p>
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-full hover:bg-amber-700 transition-colors"
        >
          <ScrollText className="h-4 w-4" />
          契約を作成
        </button>
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-amber-200 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">車両 *</label>
            <select value={form.vehicleId} onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">選択してください</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>{v.maker} {v.model}（{v.licensePlate ?? v.license_plate}）</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">月額料金（税抜）*</label>
            <input type="number" value={form.monthlyPrice} onChange={e => setForm(f => ({ ...f, monthlyPrice: e.target.value }))}
              placeholder="35000" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">SIN JAPAN手数料</label>
            <input type="number" value={form.sinJapanFee} onChange={e => setForm(f => ({ ...f, sinJapanFee: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">利用開始日 *</label>
            <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">最低利用期間（ヶ月）</label>
            <input type="number" min="1" value={form.minimumTerm} onChange={e => setForm(f => ({ ...f, minimumTerm: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="text-xs font-medium text-amber-800 block mb-1">支払日（毎月N日）</label>
            <input type="number" min="1" max="28" value={form.paymentDay} onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border rounded-full hover:bg-muted transition-colors">
              キャンセル
            </button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 text-sm bg-foreground text-background rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              作成する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminApplicationDetail() {
  const [, params] = useRoute('/admin/applications/:id');
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>('overview');

  const { data: application, isLoading, refetch } = useGetVanApplication(id, { query: { enabled: !!id } });
  const { data: messages } = useListVanMessages(id, { query: { enabled: !!id } });
  const { data: vehiclesData } = useListVehicles({ status: 'available' });

  const updateApp = useUpdateVanApplication();
  const sendProposal = useSendVanProposal();

  // ── form state ──────────────────────────────────────────────────────────────
  const [status, setStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [customerForm, setCustomerForm] = useState({
    applicantName: '', phone: '', email: '',
    dob: '', address: '', licenseInfo: '',
    insuranceStatus: '', hasBlackNumber: '', hasDeliveryExperience: '',
  });
  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const [proposalMessage, setProposalMessage] = useState('');

  // 追加タブ用関連データ
  const [related, setRelated] = useState<any>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const RELATED_TABS: Tab[] = ['contract', 'payment', 'insurance', 'gps', 'incident', 'screening'];

  const loadRelated = async () => {
    if (related || relatedLoading) return;
    setRelatedLoading(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/applications/${id}/related`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setRelated(await r.json());
    } finally { setRelatedLoading(false); }
  };

  React.useEffect(() => {
    if (RELATED_TABS.includes(tab as Tab)) loadRelated();
  }, [tab]);

  React.useEffect(() => {
    if (!application) return;
    if (!status) setStatus(application.status);
    setAdminNotes(application.adminNotes || '');
    setCustomerForm({
      applicantName: application.applicantName || '',
      phone: application.phone || '',
      email: application.email || '',
      dob: application.dob || '',
      address: application.address || '',
      licenseInfo: application.licenseInfo || '',
      insuranceStatus: application.insuranceStatus || '',
      hasBlackNumber: application.hasBlackNumber == null ? '' : String(application.hasBlackNumber),
      hasDeliveryExperience: application.hasDeliveryExperience == null ? '' : String(application.hasDeliveryExperience),
    });
  }, [application]);

  if (isLoading || !application) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const vehicles = vehiclesData || [];
  const proposedVehicles: any[] = (application as any).proposedVehicles || [];

  // ── actions ─────────────────────────────────────────────────────────────────
  const saveStatus = async () => {
    try {
      await updateApp.mutateAsync({ id, data: { status: status as any, adminNotes } });
      toast({ title: 'ステータス・メモを保存しました' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '更新に失敗しました' });
    }
  };

  const saveCustomer = async () => {
    try {
      await updateApp.mutateAsync({
        id,
        data: {
          ...customerForm,
          hasBlackNumber: customerForm.hasBlackNumber === 'true' ? true : customerForm.hasBlackNumber === 'false' ? false : null,
          hasDeliveryExperience: customerForm.hasDeliveryExperience === 'true' ? true : customerForm.hasDeliveryExperience === 'false' ? false : null,
        } as any,
      });
      toast({ title: '顧客情報を保存しました' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '保存に失敗しました' });
    }
  };

  const toggleVehicle = (vid: number) => {
    setSelectedVehicles(prev =>
      prev.includes(vid) ? prev.filter(x => x !== vid) : prev.length >= 3 ? prev : [...prev, vid],
    );
  };

  const handleSendProposal = async () => {
    if (selectedVehicles.length === 0) return;
    try {
      await sendProposal.mutateAsync({ id, data: { vehicleIds: selectedVehicles, message: proposalMessage } });
      toast({ title: '提案を送信しました' });
      setSelectedVehicles([]);
      setProposalMessage('');
      setStatus('proposed');
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '送信に失敗しました' });
    }
  };

  const handlePrint = () => window.print();

  // ── render tabs ──────────────────────────────────────────────────────────────
  const app = application as any;

  return (
    <div className="space-y-0 max-w-6xl mx-auto">
      {/* ── ヘッダ ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation('/admin/applications')} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">相談詳細 #{app.id}</h1>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATUS_STYLES[app.status] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABEL[app.status] ?? app.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {app.applicantName || '匿名'} · 登録: {format(new Date(app.createdAt), 'yyyy/MM/dd HH:mm')}
            </p>
          </div>
        </div>
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors print:hidden">
          <Printer className="h-4 w-4" />印刷
        </button>
      </div>

      {/* ── タブナビ ── */}
      <div className="flex border-b border-border mb-6 overflow-x-auto print:hidden">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 概要
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* ステータス管理 */}
            <Section title="ステータス管理" action={
              <button
                onClick={saveStatus}
                disabled={updateApp.isPending}
                className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {updateApp.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                保存
              </button>
            }>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
              >
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
              </select>
            </Section>

            {/* ヒアリング内容 */}
            <Section title="ヒアリング内容">
              <dl className="grid grid-cols-2 gap-4">
                <DL label="希望エリア" value={app.area} />
                <DL label="月額予算" value={app.monthlyBudget ? yen(app.monthlyBudget) : null} />
                <DL label="利用開始希望日" value={app.startDate} />
                <DL label="希望利用期間" value={app.durationMonths ? `${app.durationMonths}ヶ月` : null} />
                <DL label="利用目的" value={app.purpose} span2 />
                <DL label="希望車種" value={app.vehiclePreference} />
                <DL label="保険加入状況" value={app.insuranceStatus} />
                <DL label="黒ナンバー" value={app.hasBlackNumber == null ? null : app.hasBlackNumber ? '取得済み' : '未取得'} />
                <DL label="配送経験" value={app.hasDeliveryExperience == null ? null : app.hasDeliveryExperience ? 'あり' : 'なし'} />
              </dl>
            </Section>

            {/* オプション申請 */}
            {related && (related.contracts ?? []).some((c: any) => c.black_number_requested || c.insurance_referral_requested) && (
              <Section title="オプション申請">
                <div className="flex flex-wrap gap-2">
                  {(related.contracts ?? []).some((c: any) => c.black_number_requested) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-full">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      黒ナンバー取得申請あり
                    </span>
                  )}
                  {(related.contracts ?? []).some((c: any) => c.insurance_referral_requested) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-full">
                      <Shield className="h-3.5 w-3.5" />
                      保険紹介申請あり
                    </span>
                  )}
                </div>
              </Section>
            )}

            {/* 管理メモ */}
            <Section title="管理メモ（内部用）">
              <textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="管理者のメモ（ユーザーには表示されません）"
                rows={5}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50 resize-none"
              />
              <button
                onClick={saveStatus}
                disabled={updateApp.isPending}
                className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {updateApp.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                メモを保存
              </button>
            </Section>
          </div>

          {/* 右カラム: 最初のメッセージ */}
          <div className="space-y-5">
            <Section title="最初のメッセージ">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {app.requestText || 'なし'}
              </p>
            </Section>
            <Section title="顧客サマリ">
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{app.applicantName || '未入力'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{app.phone || '未入力'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="break-all">{app.email || '未入力'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{app.address || '未入力'}</span>
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 顧客情報
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'customer' && (
        <div className="space-y-5">
          <Section title="基本情報" action={
            <button onClick={saveCustomer} disabled={updateApp.isPending}
              className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
              {updateApp.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              保存
            </button>
          }>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: '氏名', key: 'applicantName', placeholder: '山田 太郎' },
                { label: '電話番号', key: 'phone', placeholder: '090-1234-5678' },
                { label: 'メールアドレス', key: 'email', placeholder: 'yamada@example.com' },
                { label: '生年月日', key: 'dob', placeholder: '1990-01-15' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground block mb-1.5">{f.label}</label>
                  <input
                    value={(customerForm as any)[f.key]}
                    onChange={e => setCustomerForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1.5">住所</label>
                <input
                  value={customerForm.address}
                  onChange={e => setCustomerForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="神奈川県横浜市中区○○1-2-3"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1.5">運転免許証情報</label>
                <input
                  value={customerForm.licenseInfo}
                  onChange={e => setCustomerForm(prev => ({ ...prev, licenseInfo: e.target.value }))}
                  placeholder="普通免許 / 有効期限: 2028-01-15 / 番号: 123456789012"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
                />
              </div>
            </div>
          </Section>

          {/* eKYC サマリーカード */}
          {(() => {
            const iv = application.identityVerification as any;
            if (!iv) return (
              <Section title="本人確認（eKYC）">
                <p className="text-sm text-muted-foreground py-2 text-center">本人確認書類は未提出です</p>
              </Section>
            );
            const statusLabel: Record<string, string> = { verified: '確認済み', approved: '承認済み', rejected: '却下', pending: '審査中' };
            return (
              <Section title="本人確認（eKYC）">
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <DL label="ステータス" value={
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted border border-border">
                      {statusLabel[iv.status] ?? iv.status}
                    </span>
                  } />
                  <DL label="提出日" value={iv.created_at ? format(new Date(iv.created_at), 'yyyy/MM/dd') : null} />
                  <DL label="氏名" value={iv.full_name} />
                  <DL label="生年月日" value={iv.birth_date} />
                  <DL label="住所" value={iv.address} span2 />
                  <DL label="免許証種別" value={iv.license_type} />
                  <DL label="免許証番号" value={iv.license_number} />
                  <DL label="有効期限" value={iv.license_expiry} />
                  {(iv.license_front || iv.selfie_photo) && (
                    <div className="col-span-2 sm:col-span-3 flex gap-3 flex-wrap">
                      {[['免許証（表面）', iv.license_front], ['免許証（裏面）', iv.license_back], ['自撮り写真', iv.selfie_photo]].filter(([, p]) => p).map(([label, path]) => (
                        <div key={label as string}>
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label as string} className="h-28 w-auto rounded-lg border border-border object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </dl>
              </Section>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 車両情報
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'vehicle' && (
        <div className="space-y-5">
          {/* 提案済み車両 */}
          <Section title={`提案済み車両（${proposedVehicles.length}台）`}>
            {proposedVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">まだ提案した車両はありません。</p>
            ) : (
              <div className="space-y-4">
                {proposedVehicles.map((v: any) => (
                  <div key={v.id} className="border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-sm">{v.maker} {v.model}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{v.year || '-'}年式 / {v.prefecture}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{yen(v.userPrice)}<span className="text-xs font-normal text-muted-foreground">/月</span></p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          v.status === '募集中' ? 'bg-green-50 text-green-700 border-green-200' :
                          v.status === '貸出中' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>{v.status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" />
                        走行{v.mileage ? `${v.mileage.toLocaleString()}km` : '-'}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Wrench className="h-3.5 w-3.5" />
                        車検{v.inspectionExpiry || '-'}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        最低{v.minPeriodMonths || 1}ヶ月〜
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" />
                        ETC:{v.hasEtc ? '✓' : '-'} / DR:{v.hasDashcam ? '✓' : '-'}
                      </div>
                    </div>
                    {/* 料金内訳 */}
                    <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">レンタル会社受取</span>
                        <span>{yen(v.monthlyPrice)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SIN JAPAN手数料</span>
                        <span>{yen(v.sinJapanFee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">保険料</span>
                        <span>{yen(v.insuranceFee)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                        <span>ユーザー月額</span>
                        <span>{yen(v.userPrice)}</span>
                      </div>
                    </div>
                    {/* レンタル会社 */}
                    {v.rentalCompany && (
                      <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">レンタル会社：</span>
                        {v.rentalCompany.name}
                        {v.rentalCompany.phone && ` / TEL: ${v.rentalCompany.phone}`}
                        {v.locationDetail && ` / ${v.locationDetail}`}
                      </div>
                    )}
                    {v.notes && (
                      <p className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">{v.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 新規提案 */}
          <Section title="車両を新たに提案" action={
            <span className="text-xs text-muted-foreground">最大3台 ({selectedVehicles.length}/3)</span>
          }>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-4">
              {vehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">募集中の車両がありません。</p>
              ) : (
                vehicles.map(v => {
                  const isSelected = selectedVehicles.includes(v.id);
                  const price = Number(v.monthlyPrice) + Number((v as any).sinJapanFee ?? 0) + Number((v as any).insuranceFee ?? 0);
                  return (
                    <div
                      key={v.id}
                      onClick={() => toggleVehicle(v.id)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-foreground bg-foreground/5' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-sm">{v.maker} {v.model} ({v.year || '-'}年)</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{v.prefecture} / {yen(price)}/月</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground'
                      }`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1.5">提案メッセージ（任意）</label>
              <textarea
                value={proposalMessage}
                onChange={e => setProposalMessage(e.target.value)}
                placeholder="ご希望の条件に合う車両をご提案します..."
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50 resize-none"
              />
            </div>
            <button
              onClick={handleSendProposal}
              disabled={selectedVehicles.length === 0 || sendProposal.isPending}
              className="w-full py-2.5 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sendProposal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提案を送信する
            </button>
          </Section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: チャット
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'chat' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ height: '70vh' }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
            <h3 className="text-sm font-semibold">チャット履歴</h3>
            <span className="text-xs text-muted-foreground">{messages?.length || 0}件</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
            {!messages?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">メッセージはありません。</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-muted-foreground mb-1 mx-1">
                    {msg.role === 'user' ? 'ユーザー' : 'AI'} · {format(new Date(msg.createdAt), 'HH:mm')}
                  </span>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-foreground text-background rounded-br-sm'
                      : 'bg-background border border-border text-foreground rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 契約
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'contract' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            <>
            {/* 契約作成CTA — 契約なし かつ approved/contracting のとき */}
            {related?.contracts?.length === 0 && ['approved','contracting'].includes(application.status) && (
              <CreateContractForm
                applicationId={id}
                userId={application.userId!}
                vehicles={vehiclesData?.vehicles ?? []}
                onCreated={() => { setRelated(null); loadRelated(); }}
              />
            )}
            {related?.contracts?.length === 0 && !['approved','contracting'].includes(application.status) && (
              <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">契約はありません</div>
            )}
            {(related?.contracts ?? []).map((c: any) => (
              <Section key={c.id} title={`契約 #${c.id} — ${c.maker ?? ''} ${c.model ?? ''}`}>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <DL label="ステータス" value={<span className="px-2 py-0.5 bg-muted rounded-full text-xs">{{
                    pending_payment: '決済待ち', active: '利用中', delivery_pending: '納車待ち',
                    return_pending: '返却予定', payment_issue: '支払い問題',
                    completed: '契約終了', cancelled: '解約',
                  }[c.status as string] ?? c.status}</span>} />
                  <DL label="ナンバー" value={c.license_plate} />
                  <DL label="都道府県" value={c.prefecture} />
                  <DL label="月額" value={c.monthly_price ? `¥${Number(c.monthly_price).toLocaleString()}` : null} />
                  <DL label="開始日" value={c.start_date} />
                  <DL label="支払日" value={c.payment_day ? `毎月${c.payment_day}日` : null} />
                  <DL label="レンタル会社" value={c.rental_company_name} />
                  <DL label="登録日" value={c.created_at ? format(new Date(c.created_at), 'yyyy/MM/dd') : null} />
                </dl>
              </Section>
            ))}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 決済
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'payment' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            <Section title={`決済履歴（${related?.payments?.length ?? 0}件）`}>
              {!related?.payments?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">決済履歴はありません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 text-left">対象月</th>
                    <th className="pb-2 text-left">金額</th>
                    <th className="pb-2 text-left">結果</th>
                    <th className="pb-2 text-left">試行日</th>
                    <th className="pb-2 text-left">理由</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {related.payments.map((p: any) => (
                      <tr key={p.id} className="py-2">
                        <td className="py-2.5 font-mono text-xs">{p.period_month}</td>
                        <td className="py-2.5">¥{Number(p.amount).toLocaleString()}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.result === 'success' ? 'bg-green-100 text-green-700' :
                            p.result === 'failed'  ? 'bg-red-100 text-red-700' :
                            'bg-muted text-muted-foreground'
                          }`}>{{ success: '成功', failed: '失敗' }[p.result as string] ?? p.result ?? '-'}</span>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{p.attempted_at ? format(new Date(p.attempted_at), 'MM/dd HH:mm') : '-'}</td>
                        <td className="py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{p.failure_reason ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 保険
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'insurance' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            related?.insurance?.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">保険情報はありません</div>
            ) : related?.insurance?.map((ins: any) => (
              <Section key={ins.id} title={`保険 #${ins.id} — ${ins.maker ?? ''} ${ins.model ?? ''}`}>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <DL label="保険会社" value={ins.insurer} />
                  <DL label="証券番号" value={ins.policy_number} />
                  <DL label="種類" value={ins.insurance_type} />
                  <DL label="満了日" value={ins.expiry_date} />
                  <DL label="ステータス" value={<span className={`px-2 py-0.5 rounded-full text-xs ${ins.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>{ins.status}</span>} />
                  <DL label="商用利用可" value={ins.covers_commercial_use ? '対応' : '非対応'} />
                  <DL label="月額保険料" value={ins.monthly_premium ? `¥${Number(ins.monthly_premium).toLocaleString()}` : null} />
                  <DL label="ナンバー" value={ins.license_plate} />
                </dl>
              </Section>
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: GPS
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'gps' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            <>
              {/* ユーザー位置情報 */}
              {(() => {
                const locs: any[] = related?.userLocations ?? [];
                const latest = locs[0];
                return (
                  <Section title={`ユーザー位置情報（${locs.length}件）`}>
                    {!latest ? (
                      <p className="text-sm text-muted-foreground">位置情報はまだ送信されていません。GPSに同意済みのユーザーが利用中になると自動で記録されます。</p>
                    ) : (
                      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <DL label="緯度"     value={latest.latitude} />
                        <DL label="経度"     value={latest.longitude} />
                        <DL label="精度"     value={latest.accuracy != null ? `±${Math.round(Number(latest.accuracy))}m` : null} />
                        <DL label="最終更新" value={latest.recorded_at ? format(new Date(latest.recorded_at), 'yyyy/MM/dd HH:mm:ss') : null} />
                        <DL label="総記録数" value={`${locs.length}件`} />
                        <div className="col-span-2 sm:col-span-3 flex gap-2 flex-wrap">
                          <a
                            href={`https://maps.google.com/?q=${latest.latitude},${latest.longitude}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors"
                          >
                            <MapPinned className="h-3.5 w-3.5" />最新位置をGoogleマップで開く
                          </a>
                        </div>
                        {locs.length > 1 && (
                          <div className="col-span-2 sm:col-span-3">
                            <p className="text-xs font-medium text-foreground mb-2">直近の記録</p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {locs.slice(0, 20).map((l: any) => (
                                <a key={l.id}
                                  href={`https://maps.google.com/?q=${l.latitude},${l.longitude}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-xs gap-2"
                                >
                                  <span className="text-muted-foreground">{l.recorded_at ? format(new Date(l.recorded_at), 'MM/dd HH:mm:ss') : '-'}</span>
                                  <span className="font-mono">{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</span>
                                  <MapPinned className="h-3 w-3 text-muted-foreground shrink-0" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </dl>
                    )}
                  </Section>
                );
              })()}

              {/* 車両搭載GPSデバイス */}
              {(related?.gps?.length === 0) ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">車両搭載GPS機器はありません</div>
              ) : related?.gps?.map((g: any) => {
                const loc = g.last_location;
                return (
                  <Section key={g.id} title={`車両GPS #${g.id} — ${g.maker ?? ''} ${g.model ?? ''} ${g.license_plate ?? ''}`}>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <DL label="デバイスID" value={g.device_id} />
                      <DL label="ステータス" value={g.status} />
                      <DL label="通信キャリア" value={g.carrier} />
                      {loc && <>
                        <DL label="緯度" value={loc.lat ?? loc.latitude} />
                        <DL label="経度" value={loc.lng ?? loc.longitude} />
                        <DL label="最終更新" value={loc.recorded_at ? format(new Date(loc.recorded_at), 'MM/dd HH:mm') : null} />
                        <DL label="速度" value={loc.speed != null ? `${loc.speed} km/h` : null} />
                        {(loc.lat ?? loc.latitude) && (
                          <div className="col-span-2 sm:col-span-3">
                            <a
                              href={`https://maps.google.com/?q=${loc.lat ?? loc.latitude},${loc.lng ?? loc.longitude}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors"
                            >
                              <MapPinned className="h-3.5 w-3.5" />Googleマップで開く
                            </a>
                          </div>
                        )}
                      </>}
                      {!loc && <div className="col-span-3 text-xs text-muted-foreground">位置情報なし</div>}
                    </dl>
                  </Section>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 事故・故障
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'incident' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            related?.incidents?.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">事故・故障の報告はありません</div>
            ) : related?.incidents?.map((inc: any) => (
              <Section key={inc.id} title={`#${inc.id} ${inc.incident_type === 'accident' ? '🚨 事故' : inc.incident_type === 'breakdown' ? '🔧 故障' : '報告'}`}>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <DL label="ステータス" value={<span className={`px-2 py-0.5 rounded-full text-xs ${inc.status === '解決済み' ? 'bg-green-100 text-green-700' : inc.status === '対応中' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{inc.status}</span>} />
                  <DL label="車両" value={`${inc.maker ?? ''} ${inc.model ?? ''} ${inc.license_plate ?? ''}`} />
                  <DL label="現在地" value={inc.location} />
                  <DL label="怪我あり" value={inc.has_injuries != null ? (inc.has_injuries ? 'あり' : 'なし') : null} />
                  <DL label="警察対応" value={inc.police_contacted != null ? (inc.police_contacted ? '済み' : '未') : null} />
                  <DL label="報告日時" value={inc.created_at ? format(new Date(inc.created_at), 'yyyy/MM/dd HH:mm') : null} />
                  {inc.description && <DL label="状況説明" value={inc.description} span2 />}
                </dl>
              </Section>
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 審査
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'screening' && (
        <div className="space-y-4">
          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (<>
            {/* 本人確認 */}
            <Section title="本人確認（eKYC）">
              {!related?.identityVerification ? (
                <p className="text-sm text-muted-foreground py-2 text-center">本人確認書類は未提出です</p>
              ) : (() => {
                const iv = related.identityVerification;
                const statusLabel: Record<string, string> = { verified: '確認済み', approved: '承認済み', rejected: '却下', pending: '審査中' };
                const statusStyle: Record<string, string> = { verified: 'bg-muted text-foreground border border-border', approved: 'bg-muted text-foreground border border-border', rejected: 'bg-muted text-muted-foreground border border-border', pending: 'bg-muted text-muted-foreground border border-border' };
                return (
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <DL label="ステータス" value={
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[iv.status] ?? 'bg-muted text-muted-foreground border border-border'}`}>
                        {statusLabel[iv.status] ?? iv.status}
                      </span>
                    } />
                    <DL label="提出日" value={iv.created_at ? format(new Date(iv.created_at), 'yyyy/MM/dd') : null} />
                    <DL label="氏名" value={iv.full_name} />
                    <DL label="生年月日" value={iv.birth_date} />
                    <DL label="住所" value={iv.address} span2 />
                    <DL label="免許証種別" value={iv.license_type} />
                    <DL label="免許証番号" value={iv.license_number} />
                    <DL label="有効期限" value={iv.license_expiry} />
                    {iv.emergency_contact_name && <>
                      <DL label="緊急連絡先" value={iv.emergency_contact_name} />
                      <DL label="関係" value={iv.emergency_contact_relation} />
                      <DL label="緊急連絡先電話" value={iv.emergency_contact_phone} />
                    </>}
                    {/* 免許証画像（license_front / license_back / selfie_photo） */}
                    {(iv.license_front || iv.selfie_photo) && (
                      <div className="col-span-2 sm:col-span-3 flex gap-3 flex-wrap">
                        {[['免許証（表面）', iv.license_front], ['免許証（裏面）', iv.license_back], ['自撮り写真', iv.selfie_photo]].filter(([, p]) => p).map(([label, path]) => (
                          <div key={label as string}>
                            <p className="text-xs text-muted-foreground mb-1">{label}</p>
                            <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label as string} className="h-28 w-auto rounded-lg border border-border object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    {iv.rejection_reason && (
                      <DL label="却下理由" value={iv.rejection_reason} span2 />
                    )}
                  </dl>
                );
              })()}
            </Section>

            {/* 審査結果 */}
            <Section title={`審査結果（${related?.screening?.length ?? 0}件）`}>
              {!related?.screening?.length ? (
                <p className="text-sm text-muted-foreground py-2 text-center">審査記録はありません</p>
              ) : related.screening.map((s: any) => (
                <div key={s.id} className="border border-border rounded-xl p-4 mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      s.result === 'approved' ? 'bg-green-100 text-green-700' :
                      s.result === 'rejected' ? 'bg-red-100 text-red-700' :
                      s.result === 'conditional' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-muted text-muted-foreground'
                    }`}>{s.result === 'approved' ? '承認' : s.result === 'rejected' ? '否決' : s.result === 'conditional' ? '条件付き承認' : '審査中'}</span>
                    <span className="text-xs text-muted-foreground">{s.created_at ? format(new Date(s.created_at), 'yyyy/MM/dd HH:mm') : ''}</span>
                  </div>
                  {s.reason && <p className="text-sm mb-2"><span className="text-xs text-muted-foreground block mb-0.5">審査理由</span>{s.reason}</p>}
                  {s.conditions && <p className="text-sm mb-2"><span className="text-xs text-muted-foreground block mb-0.5">承認条件</span>{s.conditions}</p>}
                  {s.risk_notes && <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs">{s.risk_notes}</p>}
                </div>
              ))}
            </Section>
          </>)}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 指示書
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'instruction' && (
        <div className="space-y-4">
          <div className="flex justify-end print:hidden">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90">
              <Printer className="h-4 w-4" />印刷する
            </button>
          </div>
          <div ref={printRef} className="bg-white border border-border rounded-xl p-8 shadow-sm print:shadow-none print:border-0">
            {/* ヘッダ */}
            <div className="border-b-2 border-black pb-4 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">車両引渡指示書</h2>
                  <p className="text-sm text-gray-500 mt-1">Chat VAN / SIN JAPAN株式会社</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold">相談 #{app.id}</p>
                  <p className="text-gray-500">{format(new Date(app.createdAt), 'yyyy年MM月dd日')}</p>
                </div>
              </div>
            </div>

            {/* 顧客情報 */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">■ 顧客情報</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div><span className="text-gray-500 w-28 inline-block">氏名</span><span className="font-semibold">{app.applicantName || '未入力'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">電話番号</span><span>{app.phone || '-'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">メール</span><span>{app.email || '-'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">住所</span><span>{app.address || '-'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">免許証</span><span>{app.licenseInfo || '-'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">黒ナンバー</span><span>{app.hasBlackNumber == null ? '-' : app.hasBlackNumber ? '取得済み' : '未取得'}</span></div>
                <div><span className="text-gray-500 w-28 inline-block">保険</span><span>{app.insuranceStatus || '-'}</span></div>
              </div>
            </div>

            {/* 車両情報 */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">■ 引渡し車両</h3>
              {proposedVehicles.length === 0 ? (
                <p className="text-sm text-gray-400 italic">提案車両なし</p>
              ) : proposedVehicles.map((v: any, i: number) => (
                <div key={v.id} className="border border-gray-200 rounded-lg p-4 mb-3">
                  <p className="font-bold">{i + 1}. {v.maker} {v.model} {v.year ? `(${v.year}年)` : ''}</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2 text-sm">
                    <div><span className="text-gray-500 w-24 inline-block">所在エリア</span>{v.prefecture} {v.locationDetail || ''}</div>
                    <div><span className="text-gray-500 w-24 inline-block">月額</span>{yen(v.userPrice)}/月</div>
                    <div><span className="text-gray-500 w-24 inline-block">走行距離</span>{v.mileage ? `${v.mileage.toLocaleString()}km` : '-'}</div>
                    <div><span className="text-gray-500 w-24 inline-block">車検期限</span>{v.inspectionExpiry || '-'}</div>
                    <div><span className="text-gray-500 w-24 inline-block">ETC</span>{v.hasEtc ? 'あり' : 'なし'}</div>
                    <div><span className="text-gray-500 w-24 inline-block">ドラレコ</span>{v.hasDashcam ? 'あり' : 'なし'}</div>
                    {v.rentalCompany && <div className="col-span-2"><span className="text-gray-500 w-24 inline-block">レンタル会社</span>{v.rentalCompany.name} {v.rentalCompany.phone ? `（${v.rentalCompany.phone}）` : ''}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* レンタル条件 */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">■ レンタル条件</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div><span className="text-gray-500 w-28 inline-block">利用開始希望</span>{app.startDate || '-'}</div>
                <div><span className="text-gray-500 w-28 inline-block">利用期間</span>{app.durationMonths ? `${app.durationMonths}ヶ月` : '-'}</div>
                <div><span className="text-gray-500 w-28 inline-block">月額予算</span>{app.monthlyBudget ? yen(app.monthlyBudget) : '-'}</div>
                <div><span className="text-gray-500 w-28 inline-block">利用目的</span>{app.purpose || '-'}</div>
              </div>
            </div>

            {/* 管理メモ */}
            {app.adminNotes && (
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">■ 管理者メモ</h3>
                <p className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{app.adminNotes}</p>
              </div>
            )}

            {/* 署名欄 */}
            <div className="border-t border-gray-200 pt-6 mt-6">
              <div className="grid grid-cols-3 gap-8 text-sm">
                <div>
                  <p className="text-gray-500 mb-6">担当者確認</p>
                  <div className="border-b border-black" />
                </div>
                <div>
                  <p className="text-gray-500 mb-6">引渡し確認</p>
                  <div className="border-b border-black" />
                </div>
                <div>
                  <p className="text-gray-500 mb-6">顧客署名</p>
                  <div className="border-b border-black" />
                </div>
              </div>
              <p className="text-center text-xs text-gray-400 mt-8">Chat VAN / SIN JAPAN株式会社 · 本書は車両引渡し時にご利用ください</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: マスターカード
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'master' && (
        <div className="space-y-4">
          <div className="flex justify-end print:hidden">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90">
              <Printer className="h-4 w-4" />印刷する
            </button>
          </div>
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden print:shadow-none print:border-0">
            {/* カードヘッダ */}
            <div className="bg-black text-white px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs tracking-widest text-gray-400 uppercase mb-1">Chat VAN / SIN JAPAN</p>
                  <h2 className="text-xl font-black">マスターカード</h2>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black">#{app.id}</p>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold mt-1 inline-block ${
                    STATUS_STYLES[app.status]?.replace('border-', '').replace('-50', '-900').replace('-200', '') || 'bg-gray-700 text-white'
                  }`} style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
                    {STATUS_LABEL[app.status] ?? app.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* 顧客 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4" />
                  <h3 className="text-sm font-bold">顧客情報</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { icon: User,    label: '氏名',   value: app.applicantName },
                    { icon: Phone,   label: 'TEL',    value: app.phone },
                    { icon: Mail,    label: 'Email',  value: app.email },
                    { icon: MapPin,  label: '住所',   value: app.address },
                    { icon: Shield,  label: '保険',   value: app.insuranceStatus },
                    { icon: BadgeCheck, label: '黒ナンバー', value: app.hasBlackNumber == null ? null : app.hasBlackNumber ? '取得済み' : '未取得' },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Icon className="h-3 w-3" />{item.label}</p>
                        <p className="text-sm font-medium truncate">{item.value || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 希望条件 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4" />
                  <h3 className="text-sm font-bold">希望条件</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: MapPin,    label: 'エリア',  value: app.area },
                    { icon: Banknote,  label: '月額予算', value: app.monthlyBudget ? yen(app.monthlyBudget) : null },
                    { icon: Calendar,  label: '開始日',   value: app.startDate },
                    { icon: Truck,     label: '期間',    value: app.durationMonths ? `${app.durationMonths}ヶ月` : null },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                        <p className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Icon className="h-3 w-3" />{item.label}</p>
                        <p className="text-sm font-semibold">{item.value || <span className="text-muted-foreground font-normal">-</span>}</p>
                      </div>
                    );
                  })}
                  <div className="col-span-2 sm:col-span-4 bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">利用目的</p>
                    <p className="text-sm font-medium">{app.purpose || <span className="text-muted-foreground font-normal">-</span>}</p>
                  </div>
                </div>
              </div>

              {/* 提案車両 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Car className="h-4 w-4" />
                  <h3 className="text-sm font-bold">提案車両</h3>
                </div>
                {proposedVehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">提案車両なし</p>
                ) : (
                  <div className="space-y-2">
                    {proposedVehicles.map((v: any, i: number) => (
                      <div key={v.id} className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">{i + 1}. {v.maker} {v.model} {v.year ? `(${v.year})` : ''}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {v.prefecture} / ETC:{v.hasEtc ? '✓' : '-'} / DR:{v.hasDashcam ? '✓' : '-'}
                            {v.rentalCompany ? ` / ${v.rentalCompany.name}` : ''}
                          </p>
                        </div>
                        <p className="text-base font-bold shrink-0">{yen(v.userPrice)}<span className="text-xs font-normal text-muted-foreground">/月</span></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 管理メモ */}
              {app.adminNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs font-bold text-amber-700 mb-2">管理メモ</p>
                  <p className="text-sm whitespace-pre-wrap text-amber-900">{app.adminNotes}</p>
                </div>
              )}

              {/* フッタ */}
              <div className="border-t border-border pt-4 flex justify-between text-xs text-muted-foreground">
                <span>相談 #{app.id} · 登録: {format(new Date(app.createdAt), 'yyyy/MM/dd')}</span>
                <span>Chat VAN / SIN JAPAN株式会社</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
