import { useEffect, useState } from 'react';
import { MapPin, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

export default function CompanyGps() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    fetch(API('/company/gps'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(j => setDevices(Array.isArray(j) ? j : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">GPS確認</h1>
      </div>

      <p className="text-sm text-muted-foreground">自社車両の最終GPS位置情報を確認できます（閲覧のみ）。</p>

      {error ? (
        <div className="flex items-center gap-3 p-4 border border-border rounded-xl text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">データの取得に失敗しました。</span>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <RefreshCw className="h-3.5 w-3.5" />再試行
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.length === 0 ? (
            <div className="col-span-2 p-8 text-center text-muted-foreground border border-border rounded-xl">
              GPS機器が登録されていません
            </div>
          ) : devices.map((d) => {
            const loc = d.last_location;
            const hasLocation = loc?.latitude && loc?.longitude;
            const mapsUrl = hasLocation
              ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
              : null;

            return (
              <div key={d.id} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{d.maker} {d.model}</p>
                    <p className="text-xs text-muted-foreground font-mono">{d.license_plate}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                    d.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                  }`}>{d.status === 'active' ? '稼働中' : d.status}</span>
                </div>

                {hasLocation ? (
                  <>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{loc.address ?? `${loc.latitude}, ${loc.longitude}`}</span>
                      </div>
                      {loc.recorded_at && (
                        <span className="text-xs">取得: {new Date(loc.recorded_at).toLocaleString('ja-JP')}</span>
                      )}
                      {loc.ignition_status && (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-muted text-xs ml-1">
                          エンジン: {loc.ignition_status}
                        </span>
                      )}
                    </div>
                    <a href={mapsUrl!} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" />
                      Googleマップで確認
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">位置情報なし</p>
                )}

                <div className="text-xs text-muted-foreground">
                  デバイス: {d.provider} / {d.device_identifier}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
