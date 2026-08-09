import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoute } from 'wouter';
import { Loader2, MapPin, CheckCircle, Truck, Phone, User, Navigation, NavigationOff, ChevronRight, Package, Clock } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
function apiFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}

const STATUS_ORDER = ['配車確定', '集荷完了', '配送中', '納品完了'];
const STATUS_NEXT: Record<string, string> = {
  '配車確定': '集荷完了',
  '手配中':   '集荷完了',
  '集荷完了': '配送中',
  '配送中':   '納品完了',
};
const STATUS_LABEL: Record<string, string> = {
  '集荷完了': '集荷完了にする',
  '配送中':   '配送中にする',
  '納品完了': '納品完了にする',
};

// ─── メインページ ─────────────────────────────────────────────────────────────
export default function DriverPortal() {
  const [, params] = useRoute('/driver/:token');
  const token = params?.token ?? '';

  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const watchRef = useRef<number | null>(null);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLocRef = useRef<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/driver/${token}`);
      setShipment(data);
      setCarrierName(data.driverCarrierName || '');
      setDriverName(data.assignedDriverName || '');
      setDriverPhone(data.driverPhone || '');
      setVehicleNumber(data.driverVehicleNumber || '');
    } catch {
      setError('指示書が見つかりません。URLをご確認ください。');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── GPS ────────────────────────────────────────────────────────────────────
  const sendLocation = useCallback(async (lat: number, lng: number) => {
    try { await apiFetch(`/api/driver/${token}/location`, { method: 'POST', body: JSON.stringify({ lat, lng }) }); }
    catch { /* silent */ }
  }, [token]);

  const enableGps = () => {
    if (!navigator.geolocation) { setGpsError('このデバイスはGPS非対応です'); return; }
    setGpsError('');
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        lastLocRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        sendLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => setGpsError('位置情報の取得に失敗しました'),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    // 30秒ごとに再送信（watchPosition が止まっていても）
    sendIntervalRef.current = setInterval(() => {
      if (lastLocRef.current) sendLocation(lastLocRef.current.lat, lastLocRef.current.lng);
    }, 30000);
    setGpsEnabled(true);
  };

  const disableGps = () => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    watchRef.current = null;
    sendIntervalRef.current = null;
    lastLocRef.current = null;
    setGpsEnabled(false);
  };

  useEffect(() => () => { disableGps(); }, []);

  // ── ドライバー情報保存 ─────────────────────────────────────────────────────
  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      await apiFetch(`/api/driver/${token}/info`, {
        method: 'PATCH',
        body: JSON.stringify({ driverCarrierName: carrierName, driverName, driverPhone, driverVehicleNumber: vehicleNumber }),
      });
      setInfoSaved(true);
      setTimeout(() => setInfoSaved(false), 3000);
    } catch { /* silent */ }
    finally { setSavingInfo(false); }
  };

  // ── ステータス変更 ─────────────────────────────────────────────────────────
  const updateStatus = async (status: string) => {
    setUpdatingStatus(true);
    try {
      await apiFetch(`/api/driver/${token}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch { /* silent */ }
    finally { setUpdatingStatus(false); }
  };

  // ─── render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center gap-4">
      <Truck className="h-12 w-12 text-muted-foreground" />
      <p className="text-lg font-semibold">指示書が見つかりません</p>
      <p className="text-sm text-muted-foreground">{error}</p>
    </div>
  );

  const nextStatus = STATUS_NEXT[shipment.status];
  const isDone = shipment.status === '納品完了' || shipment.status === '請求完了';

  const vehicle = [shipment.vehicleSize, shipment.vehicleBodyType].filter(Boolean).join(' ') || shipment.vehicleType || '—';

  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">

      {/* ヘッダー */}
      <div className="bg-foreground text-background px-5 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="h-5 w-5" />
          <span className="font-bold text-lg tracking-tight">Chat VAN</span>
        </div>
        <p className="text-sm opacity-70">配送指示書 — 案件 #{String(shipment.id).padStart(6, '0')}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ステータス */}
        <div className={`rounded-xl px-5 py-4 flex items-center justify-between ${isDone ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">現在のステータス</p>
            <p className={`text-xl font-bold ${isDone ? 'text-green-700' : 'text-amber-800'}`}>{shipment.status}</p>
          </div>
          {isDone && <CheckCircle className="h-8 w-8 text-green-500" />}
        </div>

        {/* 指示書内容 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <p className="font-semibold text-sm">配送内容</p>
          </div>
          <div className="divide-y divide-border/50">
            <Row icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="集荷先">
              <p className="font-medium text-sm">{shipment.pickupAddress || '—'}</p>
              {shipment.pickupDatetime && <p className="text-xs text-muted-foreground mt-0.5">{shipment.pickupDatetime}</p>}
            </Row>
            <Row icon={<MapPin className="h-4 w-4 text-foreground" />} label="納品先">
              <p className="font-medium text-sm">{shipment.deliveryAddress || '—'}</p>
              {shipment.deliveryDeadline && <p className="text-xs text-muted-foreground mt-0.5">{shipment.deliveryDeadline}</p>}
            </Row>
            <Row icon={<Package className="h-4 w-4 text-muted-foreground" />} label="荷物">
              <p className="text-sm">{[shipment.cargoType, shipment.cargoQuantity].filter(Boolean).join(' / ') || '—'}</p>
              {(shipment.cargoWeight || shipment.cargoSize) && (
                <p className="text-xs text-muted-foreground mt-0.5">{[shipment.cargoWeight, shipment.cargoSize].filter(Boolean).join(' / ')}</p>
              )}
            </Row>
            <Row icon={<Truck className="h-4 w-4 text-muted-foreground" />} label="車両">
              <p className="text-sm">{vehicle}</p>
            </Row>
            {shipment.deliveryType && (
              <Row icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="配送区分">
                <p className="text-sm">{shipment.deliveryType}</p>
              </Row>
            )}
            {shipment.additionalWork && shipment.additionalWork !== '不要' && (
              <Row icon={<ChevronRight className="h-4 w-4 text-muted-foreground" />} label="付帯作業">
                <p className="text-sm">{shipment.additionalWork}</p>
              </Row>
            )}
            {shipment.notes && (
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground mb-1">備考</p>
                <p className="text-sm whitespace-pre-wrap">{shipment.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ドライバー情報入力 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <p className="font-semibold text-sm">ドライバー情報</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />運送会社名
              </label>
              <input
                type="text"
                value={carrierName}
                onChange={e => setCarrierName(e.target.value)}
                placeholder="〇〇運輸株式会社"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-background outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />ドライバー名
              </label>
              <input
                type="text"
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-background outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />連絡先
              </label>
              <input
                type="tel"
                value={driverPhone}
                onChange={e => setDriverPhone(e.target.value)}
                placeholder="090-0000-0000"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-background outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />車番
              </label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={e => setVehicleNumber(e.target.value)}
                placeholder="品川 330 あ 1234"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-background outline-none focus:border-foreground/40 transition-colors"
              />
            </div>
            <button
              onClick={saveInfo}
              disabled={savingInfo || (!carrierName && !driverName && !driverPhone && !vehicleNumber)}
              className="w-full py-2.5 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-80"
            >
              {savingInfo ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : infoSaved ? '✓ 保存しました' : '情報を保存'}
            </button>
          </div>
        </div>

        {/* GPS共有 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-border bg-muted/30">
            <p className="font-semibold text-sm">GPS位置共有</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">ONにすると荷主がリアルタイムで位置を確認できます。</p>
            <button
              onClick={gpsEnabled ? disableGps : enableGps}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                gpsEnabled
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-foreground text-background hover:opacity-80'
              }`}
            >
              {gpsEnabled
                ? <><NavigationOff className="h-4 w-4" />位置共有を停止</>
                : <><Navigation className="h-4 w-4" />位置共有を開始</>}
            </button>
            {gpsEnabled && (
              <p className="text-xs text-green-600 font-medium text-center">● 位置を共有中（30秒ごとに更新）</p>
            )}
            {gpsError && <p className="text-xs text-red-500 text-center">{gpsError}</p>}
          </div>
        </div>

        {/* ステータス変更 */}
        {!isDone && nextStatus && (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-border bg-muted/30">
              <p className="font-semibold text-sm">ステータス更新</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* ステップバー */}
              <div className="flex items-center gap-1.5 mb-4">
                {STATUS_ORDER.map((s, i) => {
                  const idx = STATUS_ORDER.indexOf(shipment.status);
                  const done = i < idx;
                  const current = i === idx;
                  return (
                    <React.Fragment key={s}>
                      <div className={`h-2 flex-1 rounded-full transition-colors ${done ? 'bg-foreground' : current ? 'bg-foreground/40' : 'bg-muted'}`} />
                    </React.Fragment>
                  );
                })}
              </div>
              <button
                onClick={() => updateStatus(nextStatus)}
                disabled={updatingStatus}
                className="w-full py-4 rounded-xl bg-foreground text-background text-base font-bold disabled:opacity-40 transition-opacity hover:opacity-80 flex items-center justify-center gap-2"
              >
                {updatingStatus
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <><CheckCircle className="h-5 w-5" />{STATUS_LABEL[nextStatus]}</>}
              </button>
            </div>
          </div>
        )}

        {isDone && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-5 text-center space-y-1">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
            <p className="font-bold text-green-700">配送完了</p>
            <p className="text-xs text-green-600">お疲れさまでした。</p>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-8">Chat VAN ドライバーポータル</p>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 flex gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        {children}
      </div>
    </div>
  );
}
