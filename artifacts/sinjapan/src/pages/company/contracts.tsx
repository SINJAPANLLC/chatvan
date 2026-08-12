import { useEffect, useState } from 'react';
import { Loader2, FileText, Calendar, Phone, Mail, MessageSquare, Truck, RotateCcw } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const STATUS_OPTIONS = [
  { value: 'pending_payment',  label: '決済待ち',   color: 'bg-yellow-50 text-yellow-700' },
  { value: 'delivery_pending', label: '納車待ち',   color: 'bg-blue-50 text-blue-700'    },
  { value: 'active',           label: '利用中',     color: 'bg-green-50 text-green-700'  },
  { value: 'return_pending',   label: '返却予定',   color: 'bg-orange-50 text-orange-700'},
  { value: 'payment_issue',    label: '未払い',     color: 'bg-red-50 text-red-700'      },
  { value: 'completed',        label: '契約終了',   color: 'bg-gray-100 text-gray-700'   },
  { value: 'cancelled',        label: '解約',       color: 'bg-red-100 text-red-800'     },
];
const statusColor = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.color ?? 'bg-gray-100 text-gray-600';
const statusLabel = (s: string) => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;

const FILTERS = [
  { key: 'all',              label: 'すべて'   },
  { key: 'delivery_pending', label: '納車待ち' },
  { key: 'active',           label: '利用中'   },
  { key: 'return_pending',   label: '返却予定' },
  { key: 'payment_issue',    label: '未払い'   },
  { key: 'completed',        label: '完了'     },
];

export default function CompanyContracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [confirming, setConfirming] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    fetch(API('/company/contracts'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setContracts(Array.isArray(j) ? j : []))
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filter === 'all'
    ? contracts
    : contracts.filter(c => (c.application_status ?? c.status) === filter);

  const confirmPickup = async (appId: number) => {
    if (!confirm('受取確認を行いますか？')) return;
    setConfirming(appId);
    try {
      const r = await fetch(API(`/van/applications/${appId}/confirm-pickup`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({}),
      });
      if (r.ok) { toast({ title: '受取確認が完了しました' }); load(); }
      else { const e = await r.json(); toast({ variant: 'destructive', title: e.error ?? '確認に失敗しました' }); }
    } finally { setConfirming(null); }
  };

  const confirmReturn = async (appId: number) => {
    if (!confirm('返却確認を行いますか？')) return;
    setConfirming(appId);
    try {
      const r = await fetch(API(`/van/applications/${appId}/confirm-return`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({}),
      });
      if (r.ok) { toast({ title: '返却確認が完了しました' }); load(); }
      else { const e = await r.json(); toast({ variant: 'destructive', title: e.error ?? '確認に失敗しました' }); }
    } finally { setConfirming(null); }
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">契約</h1>
        <p className="text-muted-foreground text-sm mt-1">自社車両の利用契約を確認・管理します。</p>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? contracts.length
            : contracts.filter(c => (c.application_status ?? c.status) === f.key).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}>
              {f.label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">該当する契約はありません</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">契約ID</th>
                <th className="px-6 py-3 font-medium">ユーザー</th>
                <th className="px-6 py-3 font-medium">車両</th>
                <th className="px-6 py-3 font-medium">月額料金</th>
                <th className="px-6 py-3 font-medium">利用開始・支払日</th>
                <th className="px-6 py-3 font-medium">ステータス</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const appId = c.application_id;
                const isConfirming = confirming === appId;
                const appStatus = c.application_status ?? c.status;
                return (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        #{c.id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{c.user_name ?? '—'}</p>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {c.user_phone && (
                          <a href={`tel:${c.user_phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Phone className="h-3 w-3" />{c.user_phone}
                          </a>
                        )}
                        {c.user_email && (
                          <a href={`mailto:${c.user_email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <Mail className="h-3 w-3" />{c.user_email}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">{c.maker} {c.model}</p>
                      {c.prefecture && <p className="text-xs text-muted-foreground">{c.prefecture}</p>}
                    </td>
                    <td className="px-6 py-4">
                      {c.monthlyPrice ? `¥${Number(c.monthlyPrice).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs mb-0.5">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        開始: {c.start_date ?? c.startDate ?? '未定'}
                      </div>
                      {c.payment_day && (
                        <div className="text-xs text-muted-foreground ml-4">
                          支払: 毎月{c.payment_day}日
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded ${statusColor(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        {appStatus === 'delivery_pending' && appId && (
                          <button onClick={() => confirmPickup(appId)} disabled={isConfirming}
                            className="flex items-center gap-1 px-2.5 py-1 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-80 disabled:opacity-50">
                            {isConfirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                            受取確認
                          </button>
                        )}
                        {appStatus === 'return_pending' && appId && (
                          <button onClick={() => confirmReturn(appId)} disabled={isConfirming}
                            className="flex items-center gap-1 px-2.5 py-1 border border-border rounded-md text-xs font-medium hover:bg-muted disabled:opacity-50">
                            {isConfirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            返却確認
                          </button>
                        )}
                        <Link href={`/contract-chat/${c.id}`}>
                          <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
