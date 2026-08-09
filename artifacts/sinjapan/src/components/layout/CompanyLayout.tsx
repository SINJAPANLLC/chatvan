import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Car, FileText, Shield, MapPin, LogOut,
  Menu, X, Building2, Bell, MessageSquare, Loader2,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

const navItems = [
  { href: '/company',           label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/company/vehicles',  label: '自社車両',       icon: Car },
  { href: '/company/contracts', label: '契約・ユーザー', icon: FileText },
  { href: '/company/insurance', label: '保険管理',       icon: Shield },
  { href: '/company/gps',       label: 'GPS確認',        icon: MapPin },
  { href: '/company/contact',   label: 'SIN JAPANへ問い合わせ', icon: MessageSquare },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { data: user } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [pathname] = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('sinjapan_auth_token');
    queryClient.clear();
    logout.mutate(undefined, { onSettled: () => window.location.href = '/login' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <Link href="/company" onClick={onClose}>
          <div className="flex items-center gap-2 cursor-pointer">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">協力会社ポータル</span>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {user && (
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/company' ? pathname === '/company' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} onClick={onClose}>
              <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-4 border-t border-border pt-2 space-y-1">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          ログアウト
        </button>
      </div>
    </div>
  );
}

export function CompanyLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || (user.role !== 'rental_company' && user.role !== 'admin')) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border bg-background shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-background border-r border-border z-50">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <button onClick={() => setMobileOpen(true)} className="p-1 rounded hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
          <Building2 className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm flex-1">協力会社ポータル</span>
          <NotificationBell />
        </header>

        {/* Desktop header */}
        <header className="hidden lg:flex items-center justify-between px-6 py-3 border-b border-border bg-background">
          <h1 className="text-sm font-medium text-muted-foreground">協力会社ポータル</h1>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
