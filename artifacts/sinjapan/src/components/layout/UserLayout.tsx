import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus, LayoutDashboard, LogOut, Settings, Menu, X, MessageSquare, PanelLeftClose, PanelLeftOpen, User as UserIcon, Building2, History
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

const BASE = import.meta.env.BASE_URL;
const apiUrl = (p: string) => `${BASE}api${p}`;

type VanApp = { id: number; status: string; area: string | null; createdAt: string };

function appLink(app: VanApp): string {
  const { id, status } = app;
  if (['new', 'hearing'].includes(status)) return `/van/${id}`;
  if (status === 'proposed') return `/van/${id}/proposal`;
  return `/van/${id}/status`;
}

const STATUS_LABEL: Record<string, string> = {
  new: '相談中', hearing: 'ヒアリング中', proposed: '提案あり',
  application_received: '審査中', screening: '審査中', approved: '承認済み',
  contracting: '契約手続き', pending_payment: '決済待ち',
  active: '利用中', completed: '完了', rejected: '審査落ち',
};
const STATUS_DOT: Record<string, string> = {
  new: 'bg-blue-400', hearing: 'bg-blue-400', proposed: 'bg-purple-400',
  application_received: 'bg-yellow-400', screening: 'bg-yellow-400', approved: 'bg-green-400',
  contracting: 'bg-indigo-400', pending_payment: 'bg-orange-400',
  active: 'bg-emerald-500', completed: 'bg-gray-400', rejected: 'bg-red-400',
};

export function UserLayout({ children }: { children: React.ReactNode }) {
  const hasToken = !!localStorage.getItem('sinjapan_auth_token');
  const { data: user } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [pathname, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem('sidebar_open') !== 'false';
  });
  const [history, setHistory] = useState<VanApp[]>([]);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('sinjapan_auth_token');
    fetch(apiUrl('/van/my/applications'), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: VanApp[]) => setHistory(data.slice(0, 8)))
      .catch(() => {});
  }, [user, pathname]); // pathname が変わるたびに再取得（新相談後に反映）

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      localStorage.setItem('sidebar_open', String(!prev));
      return !prev;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('sinjapan_auth_token');
    queryClient.clear();
    logout.mutate(undefined);
    setLocation('/login');
    setMobileOpen(false);
  };

  const NavContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <Link href="/" onClick={onClose} className="px-2">
          <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
        </Link>
        {!onClose && (
          <button
            onClick={toggleSidebar}
            className="hidden md:flex text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            title="サイドバーを閉じる"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
        {onClose && (
          <button className="md:hidden text-muted-foreground" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        {user && (
          <Link href="/" onClick={onClose}>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted transition-colors">
              <Plus className="h-4 w-4 shrink-0" />
              新規相談
            </button>
          </Link>
        )}

        {/* 相談履歴リンク */}
        {user && (
          <Link href="/van/history" onClick={onClose}>
            <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === '/van/history' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <History className="h-4 w-4 shrink-0" />
              相談履歴
              {history.length > 0 && (
                <span className="ml-auto text-xs bg-muted-foreground/15 text-muted-foreground rounded-full px-2 py-0.5">{history.length}</span>
              )}
            </button>
          </Link>
        )}

        {user && (
          <Link href="/mypage" onClick={onClose}>
            <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === '/mypage' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <UserIcon className="h-4 w-4 shrink-0" />
              マイページ
            </button>
          </Link>
        )}
      </nav>

      <div className="px-2 pb-4 space-y-1">
        {user ? (
          <>
            <Link href="/contact" onClick={onClose}>
              <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <MessageSquare className="h-4 w-4 shrink-0" />
                お問い合わせ
              </button>
            </Link>
            <Link href="/settings" onClick={onClose}>
              <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${pathname === '/settings' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <Settings className="h-4 w-4 shrink-0" />
                設定
              </button>
            </Link>
            {(user?.role === 'rental_company' || user?.role === 'admin') && (
              <Link href="/company" onClick={onClose}>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Building2 className="h-4 w-4 shrink-0" />
                  協力会社
                </button>
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link href="/admin" onClick={onClose}>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  管理者
                </button>
              </Link>
            )}
            <div className="mx-1 my-2 border-t border-border/50" />
            <p className="px-3 py-1 text-xs text-muted-foreground font-medium truncate">{user.email}</p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              ログアウト
            </button>
          </>
        ) : (
          <div className="mx-1 rounded-xl bg-muted p-4 space-y-3">
            <p className="text-xs text-foreground font-semibold">Chat VANに登録</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ログインすると、相談履歴に基づいた車両提案の受け取りなどが利用できます。
            </p>
            <Link href="/login" onClick={onClose}>
              <button className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
                ログイン
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  const isLoggedIn = !!user;
  const isChatPage = pathname.startsWith('/van/');

  return (
    <div className="min-h-[100dvh] flex bg-background font-sans text-foreground">
      {isLoggedIn && (
        <aside
          className={`hidden md:flex flex-col border-r border-border shrink-0 sticky top-0 h-[100dvh] overflow-hidden transition-all duration-200 ease-in-out ${
            sidebarOpen ? 'w-60' : 'w-0 border-r-0'
          }`}
        >
          <div className="w-60 flex flex-col h-full overflow-y-auto">
            <NavContent />
          </div>
        </aside>
      )}

      {isLoggedIn && mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-background border-r border-border h-full shadow-xl overflow-y-auto">
            <NavContent onClose={() => setMobileOpen(false)} />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-[100dvh]">
        <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
          {isLoggedIn && (
            <button
              className="md:hidden mr-3 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {isLoggedIn && !sidebarOpen && (
            <button
              className="hidden md:flex mr-4 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
              onClick={toggleSidebar}
              title="サイドバーを開く"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}

          <Link href="/" className={`${isLoggedIn && sidebarOpen ? 'md:hidden' : ''}`}>
            <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
          </Link>

          <div className="flex-1" />

          {isLoggedIn && <NotificationBell />}

          {!isLoggedIn && !hasToken && (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <button className="text-sm font-medium px-4 py-1.5 rounded-full hover:bg-muted transition-colors">
                  ログイン
                </button>
              </Link>
              <Link href="/register">
                <button className="text-sm font-medium px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity">
                  新規登録
                </button>
              </Link>
            </div>
          )}
        </header>

        <main className={`flex-1 flex flex-col min-h-0 overflow-y-auto ${isChatPage ? 'overflow-hidden' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
