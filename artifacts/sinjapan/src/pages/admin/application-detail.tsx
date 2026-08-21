import React, { useState, useRef, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { useRoute, useLocation } from 'wouter';
import {
  useGetVanApplication,
  useUpdateVanApplication,
  useListVehicles,
  useSendVanProposal,
  useListVanMessages,
} from '@workspace/api-client-react';
import {
  Loader2, ChevronLeft, Save, Send, Check, Printer, Bell,
  User, Car, MessageSquare, FileText, CreditCard, ClipboardList,
  Phone, Mail, MapPin, Calendar, Banknote, Shield, BadgeCheck,
  Truck, Wrench, Camera, Package, Plus, X,
  ScrollText, Wallet, MapPinned, AlertTriangle, ClipboardCheck, Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const formatYen = (value: unknown) => `¥${Number(value ?? 0).toLocaleString('ja-JP')}`;

function createInvoicePdfElement(
  invoice: any,
  items: any[],
  showTotals: boolean,
  isContinuation: boolean,
): HTMLDivElement {
  const create = (tag: string, text?: string, styles: Record<string, string> = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    Object.assign(node.style, styles);
    return node;
  };
  const root = create('div', undefined, {
    position: 'fixed', left: '-100000px', top: '0', width: '794px', boxSizing: 'border-box',
    padding: '54px', background: '#ffffff', color: '#111827',
    fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif',
    fontSize: '14px', lineHeight: '1.6',
  });
  const header = create('div', undefined, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingBottom: '22px', borderBottom: '2px solid #111827',
  });
  const left = create('div');
  left.append(
    create('div', isContinuation ? '請求書（明細続き）' : '請 求 書', { fontSize: '30px', fontWeight: '700', letterSpacing: '0.12em' }),
    create('div', 'Chat VAN 運営事務局', { marginTop: '7px', color: '#4b5563', fontSize: '12px' }),
  );
  const right = create('div', undefined, { textAlign: 'right', fontSize: '12px', color: '#374151' });
  right.append(
    create('div', `請求書番号：${invoice.invoiceNumber ?? '-'}`, { fontWeight: '700', fontSize: '13px', color: '#111827' }),
    create('div', `発行日：${String(invoice.createdAt ?? '').slice(0, 10).replaceAll('-', '/') || '-'}`, { marginTop: '5px' }),
    create('div', `支払期限：${String(invoice.dueDate ?? '').replaceAll('-', '/') || '-'}`, { marginTop: '3px' }),
  );
  header.append(left, right);
  root.append(header);

  const period = create('div', undefined, {
    marginTop: '26px', padding: '16px 18px', background: '#f3f4f6', borderRadius: '6px',
  });
  period.append(
    create('div', '対象期間', { color: '#6b7280', fontSize: '11px', fontWeight: '700' }),
    create('div', `${invoice.periodStart ?? '-'} 〜 ${invoice.periodEnd ?? '-'}`, { marginTop: '4px', fontSize: '16px', fontWeight: '700' }),
  );
  root.append(period);

  const table = create('div', undefined, { marginTop: '28px', borderTop: '1px solid #374151' });
  const addRow = (description: string, amount: string, isHeader = false) => {
    const row = create('div', undefined, {
      display: 'grid', gridTemplateColumns: '1fr 150px', gap: '16px',
      padding: isHeader ? '10px 12px' : '14px 12px', borderBottom: '1px solid #d1d5db',
      background: isHeader ? '#f3f4f6' : '#ffffff', fontSize: isHeader ? '12px' : '14px',
      fontWeight: isHeader ? '700' : '400',
    });
    row.append(
      create('div', description, { color: isHeader ? '#374151' : '#111827' }),
      create('div', amount, { textAlign: 'right', color: '#111827', fontVariantNumeric: 'tabular-nums' }),
    );
    table.append(row);
  };
  addRow('内容', '金額', true);
  if (items.length === 0) addRow('請求明細', formatYen(invoice.subtotal));
  else items.forEach((item: any) => addRow(
    String(item.description ?? '請求明細'),
    item.continuation ? '' : formatYen(item.amount),
  ));
  root.append(table);

  if (showTotals) {
    const totals = create('div', undefined, {
      marginTop: '24px', marginLeft: 'auto', width: '300px', borderTop: '1px solid #9ca3af',
    });
    const addTotal = (label: string, amount: string, strong = false) => {
      const row = create('div', undefined, {
        display: 'flex', justifyContent: 'space-between', padding: strong ? '14px 8px 0' : '9px 8px',
        fontWeight: strong ? '700' : '400', fontSize: strong ? '18px' : '13px',
        borderTop: strong ? '2px solid #111827' : 'none', marginTop: strong ? '4px' : '0',
      });
      row.append(create('span', label), create('span', amount, { fontVariantNumeric: 'tabular-nums' }));
      totals.append(row);
    };
    addTotal('小計', formatYen(invoice.subtotal));
    addTotal('消費税（10%）', formatYen(invoice.tax));
    addTotal('合計金額', formatYen(invoice.totalAmount), true);
    root.append(totals);

    const footer = create('div', undefined, {
      marginTop: '38px', paddingTop: '16px', borderTop: '1px solid #d1d5db', color: '#4b5563', fontSize: '11px',
    });
    footer.append(
      create('div', 'Chat VAN 運営事務局', { color: '#111827', fontWeight: '700' }),
      create('div', '振込先', { marginTop: '10px', color: '#111827', fontWeight: '700' }),
      create('div', '相愛信用組合 2318　　本店 003', { marginTop: '3px' }),
      create('div', '普通　0170074　ド）シン　ジャパン', { marginTop: '2px' }),
      create('div', 'ご不明点はサポートまでお問い合わせください', { marginTop: '8px' }),
    );
    root.append(footer);
  }
  return root;
}

function createInvoicePdfPages(invoice: any): HTMLDivElement[] {
  const sourceItems = Array.isArray(invoice.items) && invoice.items.length > 0
    ? invoice.items
    : [{ description: '請求明細', amount: invoice.subtotal }];
  const rows = sourceItems.flatMap((item: any) => {
    const description = String(item.description ?? '').trim() || '請求明細';
    const chunks = Array.from(description).reduce<string[]>((result, character, index) => {
      const chunkIndex = Math.floor(index / 52);
      result[chunkIndex] = (result[chunkIndex] ?? '') + character;
      return result;
    }, []);
    return chunks.map((chunk, index) => ({
      description: index === 0 ? chunk : `（続き）${chunk}`,
      amount: item.amount,
      continuation: index > 0,
    }));
  });
  const groupedRows: any[][] = [];
  let currentRows: any[] = [];
  const maxPageHeight = 1080;

  rows.forEach((row: any) => {
    const candidateRows = [...currentRows, row];
    const candidate = createInvoicePdfElement(invoice, candidateRows, true, groupedRows.length > 0);
    document.body.appendChild(candidate);
    const fitsOnPage = candidate.getBoundingClientRect().height <= maxPageHeight;
    candidate.remove();
    if (!fitsOnPage && currentRows.length > 0) {
      groupedRows.push(currentRows);
      currentRows = [row];
    } else {
      currentRows = candidateRows;
    }
  });
  if (currentRows.length > 0) groupedRows.push(currentRows);

  return groupedRows.map((pageRows, index) => createInvoicePdfElement(
    invoice,
    pageRows,
    index === groupedRows.length - 1,
    index > 0,
  ));
}

// ─── GPS Map Component ────────────────────────────────────────────────────────
const GpsMap: React.FC<{ locs: any[] }> = ({ locs }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    const container = mapRef.current;
    if (!container || locs.length === 0) return;
    let disposed = false;

    import('leaflet').then(L => {
      // タブ切替などでコンポーネントが破棄された後に、非同期読み込みが
      // 完了しても地図を初期化しない。
      if (disposed || !container.isConnected) return;

      // Fix default icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const latest = locs[0];
      const center: [number, number] = [Number(latest.latitude), Number(latest.longitude)];
      const map = L.map(container).setView(center, 15);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // ルートポリライン（古い順）
      const coords: [number, number][] = [...locs].reverse().map(l => [Number(l.latitude), Number(l.longitude)]);
      L.polyline(coords, { color: '#000', weight: 2, opacity: 0.6 }).addTo(map);

      // 最新位置マーカー
      L.marker(center)
        .addTo(map)
        .bindPopup(
          `<b>最新位置</b><br>${latest.recorded_at ? new Date(latest.recorded_at).toLocaleString('ja-JP') : '-'}<br>精度: ±${Math.round(Number(latest.accuracy ?? 0))}m`
        )
        .openPopup();

      // 古いポイントを小さい円で
      locs.slice(1).forEach(l => {
        L.circleMarker([Number(l.latitude), Number(l.longitude)], {
          radius: 3, color: '#666', fillColor: '#999', fillOpacity: 0.7, weight: 1,
        }).addTo(map).bindPopup(
          l.recorded_at ? new Date(l.recorded_at).toLocaleString('ja-JP') : '-'
        );
      });
    }).catch(error => console.error('GPS地図の初期化に失敗しました:', error));

    return () => {
      disposed = true;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [locs]);

  if (locs.length === 0) return (
    <p className="text-sm text-muted-foreground py-4 text-center">位置情報はまだ送信されていません。</p>
  );

  return <div ref={mapRef} style={{ height: 420, borderRadius: 8 }} />;
};

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

function toTokyoDatetimeLocal(value?: string | Date | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

type Tab = 'overview' | 'customer' | 'vehicle' | 'chat'
         | 'contract' | 'payment' | 'gps' | 'incident';

const TABS: { id: Tab; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'overview',    label: '概要',           icon: ClipboardList },
  { id: 'customer',    label: '顧客情報',       icon: User },
  { id: 'vehicle',     label: '車両情報',       icon: Car },
  { id: 'contract',    label: '契約',           icon: ScrollText },
  { id: 'payment',     label: '決済',           icon: Wallet },
 
  { id: 'gps',         label: 'GPS',            icon: MapPinned },
  { id: 'incident',    label: '事故・故障',     icon: AlertTriangle },
 
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

  // 受け取り日時場所
  const [pickupForm, setPickupForm] = useState({ address: '', datetime: '' });
  const [pickupSaving, setPickupSaving] = useState(false);

  // カード決済 再決済 / 手動入金確認
  const [paymentConfirming, setPaymentConfirming] = useState<number | null>(null);
  const retryPayment = async (paymentId: number, hasCard: boolean) => {
    const msg = hasCard
      ? '登録済みカードで再決済しますか？'
      : 'カード情報がないため手動入金確認として記録します。よろしいですか？';
    if (!confirm(msg)) return;
    setPaymentConfirming(paymentId);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/payment-retries/${paymentId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: !hasCard }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? '');
      toast({ title: json.method === 'card' ? '再決済が完了しました' : '手動入金確認しました' });
      loadRelated(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'エラー', description: e.message || '更新に失敗しました' });
    } finally { setPaymentConfirming(null); }
  };

  // 追加決済
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addPaymentForm, setAddPaymentForm] = useState({ amount: '', description: '', method: 'invoice', dueDate: '' });
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);
  const handleAddPayment = async () => {
    if (!addPaymentForm.amount || Number(addPaymentForm.amount) <= 0) {
      toast({ variant: 'destructive', title: '金額を正しく入力してください' }); return;
    }
    if (!addPaymentForm.description) {
      toast({ variant: 'destructive', title: '摘要を入力してください' }); return;
    }
    const contractId = related?.contracts?.[0]?.id;
    if (!contractId) { toast({ variant: 'destructive', title: '契約が見つかりません' }); return; }
    setAddPaymentLoading(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/contracts/${contractId}/additional-charge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(addPaymentForm.amount),
          description: addPaymentForm.description,
          method: addPaymentForm.method,
          dueDate: addPaymentForm.dueDate || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? '');
      toast({ title: json.method === 'card' ? 'カード決済が完了しました' : `請求書（${json.invoiceNumber}）を作成しました` });
      setShowAddPayment(false);
      setAddPaymentForm({ amount: '', description: '', method: 'invoice', dueDate: '' });
      loadRelated(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || '追加決済に失敗しました' });
    } finally { setAddPaymentLoading(false); }
  };

  // 請求書ステータス変更
  const [invoiceUpdating, setInvoiceUpdating] = useState<number | null>(null);
  const [invoiceIssuing, setInvoiceIssuing] = useState(false);
  const [invoiceDownloading, setInvoiceDownloading] = useState<number | null>(null);
  const issueInvoice = async () => {
    const contract = related?.contracts?.find(
      (c: any) => c.payment_method === 'invoice' && c.status === 'active',
    );
    if (!contract?.id) {
      toast({ variant: 'destructive', title: '請求書を発行できる利用中の掛け払い契約が見つかりません' });
      return;
    }
    if (!confirm('今月分の請求書を発行しますか？')) return;
    setInvoiceIssuing(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/contracts/${contract.id}/invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? '請求書の発行に失敗しました');
      toast({ title: json.alreadyIssued ? 'この期間の請求書は発行済みです' : `請求書（${json.invoice?.invoice_number ?? ''}）を発行しました` });
      loadRelated(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: e.message || '請求書の発行に失敗しました' });
    } finally {
      setInvoiceIssuing(false);
    }
  };

  const updateInvoiceStatus = async (invoiceId: number, status: string) => {
    setInvoiceUpdating(invoiceId);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      const label: Record<string,string> = { paid: '入金済み', pending: '未払い', overdue: '延滞', cancelled: 'キャンセル' };
      toast({ title: `請求書を「${label[status]}」に変更しました` });
      loadRelated(true);
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '更新に失敗しました' });
    } finally { setInvoiceUpdating(null); }
  };

  const downloadInvoicePdf = async (invoiceId: number) => {
    setInvoiceDownloading(invoiceId);
    let invoicePages: HTMLDivElement[] = [];
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      if (!token) throw new Error('ログイン情報を確認できませんでした。再度ログインしてください。');
      const response = await fetch(`${import.meta.env.BASE_URL}api/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const invoice = await response.json();
      if (!response.ok) throw new Error(invoice.error ?? '請求書を取得できませんでした');

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      invoicePages = createInvoicePdfPages(invoice);
      document.body.append(...invoicePages);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({ title: `請求書 ${invoice.invoiceNumber ?? invoiceId}`, subject: 'Chat VAN 請求書' });

      const pageWidth = 210;
      for (let page = 0; page < invoicePages.length; page += 1) {
        const rendered = await html2canvas(invoicePages[page], { backgroundColor: '#ffffff', scale: 2 });
        if (page > 0) pdf.addPage();
        pdf.addImage(
          rendered.toDataURL('image/png'),
          'PNG',
          0,
          0,
          pageWidth,
          rendered.height * (pageWidth / rendered.width),
        );
      }
      const safeNumber = String(invoice.invoiceNumber ?? `invoice-${invoiceId}`).replace(/[^\w.-]+/g, '_');
      pdf.save(`${safeNumber}.pdf`);
      toast({ title: 'PDFをダウンロードしました' });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'PDFを作成できませんでした',
        description: e.message ?? '時間をおいてもう一度お試しください。',
      });
    } finally {
      invoicePages.forEach(page => page.remove());
      setInvoiceDownloading(null);
    }
  };

  // 追加タブ用関連データ
  const [related, setRelated] = useState<any>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const RELATED_TABS: Tab[] = ['overview', 'contract', 'payment', 'gps', 'incident'];
  const invoicePaymentContractIds = new Set(
    (related?.contracts ?? [])
      .filter((contract: any) => contract.payment_method === 'invoice')
      .map((contract: any) => Number(contract.id)),
  );
  const activeInvoicePaymentContractIds = new Set(
    (related?.contracts ?? [])
      .filter((contract: any) => contract.payment_method === 'invoice' && contract.status === 'active')
      .map((contract: any) => Number(contract.id)),
  );
  const invoicePaymentInvoices = (related?.invoices ?? []).filter((invoice: any) =>
    invoicePaymentContractIds.has(Number(invoice.contract_id)),
  );
  const activeInvoicePaymentInvoices = invoicePaymentInvoices.filter((invoice: any) =>
    activeInvoicePaymentContractIds.has(Number(invoice.contract_id)),
  );
  const hasInvoicePaymentContract = invoicePaymentContractIds.size > 0;
  const canIssueInvoice = activeInvoicePaymentContractIds.size > 0;

  const loadRelated = async (force = false) => {
    if ((!force && related) || relatedLoading) return;
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

  // GPSタブを開いている間は、利用者端末や車載GPSから届いた最新位置を更新する。
  React.useEffect(() => {
    if (tab !== 'gps') return;
    loadRelated(true);
    const timer = window.setInterval(() => loadRelated(true), 15_000);
    return () => window.clearInterval(timer);
  }, [tab]);

  // 契約データからpickup情報を初期化
  React.useEffect(() => {
    if (!related) return;
    const c = related.contracts?.[0];
    if (!c) return;
    setPickupForm({
      address: c.pickup_address ?? '',
      datetime: toTokyoDatetimeLocal(c.pickup_datetime)
        || (c.start_date ? `${String(c.start_date).slice(0, 10)}T00:00` : ''),
    });
  }, [related]);

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

  const savePickup = async (sendNotif: boolean) => {
    const contractId = related?.contracts?.[0]?.id;
    if (!contractId) return;
    setPickupSaving(true);
    try {
      const token = localStorage.getItem('sinjapan_auth_token');
      const r = await fetch(`${import.meta.env.BASE_URL}api/van/contracts/${contractId}/pickup`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: pickupForm.address,
          pickupDatetime: pickupForm.datetime || null,
          deliveryDate: pickupForm.datetime ? pickupForm.datetime.slice(0, 10) : null,
          sendNotification: sendNotif,
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || '保存に失敗しました');
      const notificationFailed = sendNotif && Object.values(result.notification || {}).some((status: unknown) => status === 'failed');
      toast({
        title: sendNotif ? '納車・受け取り情報を保存し、通知を送信しました' : '納車・受け取り情報を保存しました',
        description: notificationFailed ? '一部の通知を送信できませんでした。通知履歴をご確認ください。' : undefined,
      });
      loadRelated(true);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: err instanceof Error ? err.message : '保存に失敗しました',
      });
    } finally { setPickupSaving(false); }
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
  const pickupContract = related?.contracts?.[0] as any;
  const companyPickupAddress = pickupContract?.rental_company_address || '';
  const effectivePickupAddress = pickupForm.address.trim() || companyPickupAddress;
  const optionContracts = related?.contracts ?? [];
  const hasBlackNumberOption = optionContracts.some((contract: any) =>
    contract.black_number_requested === true || contract.black_number_requested === 'true' || contract.black_number_requested === 't',
  );
  const hasInsuranceReferralOption = optionContracts.some((contract: any) =>
    contract.insurance_referral_requested === true || contract.insurance_referral_requested === 'true' || contract.insurance_referral_requested === 't',
  );
  const optionFee = optionContracts.reduce((total: number, contract: any) => total + Number(contract.options_fee ?? 0), 0);

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
            {related && optionContracts.length > 0 && (
              <Section title="オプション申請">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                  {hasBlackNumberOption && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-full">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      黒ナンバー取得申請あり
                    </span>
                  )}
                  {hasInsuranceReferralOption && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-full">
                      <Shield className="h-3.5 w-3.5" />
                      保険紹介申請あり
                    </span>
                  )}
                  {!hasBlackNumberOption && !hasInsuranceReferralOption && (
                    <span className="text-sm text-muted-foreground">オプション申請はありません。</span>
                  )}
                  </div>
                  {optionFee > 0 && (
                    <p className="text-sm font-medium">オプション料金: {yen(optionFee)}</p>
                  )}
                </div>
              </Section>
            )}

            {/* 納車・受け取り日時・場所 */}
            {related && (related.contracts ?? []).length > 0 && (
              <Section title="納車・受け取り日時・場所">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">納車・受け取り日時</label>
                    <input
                      type="datetime-local"
                      value={pickupForm.datetime}
                      onChange={e => setPickupForm(p => ({ ...p, datetime: e.target.value }))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">この日時を納車予定と受け取り予定の両方に反映します。</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">現在の受け取り場所</label>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <p className="font-medium">{effectivePickupAddress || '未設定'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pickupForm.address.trim() ? '管理者による個別指定' : '協力会社所在地（既定）'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">個別に変更する場合の受け取り場所</label>
                    <input
                      type="text"
                      value={pickupForm.address}
                      onChange={e => setPickupForm(p => ({ ...p, address: e.target.value }))}
                      placeholder={companyPickupAddress || '例：神奈川県横浜市中区○○1-2-3 駐車場'}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      空欄で保存すると、協力会社の所在地を受け取り場所として使用します。
                    </p>
                    {(related.contracts?.[0] as any)?.rental_company_name && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        貸出元: {(related.contracts?.[0] as any).rental_company_name}
                        {(related.contracts?.[0] as any).rental_company_address
                          ? `（所在地: ${(related.contracts?.[0] as any).rental_company_address}）`
                          : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => savePickup(false)}
                      disabled={pickupSaving}
                      className="flex items-center gap-1 px-3 py-1.5 border border-border text-xs font-medium rounded-lg hover:bg-muted disabled:opacity-50"
                    >
                      {pickupSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      保存
                    </button>
                    <button
                      onClick={() => savePickup(true)}
                      disabled={pickupSaving}
                      className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {pickupSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                      保存して両者へ通知
                    </button>
                  </div>
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

            {/* チャット履歴 */}
            <Section title={`チャット履歴（${messages?.length || 0}件）`}>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {!messages?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">メッセージはありません</p>
                ) : messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-muted-foreground mb-1 mx-1">
                      {msg.role === 'user' ? 'ユーザー' : 'AI'} · {format(new Date(msg.createdAt), 'HH:mm')}
                    </span>
                    <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-foreground text-background rounded-br-sm'
                        : 'bg-muted border border-border text-foreground rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
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
                  {(iv.emergencyContactName || iv.emergency_contact_name) && (
                    <>
                      <DL label="緊急連絡先（氏名）" value={iv.emergencyContactName ?? iv.emergency_contact_name} />
                      <DL label="緊急連絡先（電話）" value={iv.emergencyContactPhone ?? iv.emergency_contact_phone} />
                      <DL label="続柄" value={iv.emergencyContactRelation ?? iv.emergency_contact_relation} />
                    </>
                  )}
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

          {/* 審査結果カード */}
          <Section title={`審査結果（${related?.screening?.length ?? 0}件）`}>
            {relatedLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !related?.screening?.length ? (
              <p className="text-sm text-muted-foreground py-2 text-center">審査記録はありません</p>
            ) : related.screening.map((s: any) => (
              <div key={s.id} className="border border-border rounded-xl p-4 mb-3 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    s.result === 'approved'    ? 'bg-muted border-border text-foreground' :
                    s.result === 'rejected'    ? 'bg-muted border-border text-muted-foreground' :
                    s.result === 'conditional' ? 'bg-muted border-border text-foreground' :
                    'bg-muted border-border text-muted-foreground'
                  }`}>
                    {s.result === 'approved' ? '承認' : s.result === 'rejected' ? '否決' : s.result === 'conditional' ? '条件付き承認' : '審査中'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.created_at ? format(new Date(s.created_at), 'yyyy/MM/dd HH:mm') : ''}
                  </span>
                </div>
                {s.reason && <p className="text-sm mb-1"><span className="text-xs text-muted-foreground block mb-0.5">審査理由</span>{s.reason}</p>}
                {s.conditions && <p className="text-sm mb-1"><span className="text-xs text-muted-foreground block mb-0.5">承認条件</span>{s.conditions}</p>}
                {s.risk_notes && <p className="text-xs bg-muted border border-border rounded-lg p-3 mt-1">{s.risk_notes}</p>}
              </div>
            ))}
          </Section>
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
                {proposedVehicles.map((v: any) => {
                  const photos: string[] = (() => { try { return JSON.parse(v.photos ?? '[]'); } catch { return []; } })();
                  return (
                  <div key={v.id} className="border border-border rounded-xl overflow-hidden">
                    {/* 写真ギャラリー */}
                    {photos.length > 0 && (
                      <div className="flex gap-1 overflow-x-auto bg-muted/30 p-2">
                        {photos.map((p: string, i: number) => (
                          <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`車両写真${i+1}`}
                            className="h-40 w-auto rounded-lg object-cover shrink-0 border border-border" />
                        ))}
                      </div>
                    )}

                    <div className="p-4 space-y-4">
                      {/* ヘッダー */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-base">{v.maker} {v.model}{v.grade ? ` ${v.grade}` : ''}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {v.year ? `${v.year}年式` : '-'} / {v.prefecture}{v.locationDetail ? ` ${v.locationDetail}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xl font-bold">{yen(v.userPrice)}<span className="text-xs font-normal text-muted-foreground">/月（税込）</span></p>
                          <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted">{v.status}</span>
                        </div>
                      </div>

                      {/* 基本スペック */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">基本スペック</p>
                        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <DL label="ナンバー" value={v.licensePlate} />
                          <DL label="車台番号(VIN)" value={v.vin} />
                          <DL label="走行距離" value={v.mileage ? `${Number(v.mileage).toLocaleString()} km` : null} />
                          <DL label="車検満了" value={v.inspectionExpiry} />
                          <DL label="最低期間" value={v.minPeriodMonths ? `${v.minPeriodMonths}ヶ月〜` : null} />
                          <DL label="最大期間" value={v.maxPeriodMonths ? `${v.maxPeriodMonths}ヶ月` : null} />
                          <DL label="走行上限" value={v.mileageLimit ? `${Number(v.mileageLimit).toLocaleString()} km/月` : null} />
                          <DL label="超過料金" value={v.excessMileageFee ? `${yen(v.excessMileageFee)}/km` : null} />
                          <DL label="喫煙" value={v.smokingPolicy === 'no_smoking' ? '禁煙' : v.smokingPolicy === 'smoking_ok' ? '喫煙可' : v.smokingPolicy} />
                          <DL label="黒ナンバー" value={v.blackNumberStatus} />
                        </dl>
                      </div>

                      {/* 装備 */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">装備</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: 'ETC', val: v.hasEtc },
                            { label: 'ドラレコ', val: v.hasDashcam },
                            { label: 'バックカメラ', val: v.hasBackupCam },
                          ].map(e => (
                            <span key={e.label} className={`text-xs px-2.5 py-1 rounded-full border ${e.val ? 'border-border bg-muted text-foreground' : 'border-border text-muted-foreground line-through'}`}>
                              {e.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 保険情報 */}
                      {(v.insuranceCompany || v.insuranceExpiry || v.compulsoryInsuranceExpiry) && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">保険情報</p>
                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                            <DL label="保険会社" value={v.insuranceCompany} />
                            <DL label="証券番号" value={v.insurancePolicyNumber} />
                            <DL label="保険連絡先" value={v.insuranceContact} />
                            <DL label="任意保険満了" value={v.insuranceExpiry} />
                            <DL label="自賠責満了" value={v.compulsoryInsuranceExpiry} />
                          </dl>
                        </div>
                      )}

                      {/* 料金内訳 */}
                      <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">料金内訳</p>
                        <div className="flex justify-between"><span className="text-muted-foreground">レンタル会社受取</span><span>{yen(v.monthlyPrice)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">SIN JAPAN手数料</span><span>{yen(v.sinJapanFee)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">保険料</span><span>{yen(v.insuranceFee)}</span></div>
                        <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                          <span>ユーザー月額（税込）</span><span>{yen(Math.round(v.userPrice * 1.1))}</span>
                        </div>
                      </div>

                      {/* レンタル会社 */}
                      {v.rentalCompany && (
                        <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">レンタル会社：</span>
                          {v.rentalCompany.name}
                          {v.rentalCompany.phone && ` / TEL: ${v.rentalCompany.phone}`}
                        </div>
                      )}

                      {v.notes && <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{v.notes}</p>}
                    </div>
                  </div>
                  );
                })}
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
                vehicles={vehiclesData ?? []}
                onCreated={() => { loadRelated(true); }}
              />
            )}
            {related?.contracts?.length === 0 && !['approved','contracting'].includes(application.status) && (
              <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">契約はありません</div>
            )}
            {(related?.contracts ?? []).map((c: any) => {
              const vPhotos: string[] = (() => { try { return JSON.parse(c.vehicle_photos ?? '[]'); } catch { return []; } })();
              const pickupPhotos: string[] = (() => { try { return JSON.parse(c.pickup_photos ?? '[]'); } catch { return []; } })();
              const returnPhotos: string[] = (() => { try { return JSON.parse(c.return_photos ?? '[]'); } catch { return []; } })();
              const pickupDocs: Record<string,string> = (() => { try { const v = JSON.parse(c.pickup_documents ?? 'null'); return (v && !Array.isArray(v)) ? v : {}; } catch { return {}; } })();
              const returnDocs: Record<string,string> = (() => { try { const v = JSON.parse(c.return_documents ?? 'null'); return (v && !Array.isArray(v)) ? v : {}; } catch { return {}; } })();
              const DOC_LABELS: Record<string,string> = { shakken: '車検証', kiroku: '検査証記録事項', jibaiseki: '自賠責', ninni: '任意保険' };
              const sig = (() => { try { const p = JSON.parse(c.signature_data ?? 'null'); return p?.signature ?? null; } catch { return null; } })();
              const CONTRACT_STATUS: Record<string, string> = {
                pending_payment: '決済待ち', active: '利用中', delivery_pending: '納車待ち',
                return_pending: '返却予定', payment_issue: '支払い問題',
                completed: '契約終了', cancelled: '解約',
              };
              return (
              <div key={c.id} className="border border-border rounded-xl overflow-hidden">
                {/* 車両写真 */}
                {vPhotos.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto bg-muted/30 p-2">
                    {vPhotos.map((p, i) => (
                      <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`車両写真${i+1}`}
                        className="h-36 w-auto rounded-lg object-cover shrink-0 border border-border" />
                    ))}
                  </div>
                )}

                <div className="p-4 space-y-5">
                  {/* ヘッダー */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{c.maker} {c.model}{c.grade ? ` ${c.grade}` : ''}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">契約番号: {c.contract_number ?? `#${c.id}`}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`${import.meta.env.BASE_URL}api/van/contracts/${c.id}/print`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"
                      >
                        📄 契約書PDF
                      </a>
                      <span className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted">
                        {CONTRACT_STATUS[c.status] ?? c.status}
                      </span>
                    </div>
                  </div>

                  {/* 契約内容 */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">契約内容</p>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <DL label="月額" value={c.monthly_price ? `¥${Number(c.monthly_price).toLocaleString()}` : null} />
                      <DL label="開始日" value={c.start_date} />
                      <DL label="終了予定" value={c.planned_end_date ?? c.end_date} />
                      <DL label="支払日" value={c.payment_day ? `毎月${c.payment_day}日` : null} />
                      <DL label="支払方法" value={c.payment_method === 'invoice' ? '請求書払い' : c.payment_method === 'card' ? 'カード' : c.payment_method} />
                      <DL label="最低期間" value={c.minimum_term ? `${c.minimum_term}ヶ月` : null} />
                    </dl>
                  </div>

                  {/* 車両スペック */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">車両スペック</p>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <DL label="ナンバー" value={c.license_plate} />
                      <DL label="VIN" value={c.vin} />
                      <DL label="都道府県" value={c.prefecture} />
                      <DL label="年式" value={c.year ? `${c.year}年式` : null} />
                      <DL label="走行距離" value={c.mileage ? `${Number(c.mileage).toLocaleString()} km` : null} />
                      <DL label="車検満了" value={c.inspection_expiry} />
                      <DL label="走行上限" value={c.mileage_limit ? `${Number(c.mileage_limit).toLocaleString()} km/月` : null} />
                      <DL label="超過料金" value={c.excess_mileage_fee ? `¥${Number(c.excess_mileage_fee).toLocaleString()}/km` : null} />
                      <DL label="喫煙" value={c.smoking_policy === 'no_smoking' ? '禁煙' : c.smoking_policy === 'smoking_ok' ? '喫煙可' : c.smoking_policy} />
                    </dl>
                    <div className="flex gap-2 mt-2">
                      {[['ETC', c.has_etc], ['ドラレコ', c.has_dashcam], ['バックカメラ', c.has_backup_cam]].map(([lbl, val]) => (
                        <span key={lbl as string} className={`text-xs px-2.5 py-1 rounded-full border ${val ? 'border-border bg-muted' : 'border-border text-muted-foreground line-through'}`}>{lbl}</span>
                      ))}
                    </div>
                  </div>

                  {/* レンタル会社 */}
                  {(c.rental_company_name || c.platform_operator) && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">会社情報</p>
                      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <DL label="レンタル会社" value={c.rental_company_name} />
                        <DL label="電話" value={c.rental_company_phone} />
                        <DL label="プラットフォーム" value={c.platform_operator} />
                      </dl>
                    </div>
                  )}

                  {/* 締結書類・同意 */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">締結書類・同意記録</p>
                    <div className="space-y-2 text-sm">
                      {[
                        { label: 'プラットフォーム契約同意', val: c.platform_contract_agreed_at },
                        { label: '車両貸渡契約同意', val: c.vehicle_contract_agreed_at },
                        { label: '利用規約同意', val: c.terms_agreed_at },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                          <span className="text-sm">{label}</span>
                          {val ? (
                            <span className="text-xs text-muted-foreground">{format(new Date(val), 'yyyy/MM/dd HH:mm')}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">未同意</span>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between py-1.5 border-b border-border">
                        <span className="text-sm">GPS利用同意</span>
                        <span className={`text-xs ${c.gps_consent ? 'text-foreground' : 'text-muted-foreground'}`}>{c.gps_consent ? '同意済み' : '未同意'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 電子署名 */}
                  {sig && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">電子署名</p>
                      <img src={sig} alt="電子署名" className="h-20 border border-border rounded-lg bg-white p-1" />
                    </div>
                  )}

                  {/* 納車時 */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">納車時</p>
                    <p className="text-xs text-muted-foreground mb-1.5">車両写真</p>
                    {pickupPhotos.length > 0 ? (
                      <div className="flex gap-2 flex-wrap mb-4">
                        {pickupPhotos.map((p, i) => (
                          <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`納車写真${i+1}`}
                            className="h-28 w-auto rounded-lg border border-border object-cover" />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-4">写真なし</p>
                    )}
                    <p className="text-xs text-muted-foreground mb-1.5">所定書類</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.entries(DOC_LABELS).map(([key, label]) => {
                        const path = pickupDocs[key];
                        return (
                          <div key={key} className="border border-border rounded-xl overflow-hidden">
                            {path ? (
                              <a href={`${import.meta.env.BASE_URL}api/storage${path}`} target="_blank" rel="noopener noreferrer">
                                <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label}
                                  className="w-full h-20 object-cover" />
                              </a>
                            ) : (
                              <div className="w-full h-20 bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">未提出</span>
                              </div>
                            )}
                            <p className="text-xs text-center py-1 border-t border-border text-muted-foreground">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 返却時 */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">返却時</p>
                    <p className="text-xs text-muted-foreground mb-1.5">車両写真</p>
                    {returnPhotos.length > 0 ? (
                      <div className="flex gap-2 flex-wrap mb-4">
                        {returnPhotos.map((p, i) => (
                          <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`返却写真${i+1}`}
                            className="h-28 w-auto rounded-lg border border-border object-cover" />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-4">写真なし</p>
                    )}
                    <p className="text-xs text-muted-foreground mb-1.5">所定書類</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.entries(DOC_LABELS).map(([key, label]) => {
                        const path = returnDocs[key];
                        return (
                          <div key={key} className="border border-border rounded-xl overflow-hidden">
                            {path ? (
                              <a href={`${import.meta.env.BASE_URL}api/storage${path}`} target="_blank" rel="noopener noreferrer">
                                <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label}
                                  className="w-full h-20 object-cover" />
                              </a>
                            ) : (
                              <div className="w-full h-20 bg-muted flex items-center justify-center">
                                <span className="text-xs text-muted-foreground">未提出</span>
                              </div>
                            )}
                            <p className="text-xs text-center py-1 border-t border-border text-muted-foreground">{label}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 特記事項 */}
                  {c.special_terms && <p className="text-xs bg-muted rounded-lg p-3"><span className="font-medium block mb-1">特記事項</span>{c.special_terms}</p>}
                </div>
              </div>
              );
            })}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: 決済
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'payment' && (
        <div className="space-y-4">
          {/* 追加決済ボタン */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddPayment(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 transition"
            >
              <Plus className="h-4 w-4" />追加決済
            </button>
          </div>

          {/* 追加決済モーダル */}
          {showAddPayment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddPayment(false)}>
              <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">追加決済</h2>
                  <button onClick={() => setShowAddPayment(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">金額（税抜）</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">¥</span>
                      <input type="number" min="1" placeholder="例: 10000"
                        value={addPaymentForm.amount}
                        onChange={e => setAddPaymentForm(f => ({ ...f, amount: e.target.value }))}
                        className="w-full pl-7 pr-3 py-2 border rounded-lg text-sm outline-none focus:border-foreground/50" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">摘要</label>
                    <input type="text" placeholder="例: 修理費・超過走行料金"
                      value={addPaymentForm.description}
                      onChange={e => setAddPaymentForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-foreground/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">支払方法</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([['invoice', '請求書払い'], ['card', 'カード決済']] as const).map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => setAddPaymentForm(f => ({ ...f, method: val }))}
                          className={`py-2 text-sm rounded-lg border transition ${addPaymentForm.method === val ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {addPaymentForm.method === 'card' && !related?.userCard?.hasCardOnFile && (
                      <p className="text-xs text-amber-600">⚠ 登録済みカードがないためカード決済は利用できません</p>
                    )}
                  </div>
                  {addPaymentForm.method === 'invoice' && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">支払期限 <span className="text-muted-foreground font-normal">（任意）</span></label>
                      <input type="date"
                        value={addPaymentForm.dueDate}
                        onChange={e => setAddPaymentForm(f => ({ ...f, dueDate: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowAddPayment(false)} className="flex-1 py-2 text-sm border rounded-lg hover:bg-muted">キャンセル</button>
                  <button onClick={handleAddPayment} disabled={addPaymentLoading}
                    className="flex-1 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {addPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    決済する
                  </button>
                </div>
              </div>
            </div>
          )}

          {relatedLoading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : (
            <>
            {hasInvoicePaymentContract && (
              <Section title="掛け払い・請求書発行状況">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">支払方法</p>
                    <p className="font-medium">請求書払い（掛け払い）</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">請求書発行状況</p>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      activeInvoicePaymentInvoices.length > 0
                        ? 'bg-green-100 text-green-700'
                        : canIssueInvoice ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                    }`}>
                      {!canIssueInvoice
                        ? '発行対象外'
                        : activeInvoicePaymentInvoices.length > 0
                          ? `発行済み（${activeInvoicePaymentInvoices.length}件）`
                          : '未発行'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {!canIssueInvoice
                      ? '利用中の掛け払い契約がないため、新しい請求書は発行できません。'
                      : activeInvoicePaymentInvoices.length === 0
                        ? '請求書が発行されると、下の請求書発行履歴に追加されます。'
                        : '発行後の入金状況は履歴のステータスから変更できます。'}
                  </p>
                  {canIssueInvoice && (
                    <button
                      type="button"
                      onClick={issueInvoice}
                      disabled={invoiceIssuing}
                      className="px-3 py-1.5 text-xs rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {invoiceIssuing ? '発行中…' : '請求書を発行'}
                    </button>
                  )}
                </div>
              </Section>
            )}

            {/* カード決済履歴 */}
            <Section title={`カード決済履歴（${related?.payments?.length ?? 0}件）`}>
              {!related?.payments?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">カード決済履歴はありません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 text-left">対象月</th>
                    <th className="pb-2 text-left">金額</th>
                    <th className="pb-2 text-left">結果</th>
                    <th className="pb-2 text-left">試行日</th>
                    <th className="pb-2 text-left">理由</th>
                    <th className="pb-2 text-left"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {related.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-mono text-xs">{p.period_month}</td>
                        <td className="py-2.5">¥{Number(p.amount).toLocaleString()}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            p.result === 'success' ? 'border-border bg-muted text-foreground' :
                            p.result === 'failed'  ? 'border-border bg-muted text-muted-foreground' :
                            'border-border bg-muted text-muted-foreground'
                          }`}>{{ success: '成功', failed: '失敗' }[p.result as string] ?? p.result ?? '-'}</span>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{p.attempted_at ? format(new Date(p.attempted_at), 'MM/dd HH:mm') : '-'}</td>
                        <td className="py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">{p.failure_reason ?? '-'}</td>
                        <td className="py-2.5">
                          {p.result === 'failed' && (() => {
                            const hasCard = !!(related?.userCard?.hasCardOnFile);
                            return (
                              <button
                                onClick={() => retryPayment(p.id, hasCard)}
                                disabled={paymentConfirming === p.id}
                                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg disabled:opacity-50 whitespace-nowrap ${
                                  hasCard
                                    ? 'bg-foreground text-background hover:opacity-90'
                                    : 'border border-border hover:bg-muted'
                                }`}
                              >
                                {paymentConfirming === p.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Check className="h-3 w-3" />}
                                {hasCard ? '再決済' : '手動入金確認'}
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* 請求書発行履歴 */}
            <Section title={`請求書発行履歴（${invoicePaymentInvoices.length}件）`}>
              {!invoicePaymentInvoices.length ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">発行された請求書はありません</p>
                  {hasInvoicePaymentContract && (
                    <p className="text-xs text-amber-700 mt-1">発行状況：未発行</p>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 text-left">請求書番号</th>
                    <th className="pb-2 text-left">対象期間</th>
                    <th className="pb-2 text-left">金額（税込）</th>
                    <th className="pb-2 text-left">ステータス</th>
                    <th className="pb-2 text-left">支払期限</th>
                    <th className="pb-2 text-left">入金日</th>
                    <th className="pb-2 text-right">PDF</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {invoicePaymentInvoices.map((inv: any) => {
                      const isUpdating = invoiceUpdating === inv.id;
                      const STATUS_LABEL: Record<string,string> = { draft: '下書き', sent: '発行済み', paid: '入金済み', pending: '未払い', overdue: '延滞', cancelled: 'キャンセル' };
                      return (
                      <tr key={inv.id}>
                        <td className="py-2.5 font-mono text-xs">{inv.invoice_number}</td>
                        <td className="py-2.5 text-xs text-muted-foreground">
                          {inv.period_start ? format(new Date(inv.period_start), 'yyyy/MM/dd') : '-'}
                          {' 〜 '}
                          {inv.period_end ? format(new Date(inv.period_end), 'MM/dd') : '-'}
                        </td>
                        <td className="py-2.5 font-medium">¥{Number(inv.total_amount).toLocaleString()}</td>
                        <td className="py-2.5">
                          <select
                            value={inv.status}
                            disabled={isUpdating}
                            onChange={e => updateInvoiceStatus(inv.id, e.target.value)}
                            className="text-xs px-2 py-1 border border-border rounded-lg bg-background outline-none focus:border-foreground/50 disabled:opacity-50 cursor-pointer"
                          >
                            {Object.entries(STATUS_LABEL).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                          {isUpdating && <Loader2 className="inline h-3 w-3 animate-spin ml-1 text-muted-foreground" />}
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">
                          {inv.due_date ? format(new Date(inv.due_date), 'yyyy/MM/dd') : '-'}
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">
                          {inv.paid_at ? format(new Date(inv.paid_at), 'yyyy/MM/dd') : '-'}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => downloadInvoicePdf(inv.id)}
                            disabled={invoiceDownloading === inv.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                          >
                            {invoiceDownloading === inv.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Download className="h-3 w-3" />}
                            PDFをダウンロード
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>
            </>
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
              {/* ユーザー位置情報マップ */}
              {(() => {
                const locs: any[] = related?.userLocations ?? [];
                const latest = locs[0];
                return (
                  <Section title={`位置情報（${locs.length}件）`}>
                    {/* メタ情報バー */}
                    {latest && (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground mb-3 pb-3 border-b border-border">
                        <span>最終更新: <span className="text-foreground font-medium">{format(new Date(latest.recorded_at), 'yyyy/MM/dd HH:mm:ss')}</span></span>
                        <span>精度: <span className="text-foreground">±{Math.round(Number(latest.accuracy ?? 0))}m</span></span>
                        <span>総記録数: <span className="text-foreground">{locs.length}件</span></span>
                        <a
                          href={`https://maps.google.com/?q=${latest.latitude},${latest.longitude}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 border border-border rounded-lg hover:bg-muted ml-auto"
                        >
                          <MapPinned className="h-3 w-3" />Googleマップで開く
                        </a>
                      </div>
                    )}
                    {/* Leaflet マップ */}
                    <GpsMap locs={locs} />
                    {/* 直近ログ */}
                    {locs.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-xs font-medium mb-2">直近の記録</p>
                        <div className="space-y-0.5 max-h-36 overflow-y-auto">
                          {locs.slice(0, 30).map((l: any) => (
                            <div key={l.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs gap-3">
                              <span className="text-muted-foreground tabular-nums">{l.recorded_at ? format(new Date(l.recorded_at), 'MM/dd HH:mm:ss') : '-'}</span>
                              <span className="font-mono text-muted-foreground">{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</span>
                              {l.accuracy != null && <span className="text-muted-foreground">±{Math.round(Number(l.accuracy))}m</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>
                );
              })()}

              {/* 車両搭載GPSデバイス */}
              {related?.gps?.length > 0 && related.gps.map((g: any) => {
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted"
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
              <Section key={inc.report_key ?? inc.id} title={`#${inc.id} ${
                inc.incident_type === 'accident' ? '🚨 交通事故'
                  : inc.incident_type === 'breakdown' ? '🔧 車両故障'
                  : inc.incident_type === 'theft' ? '🚨 盗難・不正使用'
                  : 'トラブル報告'
              }`}>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <DL label="ステータス" value={<span className={`px-2 py-0.5 rounded-full text-xs ${
                    ['resolved', 'closed', '解決済み'].includes(inc.status) ? 'bg-green-100 text-green-700'
                      : ['in_progress', '対応中'].includes(inc.status) ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>{
                    ({ reported: '報告済み', in_progress: '対応中', resolved: '解決済み', closed: 'クローズ' } as Record<string, string>)[inc.status] ?? inc.status
                  }</span>} />
                  <DL label="車両" value={`${inc.maker ?? ''} ${inc.model ?? ''} ${inc.license_plate ?? ''}`} />
                  <DL label="現在地" value={inc.location} />
                  <DL label="怪我あり" value={inc.has_injuries != null ? (inc.has_injuries ? 'あり' : 'なし') : null} />
                  <DL label="警察対応" value={inc.police_contacted != null ? (inc.police_contacted ? '済み' : '未') : null} />
                  <DL label="報告日時" value={inc.created_at ? format(new Date(inc.created_at), 'yyyy/MM/dd HH:mm') : null} />
                  {inc.description && <DL label="報告内容" value={<span className="whitespace-pre-line">{inc.description}</span>} span2 />}
                </dl>
              </Section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
