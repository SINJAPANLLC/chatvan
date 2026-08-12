import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, CheckCheck, Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const API = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });

export default function CompanyNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    fetch(API('/company/notifications'), { headers: authH() })
      .then(r => r.ok ? r.json() : [])
      .then(j => setNotifications(Array.isArray(j) ? j : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: number) => {
    setMarking(id);
    try {
      await fetch(API(`/company/notifications/${id}/read`), { method: 'PATCH', headers: authH() });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_status: true } : n));
    } finally { setMarking(null); }
  };

  const markAllRead = async () => {
    try {
      await fetch(API('/company/notifications/read-all'), { method: 'PATCH', headers: authH() });
      setNotifications(prev => prev.map(n => ({ ...n, read_status: true })));
      toast({ title: 'すべて既読にしました' });
    } catch {
      toast({ variant: 'destructive', title: '更新に失敗しました' });
    }
  };

  const unreadCount = notifications.filter(n => !n.read_status).length;

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            通知
            {unreadCount > 0 && (
              <span className="text-sm font-medium px-2 py-0.5 bg-foreground text-background rounded-full">{unreadCount}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">SIN JAPANからのお知らせを確認できます。</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted transition-colors">
            <CheckCheck className="h-3.5 w-3.5" />すべて既読
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="border-border shadow-sm">
          <CardContent className="py-12 text-center">
            <Bell className="h-7 w-7 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">通知はありません</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border shadow-sm overflow-hidden p-0">
          <CardContent className="p-0 divide-y divide-border">
            {notifications.map((n: any) => (
              <div key={n.id} className={`flex items-start gap-3 px-5 py-4 transition-colors ${n.read_status ? '' : 'bg-muted/40'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${n.read_status ? 'bg-muted' : 'bg-foreground'}`}>
                  <Info className={`h-4 w-4 ${n.read_status ? 'text-muted-foreground' : 'text-background'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1.5">
                    {n.created_at ? new Date(n.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                {!n.read_status && (
                  <button onClick={() => markRead(n.id)} disabled={marking === n.id}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted disabled:opacity-50 whitespace-nowrap">
                    {marking === n.id ? '...' : '既読'}
                  </button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
