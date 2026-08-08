import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import {
  LayoutDashboard, Package, Truck, Users, CircleDollarSign,
  Loader2, ArrowLeft, FileText, BarChart3, Bell, Menu, X,
  Mail, Search, MessageSquare,
} from 'lucide-react';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  React.useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-sidebar">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  const handleLogout = () => {
    localStorage.removeItem('sinjapan_auth_token');
    logout.mutate(undefined, { onSuccess: () => setLocation('/login') });
    setMobileOpen(false);
  };

  const navItems = [
    { href: '/admin',               label: 'ダッシュボード',   icon: LayoutDashboard },
    { href: '/admin/shipments',     label: '案件一覧',         icon: Package },
    { href: '/admin/carriers',      label: '運送会社管理',     icon: Truck },
    { href: '/admin/customers',     label: 'ユーザー管理',     icon: Users },
    { href: '/admin/invoices',      label: '請求書払い申請',   icon: FileText },
    { href: '/admin/finance',       label: 'PL / BS / CF',    icon: BarChart3 },
    { href: '/admin/pricing',       label: 'AIプロンプト',      icon: CircleDollarSign },
    { href: '/admin/notifications',    label: '通知管理',     icon: Bell },
    { href: '/admin/email-marketing', label: 'メール営業',    icon: Mail },
    { href: '/admin/blog',            label: 'ブログ管理',   icon: FileText },
    { href: '/admin/seo',             label: 'SEO設定',      icon: Search },
    { href: '/admin/contacts',        label: 'お問い合わせ',  icon: MessageSquare },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo + close */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border/50 shrink-0">
        <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Chat LOGI" className="h-6 w-auto" />
          <span className="text-xs font-normal text-muted-foreground">管理者</span>
        </Link>
        <button className="md:hidden text-muted-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border shrink-0">
        <Link href="/" className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />
          一般画面へ
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex bg-sidebar text-foreground font-sans">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card sticky top-0 h-[100dvh] shrink-0">
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-card border-r border-border h-full shadow-xl overflow-y-auto flex flex-col">
            <NavContent />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/admin" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Chat LOGI" className="h-5 w-auto" />
            <span className="text-xs text-muted-foreground">管理者</span>
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
