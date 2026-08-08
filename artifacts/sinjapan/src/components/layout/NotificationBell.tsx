import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, Package } from 'lucide-react';
import { useLocation } from 'wouter';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

type Notif = {
  id: number;
  shipmentId: number | null;
  title: string;
  message: string;
  readStatus: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  const load = () => {
    customFetch<Notif[]>('/api/notifications')
      .then(setNotifs)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // パネル外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unread = notifs.filter(n => !n.readStatus).length;

  const markRead = async (id: number) => {
    await customFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, readStatus: true } : n));
  };

  const markAllRead = async () => {
    await Promise.all(notifs.filter(n => !n.readStatus).map(n => markRead(n.id)));
  };

  const handleClick = (notif: Notif) => {
    markRead(notif.id);
    if (notif.shipmentId) setLocation(`/proposal/${notif.shipmentId}`);
    setOpen(false);
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 1) return 'たった今';
    if (diff < 60) return `${diff}分前`;
    if (diff < 60 * 24) return `${Math.floor(diff / 60)}時間前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="relative p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="通知"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">通知</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />全て既読
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* リスト */}
          <div className="max-h-96 overflow-y-auto divide-y divide-border/50">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                通知はありません
              </div>
            ) : (
              notifs.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 items-start ${!n.readStatus ? 'bg-blue-50/40' : ''}`}
                >
                  <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${!n.readStatus ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                    <Package className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug line-clamp-1 ${!n.readStatus ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{fmtDate(n.createdAt)}</p>
                  </div>
                  {!n.readStatus && (
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
