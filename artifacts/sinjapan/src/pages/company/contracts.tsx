import { useEffect, useState } from 'react';
import { FileText, Phone, Mail, MessageSquare } from 'lucide-react';
import { Link } from 'wouter';
const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: '新規', color: 'bg-gray-100 text-gray-700' },
  hearing: { label: 'ヒアリング', color: 'bg-blue-100 text-blue-700' },
  proposed: { label: '提案済み', color: 'bg-purple-100 text-purple-700' },
  approved: { label: '承認', color: 'bg-green-100 text-green-700' },
  contracting: { label: '契約手続き', color: 'bg-yellow-100 text-yellow-700' },
  active: { label: '利用中', color: 'bg-green-100 text-green-700' },
  payment_issue: { label: '未払い', color: 'bg-red-100 text-red-700' },
  return_pending: { label: '返却予定', color: 'bg-orange-100 text-orange-700' },
  completed: { label: '完了', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'キャンセル', color: 'bg-gray-100 text-gray-500' },
};

export default function CompanyContracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(API('/company/contracts'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setContracts(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);

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
        {['all', 'active', 'payment_issue', 'return_pending', 'completed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}>
            {s === 'all' ? `すべて (${contracts.length})` : `${STATUS_LABELS[s]?.label} (${contracts.filter(c => c.status === s).length})`}
          </button>
        ))}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const st = STATUS_LABELS[c.status];
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
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${st?.color ?? 'bg-muted text-muted-foreground'}`}>
                        {st?.label ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.start_date ?? c.startDate ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/contract-chat/${c.id}`}>
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
                          <MessageSquare className="h-3.5 w-3.5" />
                          チャット
                        </button>
                      </Link>
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
