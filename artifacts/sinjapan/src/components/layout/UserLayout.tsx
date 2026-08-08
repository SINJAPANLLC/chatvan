import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';

import { useGetMe, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus, Clock, LayoutDashboard, LogOut, Settings, Menu, X, FileText, Building2, MessageSquare, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

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
      {/* Top: logo + close button */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <Link href="/" onClick={onClose}>
          <img src="/logo.jpg" alt="Chat LOGI" className="h-7 w-auto" />
        </Link>
        {/* Desktop collapse button */}
        {!onClose && (
          <button
            onClick={toggleSidebar}
            className="hidden md:flex text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            title="サイドバーを閉じる"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
        {/* Mobile close button */}
        {onClose && (
          <button className="md:hidden text-muted-foreground" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {user && (
          <Link href="/" onClick={onClose}>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors">
              <Plus className="h-4 w-4 shrink-0" />
              新規配送
            </button>
          </Link>
        )}
        {user && (
          <Link href="/history" onClick={onClose}>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Clock className="h-4 w-4 shrink-0" />
              配送履歴
            </button>
          </Link>
        )}
      </nav>

      {/* Bottom section */}
      <div className="px-2 pb-4 space-y-0.5">
        {user ? (
          <>
            <Link href="/contact" onClick={onClose}>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <MessageSquare className="h-4 w-4 shrink-0" />
                お問い合わせ
              </button>
            </Link>
            <Link href="/settings" onClick={onClose}>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <Settings className="h-4 w-4 shrink-0" />
                設定
              </button>
            </Link>
            {user?.role === 'admin' && (
              <Link href="/admin" onClick={onClose}>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  管理者
                </button>
              </Link>
            )}
            <div className="mx-1 my-2 border-t border-border" />
            <p className="px-3 py-1 text-xs text-muted-foreground truncate">{user.email}</p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              ログアウト
            </button>
          </>
        ) : (
          /* Non-logged-in bottom CTA */
          <div className="mx-1 rounded-xl bg-muted p-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed font-semibold">自分に合った回答を得る</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ログインすると、配送履歴に基づいた提案やファイルのアップロードが利用できます。
            </p>
            <Link href="/login" onClick={onClose}>
              <button className="w-full rounded-full border border-border bg-background py-2 text-sm font-medium hover:bg-muted transition-colors">
                ログイン
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  const isLoggedIn = !!user;
  const isChatPage = pathname.startsWith('/chat/');

  return (
    <div className="min-h-[100dvh] flex bg-background font-sans text-foreground">

      {/* Desktop sidebar — logged in only, collapsible */}
      {isLoggedIn && (
        <aside
          className={`hidden md:flex flex-col border-r border-border/50 shrink-0 sticky top-0 h-[100dvh] overflow-hidden transition-all duration-200 ease-in-out ${
            sidebarOpen ? 'w-56' : 'w-0 border-r-0'
          }`}
        >
          <div className="w-56 flex flex-col h-full overflow-y-auto">
            <NavContent />
          </div>
        </aside>
      )}

      {/* Mobile sidebar overlay — logged in only */}
      {isLoggedIn && mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-background border-r border-border h-full shadow-xl overflow-y-auto">
            <NavContent onClose={() => setMobileOpen(false)} />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="flex items-center h-12 px-4 border-b border-border/40">
          {/* Mobile hamburger */}
          {isLoggedIn && (
            <button
              className="md:hidden mr-3 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {/* Desktop sidebar open button — only when collapsed */}
          {isLoggedIn && !sidebarOpen && (
            <button
              className="hidden md:flex mr-3 text-muted-foreground hover:text-foreground transition-colors"
              onClick={toggleSidebar}
              title="サイドバーを開く"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}

          {/* Logo */}
          <Link href="/">
            <img
              src="/logo.jpg"
              alt="Chat LOGI"
              className={`h-7 w-auto ${isLoggedIn && sidebarOpen ? 'md:hidden' : ''}`}
            />
          </Link>

          <div className="flex-1" />

          {/* Notification bell — logged in only */}
          {isLoggedIn && <NotificationBell />}

          {/* Auth buttons — not logged in only */}
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

        <main className={`flex-1 flex flex-col ${isChatPage ? 'overflow-hidden' : ''}`}>
          {children}
        </main>

        {!isChatPage && (
          <footer className="border-t border-border py-5 mt-auto">
            <p className="text-center text-xs text-muted-foreground">
              © {new Date().getFullYear()} Chat LOGI. All rights reserved.
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
