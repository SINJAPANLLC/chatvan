import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, RefreshCw, Loader2, Search, Filter,
  LogIn, LogOut, MessageCircle, FileCheck, XCircle,
  User, Send, Shield, CreditCard, AlertTriangle, Phone,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';

function apiFetch(path: string) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(`${import.meta.env.BASE_URL}api${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}

// ── アクション設定 ─────────────────────────────────────────────────────────────
const ACTION_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  login:                  { icon: LogIn,          color: 'text-green-700',  bg: 'bg-green-50 border-green-200'  },
  login_failed:           { icon: AlertTriangle,  color: 'text-red-700',    bg: 'bg-red-50 border-red-200'      },
  register:               { icon: User,           color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'    },
  logout:                 { icon: LogOut,         color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200'    },
  chat_start:             { icon: MessageCircle,  color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200'},
  chat_message:           { icon: Send,           color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100'},
  apply:                  { icon: FileCheck,      color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200'   },
  cancel:                 { icon: XCircle,        color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200'},
  profile_update:         { icon: User,           color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200'      },
  view_proposal:          { icon: FileCheck,      color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200'},
  proposal_accepted:      { icon: FileCheck,      color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200'   },
  contract_started:       { icon: FileCheck,      color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  contract_ended:         { icon: FileCheck,      color: 'text-gray-600',   bg: 'bg-gray-50 border-gray-200'   },
  payment_completed:      { icon: CreditCard,     color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  password_reset_request: { icon: Shield,         color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  kyc_uploaded:           { icon: Shield,         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'   },
  contact_sent:           { icon: Phone,          color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-200'   },
};

const defaultMeta = { icon: Activity, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' };

const ACTION_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'login',             label: 'ログイン' },
  { value: 'login_failed',      label: 'ログイン失敗' },
  { value: 'register',          label: '会員登録' },
  { value: 'logout',            label: 'ログアウト' },
  { value: 'chat_start',        label: '相談開始' },
  { value: 'chat_message',      label: 'メッセージ送信' },
  { value: 'apply',             label: '申込確定' },
  { value: 'cancel',            label: 'キャンセル' },
  { value: 'profile_update',    label: 'プロフィール更新' },
  { value: 'view_proposal',     label: '提案確認' },
  { value: 'proposal_accepted', label: '提案承諾' },
  { value: 'contract_started',  label: '契約開始' },
  { value: 'contract_ended',    label: '契約終了' },
  { value: 'payment_completed', label: '決済完了' },
  { value: 'password_reset_request', label: 'パスワード再設定要求' },
  { value: 'kyc_uploaded',      label: '本人確認書類アップロード' },
  { value: 'contact_sent',      label: 'お問い合わせ' },
];

const PAGE_SIZE = 50;

type Log = {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  label: string | null;
  detail: string | null;
  targetId: string | null;
  targetType: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export default function AdminUserLogs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(search      && { search }),
        ...(actionFilter && { action: actionFilter }),
        ...(dateFrom    && { dateFrom }),
        ...(dateTo      && { dateTo }),
      });
       const data = await apiFetch(`/admin/user-logs?${params}`);
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }, [page, search, actionFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // フィルター変更時はページ1に戻す
  const applyFilter = () => {
    if (page === 1) void load();
    else setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" />ユーザーログ
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ユーザーの行動・操作履歴</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{total.toLocaleString()} 件</span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            更新
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />絞り込み
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* ユーザー検索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilter()}
              placeholder="名前・メールで検索"
              className="pl-8 text-sm h-9"
            />
          </div>
          {/* アクション */}
          <select
            value={actionFilter}
            onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            className="border border-input rounded-md px-3 h-9 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {/* 期間 */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-input rounded-md px-3 h-9 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="border border-input rounded-md px-3 h-9 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
      </div>

      {/* テーブル */}
      <div className="rounded-xl border border-border overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Activity className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">ログはありません</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium w-36">日時</th>
                <th className="px-4 py-3 text-left font-medium">ユーザー</th>
                <th className="px-4 py-3 text-left font-medium w-36">アクション</th>
                <th className="px-4 py-3 text-left font-medium">詳細</th>
                <th className="px-4 py-3 text-left font-medium w-28">IPアドレス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {logs.map(log => {
                const meta = ACTION_META[log.action] ?? defaultMeta;
                const Icon = meta.icon;
                return (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.createdAt), 'MM/dd HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      {log.userId ? (
                        <div>
                          <div className="font-medium text-xs">{log.userName ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{log.userEmail ?? ''}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">未ログイン</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${meta.bg} ${meta.color}`}>
                        <Icon className="h-3 w-3" />
                        {log.label ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      <div className="truncate">{log.detail ?? '—'}</div>
                      {log.targetId && (
                        <div className="text-xs text-muted-foreground/60">
                          {log.targetType} #{log.targetId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString()} 件
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs px-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
