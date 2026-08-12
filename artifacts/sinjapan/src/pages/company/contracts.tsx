import { useEffect, useState } from 'react';
import { FileText, Phone, Mail, MessageSquare, Truck, RotateCcw, CheckCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const CONTRACT_STATUS: Record<string, string> = {
  pending_payment:  '決済待ち',
  active:           '利用中',
  delivery_pending: '納車待ち',
  return_pending:   '返却予定',
  payment_issue:    '未払い',
  completed:        '完了',
  cancelled:        'キャンセル',
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
        toast({ title: '受取確認が完了しました' });
        load();
      } else {
        const err = await r.json();
        toast({ variant: 'destructive', title: err.error ?? '確認に失敗しました' });
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
        toast({ title: '返却確認が完了しました' });
        load();
      } else {
        const err = await r.json();
        toast({ variant: 'destructive', title: err.error ?? '確認に失敗しました' });
      }
    } finally { setConfirming(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        <h1 className="text-xl font-bold">契約</h1>
        <span className="text-sm text-muted-foreground">({contracts.length}件)</span>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1.5 flex-wrap border-b border-border pb-3">
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? contracts.length
            : contracts.filter(c => (c.application_status ?? c.status) === f.key).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted'
              }`}>
              {f.label}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <div className="border border-border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="h-7 w-7 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">該当する契約はありません</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ユーザー</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">連絡先</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">車両</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ステータス</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">開始日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const appId = c.application_id;
                const isConfirming = confirming === appId;
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{c.id}</td>
                    <td className="px-4 py-3 font-medium">{c.user_name ?? '—'}</td>
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
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs">{c.maker} {c.model}</p>
                      {c.prefecture && <p className="text-xs text-muted-foreground">{c.prefecture}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground">
                        {CONTRACT_STATUS[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.start_date ?? c.startDate ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {c.application_status === 'delivery_pending' && appId && (
                          <button onClick={() => confirmPickup(appId)} disabled={isConfirming}
                            className="flex items-center gap-1 px-2.5 py-1 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-80 disabled:opacity-50">
                            <Truck className="h-3 w-3" />受取確認
                          </button>
                        )}
                        {c.application_status === 'return_pending' && appId && (
                          <button onClick={() => confirmReturn(appId)} disabled={isConfirming}
                            className="flex items-center gap-1 px-2.5 py-1 border border-foreground rounded-md text-xs font-medium hover:bg-muted disabled:opacity-50">
                            <RotateCcw className="h-3 w-3" />返却確認
                          </button>
                        )}
                        {c.application_status === 'active' && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle className="h-3.5 w-3.5" />利用中
                          </span>
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
