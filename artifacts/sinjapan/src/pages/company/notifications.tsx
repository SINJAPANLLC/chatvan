import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const token = () => localStorage.getItem('sinjapan_auth_token') ?? '';

export default function CompanyNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    fetch(API('/company/notifications'), { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(j => setNotifications(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    setMarking(id);
    try {
      await fetch(API(`/company/notifications/${id}/read`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } finally { setMarking(null); }
  };

  const markAllRead = async () => {
    try {
      await fetch(API('/company/notifications/read-all'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast({ title: 'すべて既読にしました' });
    } catch {
      toast({ variant: 'destructive', title: '更新に失敗しました' });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-foreground" />
          <h1 className="text-xl font-bold">通知</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-foreground text-background rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <CheckCheck className="h-3.5 w-3.5" />すべて既読
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="border border-border rounded-xl p-12 text-center space-y-2">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">通知はありません</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
          {notifications.map((n: any) => (
            <div key={n.id}
              className={`px-5 py-4 flex items-start gap-3 transition-colors ${n.read ? 'bg-card' : 'bg-blue-50/50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${n.read ? 'bg-muted' : 'bg-blue-100'}`}>
                <Info className={`h-4 w-4 ${n.read ? 'text-muted-foreground' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${n.read ? 'text-foreground' : 'text-foreground'}`}>{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                <p className="text-xs text-muted-foreground/60 mt-1.5">
                  {n.created_at ? new Date(n.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
              {!n.read && (
                <button onClick={() => markRead(n.id)} disabled={marking === n.id}
                  className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 whitespace-nowrap">
                  {marking === n.id ? '...' : '既読'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
