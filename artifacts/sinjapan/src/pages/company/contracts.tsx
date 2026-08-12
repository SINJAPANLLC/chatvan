import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Phone, Mail, MessageSquare, Truck, RotateCcw, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  pending_payment:  '決済待ち',
  active:           '利用中',
  delivery_pending: '納車待ち',
  return_pending:   '返却予定',
  payment_issue:    '未払い',
  completed:        '完了',
  cancelled:        'キャンセル',
  new:              '新規',
  hearing:          'ヒアリング中',
  contracting:      '契約手続き',
};

const CONTRACT_STATUS_STYLE: Record<string, string> = {
  active:           'bg-green-50 text-green-700 border border-green-200',
  delivery_pending: 'bg-sky-50 text-sky-700 border border-sky-200',
  return_pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  payment_issue:    'bg-red-50 text-red-700 border border-red-200',
  pending_payment:  'bg-pink-50 text-pink-700 border border-pink-200',
  completed:        'bg-gray-50 text-gray-500 border border-gray-200',
  cancelled:        'bg-gray-50 text-gray-400 border border-gray-200',
};

const FILTERS = [
  { key: 'all',             label: 'すべて' },
  { key: 'delivery_pending',label: '納車待ち' },
  { key: 'active',          label: '利用中' },
  { key: 'return_pending',  label: '返却予定' },
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
    fetch(API('/company/contracts'), { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(j => setContracts(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all'
    ? contracts
    : contracts.filter(c => (c.status ?? c.application_status) === filter);

  const confirmPickup = async (appId: number) => {
    if (!confirm('受取確認を行いますか？')) return;
    setConfirming(appId);
    try {
      const r = await fetch(API(`/van/applications/${appId}/confirm-pickup`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify({}),
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
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authH() }, body: JSON.stringify({}),
      });
      if (r.ok) { toast({ title: '返却確認が完了しました' }); load(); }
      else { const e = await r.json(); toast({ variant: 'destructive', title: e.error ?? '確認に失敗しました' }); }
    } finally { setConfirming(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">契約</h1>
        <p className="text-sm text-muted-foreground mt-1">自社車両の契約状況と利用ユーザーを管理します。</p>
      </div>

      {/* フィルタータブ */}
      <div className="flex gap-1.5 flex-wrap border-b border-border pb-3">
        {FILTERS.map(f => {
          const count = f.key === 'all' ? contracts.length
            : contracts.filter(c => (c.status ?? c.application_status) === f.key).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}>
              {f.label} {count > 0 && <span className="opacity-60 ml-0.5">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <Card className="border-border shadow-sm overflow-hidden p-0">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">該当する契約はありません</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                  <th className="px-4 py-3 text-left font-medium">ユーザー</th>
                  <th className="px-4 py-3 text-left font-medium">連絡先</th>
                  <th className="px-4 py-3 text-left font-medium">車両</th>
                  <th className="px-4 py-3 text-left font-medium">ステータス</th>
                  <th className="px-4 py-3 text-left font-medium">開始日</th>
                  <th className="px-4 py-3 text-left font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const appId = c.application_id;
                  const appStatus = c.application_status;
                  const isConfirming = confirming === appId;
                  const statusKey = c.status;
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-4 font-mono text-xs text-muted-foreground">#{c.id}</td>
                      <td className="px-4 py-4 font-medium">{c.user_name ?? '—'}</td>
                      <td className="px-4 py-4">
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
                      <td className="px-4 py-4">
                        <div className="font-medium text-xs">{c.maker} {c.model}</div>
                        {c.prefecture && <div className="text-xs text-muted-foreground">{c.prefecture}</div>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${CONTRACT_STATUS_STYLE[statusKey] ?? 'bg-gray-100 text-gray-600'}`}>
                          {CONTRACT_STATUS_LABEL[statusKey] ?? statusKey}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        {c.start_date ?? c.startDate ?? '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {appStatus === 'delivery_pending' && appId && (
                            <button onClick={() => confirmPickup(appId)} disabled={isConfirming}
                              className="flex items-center gap-1 px-2.5 py-1 bg-foreground text-background rounded-md text-xs font-medium hover:opacity-80 disabled:opacity-50">
                              <Truck className="h-3 w-3" />受取確認
                            </button>
                          )}
                          {appStatus === 'return_pending' && appId && (
                            <button onClick={() => confirmReturn(appId)} disabled={isConfirming}
                              className="flex items-center gap-1 px-2.5 py-1 border border-border rounded-md text-xs font-medium hover:bg-muted disabled:opacity-50">
                              <RotateCcw className="h-3 w-3" />返却確認
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
        </CardContent>
      </Card>
    </div>
  );
}
