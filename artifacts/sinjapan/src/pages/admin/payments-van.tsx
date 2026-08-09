import React from 'react';
import { CreditCard, AlertTriangle, Phone, Mail, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

function usePaymentIssues() {
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/payment-issues'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) {
        const j = await r.json();
        setData(Array.isArray(j) ? j : []);
      }
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export default function AdminPaymentsVan() {
  const { data, loading, reload } = usePaymentIssues();
  const { toast } = useToast();

  const handleNotify = async (userId: number, contractId: number) => {
    const r = await fetch(API('/van/notifications'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title: '⚠️ お支払いのご確認',
        message: '月額料金の決済に失敗しました。マイページよりお支払い方法をご確認ください。このまま未払いが続く場合、契約更新が停止されます。',
      }),
    });
    if (r.ok) toast({ title: 'ユーザーへ通知を送信しました' });
    else toast({ title: 'エラー', variant: 'destructive' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">決済・未払い管理</h1>
          <p className="text-sm text-muted-foreground">決済エラー・未払い案件を管理します</p>
        </div>
        <button onClick={reload} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm">
          <RefreshCw className="h-4 w-4" />更新
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>Chat VANの方針：</strong>賃料保証はありません。決済失敗時は督促通知を送り、期限内に解決しない場合は返却要求・回収サポートへ移行します。
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <CreditCard className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">未払い案件はありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((c: any) => {
            const retries: any[] = c.retries ?? [];
            const latestRetry = retries[0];
            return (
              <div key={c.id} className="bg-card border border-red-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-semibold">{c.user_name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {c.maker} {c.model} {c.license_plate ? `· ${c.license_plate}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">¥{Number(c.monthly_price).toLocaleString()}/月</div>
                    <div className="text-xs text-muted-foreground">契約ID: {c.id}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm bg-muted/40 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />{c.phone ?? '-'}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{c.email ?? '-'}
                  </div>
                  {latestRetry && (
                    <div className="col-span-3 text-xs text-red-600">
                      最終決済失敗: {new Date(latestRetry.attempted_at).toLocaleString('ja-JP')} — {latestRetry.failure_reason ?? '理由不明'} ({retries.length}回目)
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleNotify(c.user_id, c.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-medium">
                    督促通知を送る
                  </button>
                  <a href={`/admin/applications?userId=${c.user_id}`} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground">
                    相談詳細を見る
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
