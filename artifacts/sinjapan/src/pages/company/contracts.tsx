import { useEffect, useState } from 'react';
import { FileText, Phone, Mail, MessageSquare, Truck, RotateCcw, CheckCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  pending_payment:  { label: '決済待ち',   color: 'bg-yellow-100 text-yellow-700' },
  active:           { label: '利用中',     color: 'bg-green-100 text-green-700' },
  delivery_pending: { label: '納車待ち',   color: 'bg-blue-100 text-blue-700' },
  return_pending:   { label: '返却予定',   color: 'bg-orange-100 text-orange-700' },
  payment_issue:    { label: '未払い',     color: 'bg-red-100 text-red-700' },
  completed:        { label: '完了',       color: 'bg-gray-100 text-gray-600' },
  cancelled:        { label: 'キャンセル', color: 'bg-gray-100 text-gray-500' },
};

const APP_STATUS: Record<string, { label: string; color: string }> = {
  delivery_pending: { label: '受取待ち', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  return_pending:   { label: '返却待ち', color: 'bg-orange-50 text-orange-700 border border-orange-200' },
  active:           { label: '利用中',   color: 'bg-green-50 text-green-700 border border-green-200' },
  completed:        { label: '完了',     color: 'bg-gray-50 text-gray-500 border border-gray-200' },
};

const FILTERS = [
  { key: 'all',             label: 'すべて' },
  { key: 'delivery_pending',label: '受取待ち' },
  { key: 'active',          label: '利用中' },
  { key: 'return_pending',  label: '返却待ち' },
  { key: 'payment_issue',   label: '未払い' },
  { key: 'completed',       label: '完了' },
];

export default function CompanyContracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [confirming, setConfirming] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    fetch(API('/company/contracts'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setContracts(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // フィルターは申込ステータス(application_status)を使う
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
      if (r.ok) {
        toast({ title: '受取確認が完了しました', description: 'ステータスが「利用中」に変わりました' });
        load();
      } else {
        const err = await r.json();
        toast({ variant: 'destructive', title: 'エラー', description: err.error ?? '確認に失敗しました' });
      }
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
      if (r.ok) {
        toast({ title: '返却確認が完了しました', description: 'ご利用ありがとうございました' });
        load();
      } else {
        const err = await r.json();
        toast({ variant: 'destructive', title: 'エラー', description: err.error ?? '確認に失敗しました' });
      }
    } finally { setConfirming(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">契約・ユーザー一覧</h1>
        <span className="text-sm text-muted-foreground ml-1">({contracts.length}件)</span>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? contracts.length
            : contracts.filter(c => (c.application_status ?? c.status) === f.key).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}>
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">該当する契約はありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">契約ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ユーザー</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">連絡先</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">車両</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">都道府県</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">開始日</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const cs = CONTRACT_STATUS[c.status];
                const as_ = APP_STATUS[c.application_status];
                const appId = c.application_id;
                const isConfirming = confirming === appId;
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">#{c.id}</td>
                    <td className="px-4 py-3 font-medium">{c.user_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
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
                    <td className="px-4 py-3">{c.maker} {c.model}</td>
                    <td className="px-4 py-3 text-sm">{c.prefecture}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {cs && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${cs.color}`}>
                            {cs.label}
                          </span>
                        )}
                        {as_ && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${as_.color}`}>
                            申込: {as_.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.start_date ?? c.startDate ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {/* 受取確認 */}
                        {c.application_status === 'delivery_pending' && appId && (
                          <button
                            onClick={() => confirmPickup(appId)}
                            disabled={isConfirming}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            受取確認
                          </button>
                        )}
                        {/* 返却確認 */}
                        {c.application_status === 'return_pending' && appId && (
                          <button
                            onClick={() => confirmReturn(appId)}
                            disabled={isConfirming}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            返却確認
                          </button>
                        )}
                        {c.application_status === 'active' && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />利用中
                          </span>
                        )}
                        {/* チャット */}
                        <Link href={`/contract-chat/${c.id}`}>
                          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" />
                            チャット
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
