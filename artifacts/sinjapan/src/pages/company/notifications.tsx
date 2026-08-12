import React, { useEffect, useState } from 'react';
import { Loader2, Bell, CheckCheck, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

const ICON_MAP: Record<string, React.ReactNode> = {
  info:    <Info        className="h-4 w-4 text-muted-foreground" />,
  warning: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
  success: <CheckCircle className="h-4 w-4 text-muted-foreground" />,
};

const TABS = [
  { key: 'unread', label: '未読' },
  { key: 'all',    label: '全て' },
];

export default function CompanyNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('unread');
  const [marking, setMarking] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setIsLoading(true);
    fetch(API('/company/notifications'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setNotifications(Array.isArray(j) ? j : []))
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    setMarking(id);
    try {
      await fetch(API(`/company/notifications/${id}/read`), {
        method: 'PATCH', headers: { Authorization: `Bearer ${token()}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } finally { setMarking(null); }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch(API('/company/notifications/read-all'), {
        method: 'PATCH', headers: { Authorization: `Bearer ${token()}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast({ title: 'すべて既読にしました' });
    } catch {
      toast({ variant: 'destructive', title: '更新に失敗しました' });
    } finally { setMarkingAll(false); }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = tab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">通知</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理者や契約状況に関するお知らせを確認します。
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} disabled={markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            {markingAll
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCheck className="h-3.5 w-3.5" />}
            すべて既読
          </button>
        )}
      </div>

      {/* タブ */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => {
          const count = t.key === 'unread' ? unreadCount : notifications.length;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-foreground border-b-2 border-foreground -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  t.key === 'unread' && tab === t.key
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <div className="rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {tab === 'unread' ? '未読の通知はありません' : '通知はありません'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground w-8"></th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">タイトル</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">内容</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">受信日時</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">既読</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filtered.map(n => (
                <tr key={n.id}
                  className={`hover:bg-muted/20 transition-colors align-top ${!n.read ? 'bg-muted/10' : ''}`}>
                  <td className="px-5 py-3.5">
                    {!n.read
                      ? <span className="inline-block w-2 h-2 rounded-full bg-foreground mt-1.5" />
                      : <span className="inline-block w-2 h-2 mt-1.5" />
                    }
                  </td>
                  <td className="px-5 py-3.5 font-medium max-w-[200px]">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0">{ICON_MAP[n.type] ?? ICON_MAP.info}</span>
                      <span className="truncate">{n.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground max-w-[360px]">
                    <div className="line-clamp-2 text-xs leading-relaxed">{n.message}</div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                    {n.created_at
                      ? format(new Date(n.created_at), 'yyyy/MM/dd HH:mm')
                      : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCheck className={`h-4 w-4 ${n.read ? 'text-foreground' : 'text-muted-foreground/30'}`} />
                      <span className="text-xs text-muted-foreground">{n.read ? '既読' : '未読'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!n.read && (
                      <button onClick={() => markRead(n.id)} disabled={marking === n.id}
                        className="px-2.5 py-1 border border-border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                        {marking === n.id
                          ? <Loader2 className="h-3 w-3 animate-spin inline" />
                          : '既読にする'}
                      </button>
                    )}
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
