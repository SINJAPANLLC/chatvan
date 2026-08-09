import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPin, Wifi, WifiOff, AlertCircle } from 'lucide-react';

interface GpsDevice {
  id: number;
  deviceId: string;
  vehicleId?: number;
  isConnected: boolean;
  lastCommunicatedAt?: string;
  provider?: string;
  vehicle?: { maker?: string; model?: string; licensePlate?: string };
}

interface GpsLocation {
  id: number;
  deviceId: number;
  vehicleId?: number;
  latitude?: string;
  longitude?: string;
  speed?: string;
  mileage?: number;
  ignition?: boolean;
  batteryLevel?: number;
  recordedAt: string;
  device?: GpsDevice;
}

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminGps() {
  const [selectedDevice, setSelectedDevice] = useState<GpsDevice | null>(null);

  const { data: devices = [], isLoading } = useQuery<GpsDevice[]>({
    queryKey: ['admin-gps-devices'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/gps/devices', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 15000,
  });

  const connected = devices.filter(d => d.isConnected);
  const disconnected = devices.filter(d => !d.isConnected);

  // 最終通信が24時間以上前
  const stale = devices.filter(d => {
    if (!d.lastCommunicatedAt) return true;
    return Date.now() - new Date(d.lastCommunicatedAt).getTime() > 24 * 60 * 60 * 1000;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <MapPin className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">GPS管理</h1>
        <span className="text-sm text-muted-foreground">（外部GPS API接続準備中）</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">接続中</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{connected.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <WifiOff className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">切断中</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{disconnected.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">通信途絶（24h）</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{stale.length}</p>
        </div>
      </div>

      {/* Map placeholder */}
      <div className="bg-muted/30 border border-border rounded-xl h-64 flex flex-col items-center justify-center mb-6 text-muted-foreground">
        <MapPin className="h-10 w-10 mb-3 opacity-30" />
        <p className="font-medium">地図表示エリア</p>
        <p className="text-sm">GPS APIを接続すると車両の現在位置が表示されます</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>GPS端末が登録されていません</p>
          <p className="text-sm mt-1">車両管理画面からGPS端末IDを設定してください</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">端末ID</th>
                <th className="text-left px-4 py-3 font-medium">車両</th>
                <th className="text-left px-4 py-3 font-medium">接続状態</th>
                <th className="text-left px-4 py-3 font-medium">最終通信</th>
                <th className="text-left px-4 py-3 font-medium">事業者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devices.map(d => {
                const isStale = !d.lastCommunicatedAt || Date.now() - new Date(d.lastCommunicatedAt).getTime() > 24 * 60 * 60 * 1000;
                return (
                  <tr key={d.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedDevice(d)}>
                    <td className="px-4 py-3 font-mono text-xs">{d.deviceId}</td>
                    <td className="px-4 py-3">
                      {d.vehicle ? `${d.vehicle.maker} ${d.vehicle.model} ${d.vehicle.licensePlate || ''}` : <span className="text-muted-foreground">未割当</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${d.isConnected ? 'text-green-600' : 'text-red-600'}`}>
                        {d.isConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                        {d.isConnected ? '接続中' : '切断中'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${isStale ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {d.lastCommunicatedAt ? new Date(d.lastCommunicatedAt).toLocaleString('ja-JP') : '不明'}
                      {isStale && ' ⚠️'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{d.provider || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        ※ 走行中の遠隔エンジン停止機能は実装されていません。GPS情報は盗難・未返却・車両管理目的のみに使用します。
      </p>
    </div>
  );
}
