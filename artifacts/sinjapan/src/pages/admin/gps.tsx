import React, { useState } from 'react';
import { MapPin, Plus, RefreshCw, Navigation, Wifi, WifiOff, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function useGpsDevices() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/gps-devices'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

function DeviceCard({ device, onUpdateLocation }: { device: any; onUpdateLocation: (id: number) => void }) {
  const loc = device.last_location;
  const hasSignal = device.status === 'active';
  const lastSeen = loc?.recorded_at ? new Date(loc.recorded_at).toLocaleString('ja-JP') : null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{device.maker} {device.model}</div>
          <div className="text-sm text-muted-foreground">{device.license_plate ?? 'ナンバー未設定'} · {device.prefecture ?? '-'}</div>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${hasSignal ? 'text-green-700 bg-green-50 border-green-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
          {hasSignal ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {hasSignal ? '通信中' : '圏外'}
        </div>
      </div>

      {loc ? (
        <div className="bg-muted/40 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span>{loc.address ?? `${loc.latitude}, ${loc.longitude}`}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div><span className="block font-medium text-foreground">IGN</span>{loc.ignition_status === 'on' ? '🟢 ON' : '⚫ OFF'}</div>
            <div><span className="block font-medium text-foreground">走行距離</span>{loc.mileage != null ? `${loc.mileage.toLocaleString()} km` : '-'}</div>
            <div><span className="block font-medium text-foreground">最終通信</span>{lastSeen}</div>
          </div>
          {/* Google Maps リンク */}
          <a
            href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Navigation className="h-3 w-3" />Google マップで見る
          </a>
        </div>
      ) : (
        <div className="bg-muted/40 rounded-lg p-3 text-sm text-muted-foreground text-center">
          位置情報なし
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>デバイスID: {device.device_identifier}</span>
        <button onClick={() => onUpdateLocation(device.id)} className="flex items-center gap-1 text-primary hover:underline">
          <RefreshCw className="h-3 w-3" />位置を手動更新
        </button>
      </div>
    </div>
  );
}

export default function AdminGps() {
  const { data, loading, reload } = useGpsDevices();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showLocation, setShowLocation] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ vehicle_id: '', provider: '', device_identifier: '' });
  const [locForm, setLocForm] = useState({ latitude: '', longitude: '', address: '', ignition_status: 'off', mileage: '' });

  const handleAddDevice = async () => {
    const r = await fetch(API('/van/gps-devices'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    if (r.ok) { toast({ title: 'GPS機器を登録しました' }); setShowAdd(false); reload(); }
    else toast({ title: 'エラー', variant: 'destructive' });
  };

  const handleUpdateLocation = async () => {
    if (!showLocation) return;
    const r = await fetch(API(`/van/gps-devices/${showLocation}/location`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(locForm),
    });
    if (r.ok) { toast({ title: '位置情報を更新しました' }); setShowLocation(null); reload(); }
    else toast({ title: 'エラー', variant: 'destructive' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GPS管理</h1>
          <p className="text-sm text-muted-foreground">登録車両の位置情報を確認・管理します</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm">
            <RefreshCw className="h-4 w-4" />更新
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm font-medium">
            <Plus className="h-4 w-4" />GPS機器登録
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>GPS運用について</strong>：現在は手動更新モードです。GPS APIを接続すると自動更新が可能になります。位置情報の閲覧は監査ログに記録されます。
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">GPS機器が登録されていません</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((d: any) => (
            <DeviceCard key={d.id} device={d} onUpdateLocation={(id) => { setShowLocation(id); setLocForm({ latitude: '', longitude: '', address: '', ignition_status: 'off', mileage: '' }); }} />
          ))}
        </div>
      )}

      {/* GPS機器登録モーダル */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">GPS機器を登録</h2>
              <button onClick={() => setShowAdd(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="text-xs text-muted-foreground block mb-1">車両ID *</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={addForm.vehicle_id} onChange={e => setAddForm({ ...addForm, vehicle_id: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">GPS事業者</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={addForm.provider} onChange={e => setAddForm({ ...addForm, provider: e.target.value })} placeholder="マクニカ / SoftBank" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">デバイスID *</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={addForm.device_identifier} onChange={e => setAddForm({ ...addForm, device_identifier: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 px-6 pb-6 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-border rounded-lg">キャンセル</button>
              <button onClick={handleAddDevice} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm"><Save className="h-4 w-4" />登録</button>
            </div>
          </div>
        </div>
      )}

      {/* 位置情報更新モーダル */}
      {showLocation !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-semibold">位置情報を手動更新</h2>
              <button onClick={() => setShowLocation(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">緯度 *</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={locForm.latitude} onChange={e => setLocForm({ ...locForm, latitude: e.target.value })} placeholder="35.6812" /></div>
                <div><label className="text-xs text-muted-foreground block mb-1">経度 *</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={locForm.longitude} onChange={e => setLocForm({ ...locForm, longitude: e.target.value })} placeholder="139.7671" /></div>
              </div>
              <div><label className="text-xs text-muted-foreground block mb-1">住所（任意）</label>
                <input className="w-full border border-border rounded-md px-3 py-2 text-sm" value={locForm.address} onChange={e => setLocForm({ ...locForm, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground block mb-1">エンジン</label>
                  <select className="w-full border border-border rounded-md px-3 py-2 text-sm" value={locForm.ignition_status} onChange={e => setLocForm({ ...locForm, ignition_status: e.target.value })}>
                    <option value="off">OFF</option><option value="on">ON</option>
                  </select></div>
                <div><label className="text-xs text-muted-foreground block mb-1">走行距離(km)</label>
                  <input className="w-full border border-border rounded-md px-3 py-2 text-sm" type="number" value={locForm.mileage} onChange={e => setLocForm({ ...locForm, mileage: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6 justify-end">
              <button onClick={() => setShowLocation(null)} className="px-4 py-2 text-sm border border-border rounded-lg">キャンセル</button>
              <button onClick={handleUpdateLocation} className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-sm"><Save className="h-4 w-4" />更新</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
