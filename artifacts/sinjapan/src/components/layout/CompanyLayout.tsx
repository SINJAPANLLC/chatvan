import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import {
  LayoutDashboard, Car, FileText, Shield, MapPin,
  Loader2, ArrowLeft, Menu, X, MessageSquare,
} from 'lucide-react';

const navItems = [
  { href: '/company',           label: 'ダッシュボード',         icon: LayoutDashboard },
  { href: '/company/vehicles',  label: '自社車両',               icon: Car },
  { href: '/company/contracts', label: '契約・ユーザー',         icon: FileText },
  { href: '/company/insurance', label: '保険管理',               icon: Shield },
  { href: '/company/gps',       label: 'GPS確認',                icon: MapPin },
  { href: '/company/contact',   label: 'SIN JAPANへ問い合わせ', icon: MessageSquare },
];

export function CompanyLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  React.useEffect(() => {
    if (!isLoading && (!user || (user.role !== 'rental_company' && user.role !== 'admin'))) {
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
  if (!user || (user.role !== 'rental_company' && user.role !== 'admin')) return null;

  const handleLogout = () => {
    localStorage.removeItem('sinjapan_auth_token');
    logout.mutate(undefined, { onSuccess: () => setLocation('/login') });
    setMobileOpen(false);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-6 border-b border-border shrink-0">
        <Link href="/company" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
          <span className="text-xs font-medium text-muted-foreground">協力会社</span>
        </Link>
        <button className="md:hidden text-muted-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/company' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border shrink-0 space-y-1">
        <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
          ログアウト
        </button>
        <Link href="/" className="text-xs text-muted-foreground hover:underline flex items-center gap-1 px-3 py-2">
          <ArrowLeft className="h-3 w-3" />一般画面へ
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex bg-sidebar text-foreground font-sans">
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card sticky top-0 h-[100dvh] shrink-0">
        <NavContent />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-card border-r border-border h-full shadow-xl overflow-y-auto flex flex-col">
            <NavContent />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/company" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
            <span className="text-xs text-muted-foreground">協力会社</span>
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
