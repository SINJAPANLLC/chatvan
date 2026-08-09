import React, { useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-50 text-green-700 border-green-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
  view:   'bg-gray-50 text-gray-600 border-gray-200',
  approve:'bg-teal-50 text-teal-700 border-teal-200',
  reject: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function AdminAuditLogs() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API('/van/audit-logs'), { headers: { Authorization: `Bearer ${token()}` } });
      if (r.ok) setLogs(await r.json());
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const filtered = filter ? logs.filter(l => l.action?.includes(filter) || l.target_type?.includes(filter) || l.actor_name?.includes(filter)) : logs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">監査ログ</h1>
          <p className="text-sm text-muted-foreground">重要操作の記録を確認します</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm">
          <RefreshCw className="h-4 w-4" />更新
        </button>
      </div>

      <input className="w-full border border-border rounded-lg px-4 py-2 text-sm" placeholder="アクション・対象・操作者で絞り込み..." value={filter} onChange={e => setFilter(e.target.value)} />

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">ログはありません</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">日時</th>
                <th className="px-4 py-3 text-left font-medium">操作者</th>
                <th className="px-4 py-3 text-left font-medium">アクション</th>
                <th className="px-4 py-3 text-left font-medium">対象</th>
                <th className="px-4 py-3 text-left font-medium">詳細</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log: any) => (
                <tr key={log.id} className="border-b border-border hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{log.actor_name ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">{log.actor_type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${ACTION_COLORS[log.action] ?? ACTION_COLORS.view}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{log.target_type ?? '-'}</div>
                    <div className="text-muted-foreground">ID: {log.target_id ?? '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.after_data ? JSON.stringify(log.after_data).slice(0, 80) + '...' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
