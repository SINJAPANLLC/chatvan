import React, { useEffect, useState, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  Loader2, ChevronLeft, FileText, Calendar, Phone, Mail, Filter,
  User, Car, ScrollText, Wallet, MapPinned, AlertTriangle,
  ClipboardList, Truck, RotateCcw, MapPin, Shield, BadgeCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, isValid } from 'date-fns';

const API  = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const tok  = () => localStorage.getItem('sinjapan_auth_token') ?? '';
const yen  = (n: number | null | undefined) => n != null ? `¥${Number(n).toLocaleString()}` : '—';
const fmtD = (d?: string | null) => { if (!d) return '—'; try { const p = parseISO(d); return isValid(p) ? format(p, 'yyyy/MM/dd') : d; } catch { return d; } };
const fmtDT = (d?: string | null) => { if (!d) return '—'; try { const p = new Date(d); return isValid(p) ? format(p, 'yyyy/MM/dd HH:mm') : d; } catch { return d; } };

// ─── ステータス ───────────────────────────────────────────────────────────────
const STATUS_OPTS = [
  { value: 'pending_payment',  label: '決済待ち',  cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'delivery_pending', label: '納車待ち',  cls: 'bg-blue-50 text-blue-700 border-blue-200'       },
  { value: 'active',           label: '利用中',    cls: 'bg-green-50 text-green-700 border-green-200'    },
  { value: 'return_pending',   label: '返却予定',  cls: 'bg-amber-50 text-amber-700 border-amber-200'    },
  { value: 'payment_issue',    label: '未払い',    cls: 'bg-red-50 text-red-700 border-red-200'          },
  { value: 'completed',        label: '契約終了',  cls: 'bg-gray-100 text-gray-700 border-gray-200'      },
  { value: 'cancelled',        label: '解約',      cls: 'bg-red-100 text-red-800 border-red-200'         },
];
const statusCls   = (s: string) => STATUS_OPTS.find(o => o.value === s)?.cls   ?? 'bg-gray-100 text-gray-600 border-gray-200';
const statusLabel = (s: string) => STATUS_OPTS.find(o => o.value === s)?.label ?? s;

const FILTERS = [
  { key: 'all',              label: 'すべて'   },
  { key: 'delivery_pending', label: '納車待ち' },
  { key: 'active',           label: '利用中'   },
  { key: 'return_pending',   label: '返却予定' },
  { key: 'payment_issue',    label: '未払い'   },
  { key: 'completed',        label: '完了'     },
];

type DetailTab = 'overview' | 'customer' | 'vehicle' | 'contract' | 'payment' | 'gps' | 'incident';
const TABS: { id: DetailTab; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'overview',  label: '概要',     icon: ClipboardList  },
  { id: 'customer',  label: '顧客',     icon: User           },
  { id: 'vehicle',   label: '車両',     icon: Car            },
  { id: 'contract',  label: '契約',     icon: ScrollText     },
  { id: 'payment',   label: '決済',     icon: Wallet         },
  { id: 'gps',       label: 'GPS',      icon: MapPinned      },
  { id: 'incident',  label: '事故・故障', icon: AlertTriangle },
];

// ─── GPS マップ ───────────────────────────────────────────────────────────────
const GpsMap: React.FC<{ locs: any[] }> = ({ locs }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  useEffect(() => {
    if (!mapRef.current || locs.length === 0) return;
    import('leaflet').then(L => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; }
      const latest = locs[0];
      const center: [number, number] = [Number(latest.latitude), Number(latest.longitude)];
      const map = L.map(mapRef.current!).setView(center, 15);
      mapInst.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      const coords: [number, number][] = [...locs].reverse().map(l => [Number(l.latitude), Number(l.longitude)]);
      L.polyline(coords, { color: '#000', weight: 2, opacity: 0.6 }).addTo(map);
      L.marker(center).addTo(map).bindPopup(`<b>最新位置</b><br>${fmtDT(latest.recorded_at)}`).openPopup();
      locs.slice(1).forEach(l => {
        L.circleMarker([Number(l.latitude), Number(l.longitude)], { radius: 3, color: '#666', fillColor: '#999', fillOpacity: 0.7, weight: 1 }).addTo(map);
      });
    });
    return () => { if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; } };
  }, [locs]);
  if (locs.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">位置情報はまだ送信されていません。</p>;
  return <div ref={mapRef} style={{ height: 400, borderRadius: 8 }} />;
};

