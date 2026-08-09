import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ScrollText, Search } from 'lucide-react';

interface AuditLog {
  id: number;
  actor: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: number;
  before?: string;
  after?: string;
  ipAddress?: string;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  'vehicle.update': '車両更新', 'vehicle.create': '車両登録', 'vehicle.delete': '車両削除',
  'application.status_change': '案件ステータス変更', 'proposal.send': '提案送信',
  'screening.update': '審査更新', 'contract.create': '契約作成', 'contract.update': '契約更新',
  'payment.process': '決済処理', 'gps.view': 'GPS閲覧',
  'insurance.update': '保険情報更新', 'return.process': '返却処理',
  'incident.update': '事故情報更新', 'user.update': 'ユーザー情報変更',
};

function apiHeaders() {
  const token = localStorage.getItem('sinjapan_auth_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function AdminAuditLogs() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const r = await fetch('/api/van/admin/audit-logs', { headers: apiHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60000,
  });

  const filtered = logs.filter(l => {
    const matchSearch = !search || l.action.includes(search) || l.actor.includes(search) || (l.actorEmail || '').includes(search);
    const matchType = typeFilter === 'all' || (l.targetType || '') === typeFilter;
    return matchSearch && matchType;
  });

  const targetTypes = [...new Set(logs.map(l => l.targetType).filter(Boolean))];

  const parseDiff = (before?: string, after?: string) => {
    try {
      const b = before ? JSON.parse(before) : null;
      const a = after ? JSON.parse(after) : null;
      return { before: b, after: a };
    } catch { return { before, after }; }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ScrollText className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">監査ログ</h1>
        <span className="text-sm text-muted-foreground">({logs.length} 件)</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="操作・担当者で検索..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-sm bg-background" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-border rounded-md px-3 py-2 text-sm bg-background">
          <option value="all">すべての対象</option>
          {targetTypes.map(t => <option key={t} value={t!}>{t}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ScrollText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>監査ログがありません</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">日時</th>
                <th className="text-left px-4 py-3 font-medium">担当者</th>
                <th className="text-left px-4 py-3 font-medium">操作</th>
                <th className="text-left px-4 py-3 font-medium">対象</th>
                <th className="text-left px-4 py-3 font-medium">変更</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(log)}>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString('ja-JP')}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{log.actor}</p>
                    {log.actorEmail && <p className="text-xs text-muted-foreground">{log.actorEmail}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm">{ACTION_LABELS[log.action] || log.action}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {log.targetType}{log.targetId ? ` #${log.targetId}` : ''}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {(log.before || log.after) ? (
                      <span className="text-blue-600 underline cursor-pointer">差分を見る</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{ACTION_LABELS[selected.action] || selected.action}</h2>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <dl className="space-y-2 text-sm mb-4">
              <div className="flex gap-4"><dt className="font-medium w-24 shrink-0">日時:</dt><dd className="text-muted-foreground">{new Date(selected.createdAt).toLocaleString('ja-JP')}</dd></div>
              <div className="flex gap-4"><dt className="font-medium w-24 shrink-0">担当者:</dt><dd className="text-muted-foreground">{selected.actor} {selected.actorEmail ? `(${selected.actorEmail})` : ''}</dd></div>
              <div className="flex gap-4"><dt className="font-medium w-24 shrink-0">対象:</dt><dd className="text-muted-foreground">{selected.targetType} {selected.targetId ? `#${selected.targetId}` : ''}</dd></div>
              {selected.ipAddress && <div className="flex gap-4"><dt className="font-medium w-24 shrink-0">IPアドレス:</dt><dd className="text-muted-foreground font-mono text-xs">{selected.ipAddress}</dd></div>}
            </dl>
            {(selected.before || selected.after) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">変更前</p>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-48">{selected.before ? JSON.stringify(parseDiff(selected.before, undefined).before, null, 2) : '—'}</pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">変更後</p>
                  <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-48">{selected.after ? JSON.stringify(parseDiff(undefined, selected.after).after, null, 2) : '—'}</pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