// ─── Section / DL ────────────────────────────────────────────────────────────
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
function DL({ label, value, span2 }: { label: string; value?: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm font-medium">{value ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

// ─── 詳細ビュー ───────────────────────────────────────────────────────────────
function ContractDetail({ contract, onBack }: { contract: any; onBack: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [related, setRelated] = useState<any>(null);
  const [relLoading, setRelLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const RELATED_TABS: DetailTab[] = ['contract', 'payment', 'gps', 'incident'];
  const appId = contract.application_id;

  const loadRelated = async () => {
    if (related || relLoading || !appId) return;
    setRelLoading(true);
    try {
      const r = await fetch(API(`/van/applications/${appId}/related`), { headers: { Authorization: `Bearer ${tok()}` } });
      if (r.ok) setRelated(await r.json());
    } finally { setRelLoading(false); }
  };

  useEffect(() => { if (RELATED_TABS.includes(tab)) loadRelated(); }, [tab]);

  const confirmPickup = async () => {
    if (!appId || !confirm('受取確認を行いますか？')) return;
    setConfirming('pickup');
    try {
      const r = await fetch(API(`/van/applications/${appId}/confirm-pickup`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` }, body: JSON.stringify({}),
      });
      if (r.ok) { toast({ title: '受取確認が完了しました' }); onBack(); }
      else { const e = await r.json(); toast({ variant: 'destructive', title: e.error ?? '確認に失敗しました' }); }
    } finally { setConfirming(null); }
  };

  const confirmReturn = async () => {
    if (!appId || !confirm('返却確認を行いますか？')) return;
    setConfirming('return');
    try {
      const r = await fetch(API(`/van/applications/${appId}/confirm-return`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` }, body: JSON.stringify({}),
      });
      if (r.ok) { toast({ title: '返却確認が完了しました' }); onBack(); }
      else { const e = await r.json(); toast({ variant: 'destructive', title: e.error ?? '確認に失敗しました' }); }
    } finally { setConfirming(null); }
  };

  const appStatus = contract.application_status ?? contract.status;
  const rc = related?.contracts?.[0];
  const vPhotos: string[] = (() => { try { return JSON.parse(rc?.vehicle_photos ?? '[]'); } catch { return []; } })();
  const pickupPhotos: string[] = (() => { try { return JSON.parse(rc?.pickup_photos ?? '[]'); } catch { return []; } })();
  const returnPhotos: string[] = (() => { try { return JSON.parse(rc?.return_photos ?? '[]'); } catch { return []; } })();
  const pickupDocs: Record<string,string> = (() => { try { const v = JSON.parse(rc?.pickup_documents ?? 'null'); return (v && !Array.isArray(v)) ? v : {}; } catch { return {}; } })();
  const returnDocs: Record<string,string> = (() => { try { const v = JSON.parse(rc?.return_documents ?? 'null'); return (v && !Array.isArray(v)) ? v : {}; } catch { return {}; } })();
  const DOC_LABELS: Record<string,string> = { shakken: '車検証', kiroku: '検査証記録事項', jibaiseki: '自賠責', ninni: '任意保険' };

  return (
    <div className="space-y-0">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">契約 #{contract.id}</h1>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${statusCls(contract.status)}`}>
                {statusLabel(contract.status)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contract.maker} {contract.model} · {contract.user_name ?? '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {appStatus === 'delivery_pending' && appId && (
            <button onClick={confirmPickup} disabled={!!confirming}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
              {confirming === 'pickup' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
              受取確認
            </button>
          )}
          {appStatus === 'return_pending' && appId && (
            <button onClick={confirmReturn} disabled={!!confirming}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs font-medium rounded-lg hover:bg-muted disabled:opacity-50">
              {confirming === 'return' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              返却確認
            </button>
          )}
        </div>
      </div>

      {/* タブナビ */}
      <div className="flex border-b border-border mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="h-4 w-4" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ════ TAB: 概要 ════ */}
      {tab === 'overview' && (
        <div className="space-y-5">
        {/* 上段：3カード横並び */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 契約概要 */}
          <Section title="契約概要">
            <dl className="grid grid-cols-2 gap-4">
              <DL label="ステータス" value={
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${statusCls(contract.status)}`}>{statusLabel(contract.status)}</span>
              } />
              <DL label="月額料金" value={(contract.monthly_price ?? contract.monthlyPrice) ? yen(Number(contract.monthly_price ?? contract.monthlyPrice)) : null} />
              <DL label="利用開始日" value={fmtD(contract.start_date ?? contract.startDate)} />
              <DL label="支払日" value="末締め翌月末払い" />
            </dl>
          </Section>

          {/* 顧客サマリ */}
          <Section title="顧客サマリ">
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground shrink-0" /><span>{contract.user_name ?? '未入力'}</span></div>
              {contract.user_phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground shrink-0" /><a href={`tel:${contract.user_phone}`} className="hover:underline">{contract.user_phone}</a></div>}
              {contract.user_email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground shrink-0" /><a href={`mailto:${contract.user_email}`} className="break-all hover:underline">{contract.user_email}</a></div>}
            </div>
          </Section>

          {/* 車両サマリ */}
          <Section title="車両サマリ">
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2"><Car className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium">{contract.maker} {contract.model}</span></div>
              {contract.prefecture && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span>{contract.prefecture}</span></div>}
              {contract.license_plate && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-mono text-xs">{contract.license_plate}</span></div>}
            </div>
          </Section>
        </div>

        {/* 下段：受け取り・オプション */}
        {(contract.pickup_address || contract.pickup_datetime) && (
          <Section title="受け取り日時・場所">
            <dl className="grid grid-cols-2 gap-4">
              <DL label="受け取り日時" value={fmtDT(contract.pickup_datetime)} />
              <DL label="受け取り場所"  value={contract.pickup_address} span2 />
            </dl>
          </Section>
        )}

        {contract.black_number_requested && (
          <Section title="オプション申請">
            <div className="flex items-center justify-between py-3 px-4 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center gap-2.5">
                <BadgeCheck className="h-4 w-4 text-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">黒ナンバー取得申請</p>
                  <p className="text-xs text-muted-foreground mt-0.5">協力会社対応</p>
                </div>
              </div>
              <span className="text-sm font-semibold">¥10,000</span>
            </div>
          </Section>
        )}
        </div>
      )}

      {/* ════ TAB: 顧客 ════ */}
      {tab === 'customer' && (
        <div className="space-y-5">
          <Section title="基本情報">
            <dl className="grid grid-cols-2 gap-4">
              <DL label="氏名"          value={contract.user_name} />
              <DL label="電話番号"      value={contract.user_phone ? <a href={`tel:${contract.user_phone}`} className="hover:underline">{contract.user_phone}</a> : null} />
              <DL label="メールアドレス" value={contract.user_email ? <a href={`mailto:${contract.user_email}`} className="break-all hover:underline">{contract.user_email}</a> : null} span2 />
            </dl>
          </Section>
        </div>
      )}

      {/* ════ TAB: 車両 ════ */}
      {tab === 'vehicle' && (
        <div className="space-y-5">
          <Section title="車両情報">
            {/* 写真 */}
            {vPhotos.length > 0 && (
              <div className="flex gap-1 overflow-x-auto bg-muted/30 rounded-lg p-2 mb-5 -mx-1">
                {vPhotos.map((p, i) => (
                  <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`車両写真${i+1}`}
                    className="h-36 w-auto rounded-lg object-cover shrink-0 border border-border" />
                ))}
              </div>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DL label="メーカー・車種"  value={`${contract.maker ?? ''} ${contract.model ?? ''}`} />
              <DL label="年式"           value={contract.year ? `${contract.year}年式` : null} />
              <DL label="ナンバー"       value={<span className="font-mono">{contract.license_plate ?? contract.licensePlate}</span>} />
              <DL label="都道府県"       value={contract.prefecture} />
              <DL label="走行距離"       value={contract.mileage ? `${Number(contract.mileage).toLocaleString()} km` : null} />
              <DL label="車検満了"       value={fmtD(contract.inspection_expiry)} />
              <DL label="走行上限"       value={contract.mileage_limit ? `${Number(contract.mileage_limit).toLocaleString()} km/月` : null} />
              <DL label="超過料金"       value={contract.excess_mileage_fee ? `${yen(Number(contract.excess_mileage_fee))}/km` : null} />
              <DL label="喫煙"           value={contract.smoking_policy === 'no_smoking' ? '禁煙' : contract.smoking_policy === 'smoking_ok' ? '喫煙可' : contract.smoking_policy} />
            </dl>
            <div className="flex gap-2 mt-3">
              {[['ETC', contract.has_etc ?? contract.hasEtc], ['ドラレコ', contract.has_dashcam ?? contract.hasDashcam], ['バックカメラ', contract.has_backup_cam ?? contract.hasBackupCam]].map(([lbl, val]) => (
                <span key={lbl as string} className={`text-xs px-2.5 py-1 rounded-full border ${val ? 'border-border bg-muted' : 'border-border text-muted-foreground line-through'}`}>{lbl}</span>
              ))}
            </div>
          </Section>

          {(contract.insurance_company || contract.insuranceCompany) && (
            <Section title="保険情報">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <DL label="保険会社"     value={contract.insurance_company ?? contract.insuranceCompany} />
                <DL label="証券番号"     value={contract.insurance_policy_number ?? contract.insurancePolicyNumber} />
                <DL label="保険連絡先"   value={contract.insurance_contact ?? contract.insuranceContact} />
                <DL label="任意保険満了" value={fmtD(contract.insurance_expiry ?? contract.insuranceExpiry)} />
                <DL label="自賠責満了"   value={fmtD(contract.compulsory_insurance_expiry ?? contract.compulsoryInsuranceExpiry)} />
              </dl>
            </Section>
          )}
        </div>
      )}

      {/* ════ TAB: 契約 ════ */}
      {tab === 'contract' && (
        <div className="space-y-5">
          {relLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : !rc ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">契約書情報はありません</div>
          ) : (
            <>
              <Section title="契約内容" action={
                <a href={`${import.meta.env.BASE_URL}api/van/contracts/${rc.id}/print`} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1">
                  📄 契約書PDF
                </a>
              }>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <DL label="月額"     value={rc.monthly_price ? yen(Number(rc.monthly_price)) : null} />
                  <DL label="開始日"   value={fmtD(rc.start_date)} />
                  <DL label="終了予定" value={fmtD(rc.planned_end_date ?? rc.end_date)} />
                  <DL label="支払日"   value="末締め翌月末払い" />
                  <DL label="支払方法" value={rc.payment_method === 'invoice' ? '請求書払い' : rc.payment_method === 'card' ? 'カード' : rc.payment_method} />
                  <DL label="最低期間" value={rc.minimum_term ? `${rc.minimum_term}ヶ月` : null} />
                </dl>
              </Section>

              <Section title="締結書類・同意記録">
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'プラットフォーム契約同意', val: rc.platform_contract_agreed_at },
                    { label: '車両貸渡契約同意',        val: rc.vehicle_contract_agreed_at   },
                    { label: '利用規約同意',            val: rc.terms_agreed_at              },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <span>{label}</span>
                      {val ? <span className="text-xs text-muted-foreground">{fmtDT(val)}</span>
                           : <span className="text-xs text-muted-foreground">未同意</span>}
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-1.5 border-b border-border">
                    <span>GPS利用同意</span>
                    <span className={`text-xs ${rc.gps_consent ? 'text-foreground' : 'text-muted-foreground'}`}>{rc.gps_consent ? '同意済み' : '未同意'}</span>
                  </div>
                </div>
              </Section>

              {/* 納車時 */}
              <Section title="納車時の書類・写真">
                <p className="text-xs text-muted-foreground mb-2">車両写真</p>
                {pickupPhotos.length > 0 ? (
                  <div className="flex gap-2 flex-wrap mb-4">
                    {pickupPhotos.map((p, i) => (
                      <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`納車写真${i+1}`}
                        className="h-28 w-auto rounded-lg border border-border object-cover" />
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground mb-4">写真なし</p>}
                <p className="text-xs text-muted-foreground mb-2">所定書類</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(DOC_LABELS).map(([key, label]) => {
                    const path = pickupDocs[key];
                    return (
                      <div key={key} className="border border-border rounded-xl overflow-hidden">
                        {path ? (
                          <a href={`${import.meta.env.BASE_URL}api/storage${path}`} target="_blank" rel="noopener noreferrer">
                            <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label} className="w-full h-20 object-cover" />
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
              </Section>

              {/* 返却時 */}
              <Section title="返却時の書類・写真">
                <p className="text-xs text-muted-foreground mb-2">車両写真</p>
                {returnPhotos.length > 0 ? (
                  <div className="flex gap-2 flex-wrap mb-4">
                    {returnPhotos.map((p, i) => (
                      <img key={i} src={`${import.meta.env.BASE_URL}api/storage${p}`} alt={`返却写真${i+1}`}
                        className="h-28 w-auto rounded-lg border border-border object-cover" />
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground mb-4">写真なし</p>}
                <p className="text-xs text-muted-foreground mb-2">所定書類</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(DOC_LABELS).map(([key, label]) => {
                    const path = returnDocs[key];
                    return (
                      <div key={key} className="border border-border rounded-xl overflow-hidden">
                        {path ? (
                          <a href={`${import.meta.env.BASE_URL}api/storage${path}`} target="_blank" rel="noopener noreferrer">
                            <img src={`${import.meta.env.BASE_URL}api/storage${path}`} alt={label} className="w-full h-20 object-cover" />
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
              </Section>
            </>
          )}
        </div>
      )}

      {/* ════ TAB: 決済 ════ */}
      {tab === 'payment' && (
        <div className="space-y-5">
          {relLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
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
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {related.payments.map((p: any) => (
                        <tr key={p.id}>
                          <td className="py-2.5 font-mono text-xs">{p.period_month}</td>
                          <td className="py-2.5">¥{Number(p.amount).toLocaleString()}</td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${p.result === 'success' ? 'bg-muted border-border text-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
                              {{ success: '成功', failed: '失敗' }[p.result as string] ?? p.result ?? '—'}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs text-muted-foreground">{p.attempted_at ? format(new Date(p.attempted_at), 'MM/dd HH:mm') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title={`請求書払い履歴（${related?.invoices?.length ?? 0}件）`}>
                {!related?.invoices?.length ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">請求書はありません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 text-left">請求書番号</th>
                      <th className="pb-2 text-left">対象期間</th>
                      <th className="pb-2 text-left">金額（税込）</th>
                      <th className="pb-2 text-left">ステータス</th>
                      <th className="pb-2 text-left">支払期限</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {related.invoices.map((inv: any) => {
                        const INV_STATUS: Record<string,string> = { paid: '入金済み', pending: '未払い', overdue: '延滞', cancelled: 'キャンセル' };
                        return (
                          <tr key={inv.id}>
                            <td className="py-2.5 font-mono text-xs">{inv.invoice_number}</td>
                            <td className="py-2.5 text-xs text-muted-foreground">
                              {inv.period_start ? format(new Date(inv.period_start), 'yyyy/MM/dd') : '—'} 〜 {inv.period_end ? format(new Date(inv.period_end), 'MM/dd') : '—'}
                            </td>
                            <td className="py-2.5 font-medium">¥{Number(inv.total_amount).toLocaleString()}</td>
                            <td className="py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-muted ${inv.status === 'paid' ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {INV_STATUS[inv.status] ?? inv.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-xs text-muted-foreground">{fmtD(inv.due_date)}</td>
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

      {/* ════ TAB: GPS ════ */}
      {tab === 'gps' && (
        <div className="space-y-5">
          {relLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : (() => {
            const locs: any[] = related?.userLocations ?? [];
            const latest = locs[0];
            return (
              <Section title={`位置情報（${locs.length}件）`}>
                {latest && (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground mb-3 pb-3 border-b border-border">
                    <span>最終更新: <span className="text-foreground font-medium">{fmtDT(latest.recorded_at)}</span></span>
                    <span>精度: <span className="text-foreground">±{Math.round(Number(latest.accuracy ?? 0))}m</span></span>
                    <a href={`https://maps.google.com/?q=${latest.latitude},${latest.longitude}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-border rounded-lg hover:bg-muted ml-auto">
                      <MapPinned className="h-3 w-3" />Googleマップで開く
                    </a>
                  </div>
                )}
                <GpsMap locs={locs} />
                {locs.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-medium mb-2">直近の記録</p>
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {locs.slice(0, 30).map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted text-xs gap-3">
                          <span className="text-muted-foreground tabular-nums">{l.recorded_at ? format(new Date(l.recorded_at), 'MM/dd HH:mm:ss') : '—'}</span>
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
        </div>
      )}

      {/* ════ TAB: 事故・故障 ════ */}
      {tab === 'incident' && (
        <div className="space-y-4">
          {relLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : !related?.incidents?.length ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground text-sm">事故・故障の報告はありません</div>
          ) : related.incidents.map((inc: any) => (
            <Section key={inc.id} title={`#${inc.id} ${inc.incident_type === 'accident' ? '🚨 事故' : inc.incident_type === 'breakdown' ? '🔧 故障' : '報告'}`}>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <DL label="ステータス" value={
                  <span className={`px-2 py-0.5 rounded-full text-xs ${inc.status === '解決済み' ? 'bg-muted border-border text-foreground border' : inc.status === '対応中' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{inc.status}</span>
                } />
                <DL label="現在地"   value={inc.location} />
                <DL label="怪我"     value={inc.has_injuries != null ? (inc.has_injuries ? 'あり' : 'なし') : null} />
                <DL label="警察対応" value={inc.police_contacted != null ? (inc.police_contacted ? '済み' : '未') : null} />
                <DL label="報告日時" value={fmtDT(inc.created_at)} />
                {inc.description && <DL label="状況説明" value={inc.description} span2 />}
              </dl>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 契約一覧 ─────────────────────────────────────────────────────────────────
export default function CompanyContracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const load = () => {
    setIsLoading(true);
    fetch(API('/company/contracts'), { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setContracts(Array.isArray(j) ? j : []))
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { load(); }, []);

  // 詳細ビュー
  if (selected) return <ContractDetail contract={selected} onBack={() => { setSelected(null); load(); }} />;

  // フィルタリング
  const filtered = contracts.filter(c => {
    const st = c.application_status ?? c.status;
    if (statusFilter && st !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (c.user_name ?? '').toLowerCase().includes(q) ||
        (c.user_phone ?? '').includes(q) ||
        (c.user_email ?? '').toLowerCase().includes(q) ||
        (`${c.maker ?? ''} ${c.model ?? ''}`).toLowerCase().includes(q) ||
        (c.license_plate ?? '').includes(q) ||
        String(c.id).includes(q)
      );
    }
    return true;
  });

  // サマリ集計
  const stats = [
    { label: '総契約数',  value: contracts.length },
    { label: '利用中',    value: contracts.filter(c => (c.application_status ?? c.status) === 'active').length },
    { label: '納車待ち',  value: contracts.filter(c => (c.application_status ?? c.status) === 'delivery_pending').length },
    { label: '返却予定',  value: contracts.filter(c => (c.application_status ?? c.status) === 'return_pending').length },
  ];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">契約一覧</h1>
        <p className="text-muted-foreground text-sm mt-1">自社車両の利用契約を確認・管理します。</p>
      </div>

      {/* サマリカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* 検索 + ステータスフィルター */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="名前・電話・車両・ナンバーで検索..."
          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
        />
        <div className="relative sm:w-52">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50 appearance-none"
          >
            <option value="">すべてのステータス</option>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* テーブル */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium w-16">ID</th>
                  <th className="px-4 py-3 font-medium">ステータス</th>
                  <th className="px-4 py-3 font-medium">ユーザー情報</th>
                  <th className="px-4 py-3 font-medium">車両</th>
                  <th className="px-4 py-3 font-medium">月額</th>
                  <th className="px-4 py-3 font-medium">開始日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-muted-foreground text-sm">
                      該当する契約が見つかりませんでした。
                    </td>
                  </tr>
                ) : filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">#{c.id}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap ${statusCls(c.application_status ?? c.status)}`}>
                        {statusLabel(c.application_status ?? c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground truncate max-w-[140px]">
                          {c.user_name || <span className="text-muted-foreground">未入力</span>}
                        </span>
                        {c.user_phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />{c.user_phone}
                          </span>
                        )}
                        {c.user_email && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[180px]">
                            <Mail className="h-3 w-3" />{c.user_email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium truncate max-w-[140px]">{c.maker} {c.model}</p>
                      {c.license_plate && <p className="text-xs text-muted-foreground font-mono">{c.license_plate}</p>}
                    </td>
                    <td className="px-4 py-3.5 font-medium">
                      {(c.monthly_price ?? c.monthlyPrice) ? yen(Number(c.monthly_price ?? c.monthlyPrice)) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtD(c.start_date ?? c.startDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            {filtered.length}件 / 全{contracts.length}件
          </div>
        </div>
      )}
    </div>
  );
}
