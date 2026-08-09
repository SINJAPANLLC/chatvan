import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import {
  LayoutDashboard, Car, Building2, Users, FileText,
  Loader2, Bell, Menu, X, MessageSquare,
  Bot, Shield, MapPin, AlertTriangle, RotateCcw,
  ClipboardList, CreditCard, ScrollText, ChevronDown, ChevronRight
} from 'lucide-react';

interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    core: true, operation: true, settings: false,
  });

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

  const navGroups: NavGroup[] = [
    {
      label: '業務',
      items: [
        { href: '/admin',                   label: 'ダッシュボード',  icon: LayoutDashboard },
        { href: '/admin/applications',      label: '相談案件',        icon: MessageSquare },
        { href: '/admin/screenings',        label: '審査',            icon: ClipboardList },
        { href: '/admin/contracts',         label: '契約管理',        icon: FileText },
        { href: '/admin/payments',          label: '決済',            icon: CreditCard },
      ],
    },
    {
      label: '車両・会社',
      items: [
        { href: '/admin/vehicles',          label: '車両管理',        icon: Car },
        { href: '/admin/rental-companies',  label: 'レンタル会社',    icon: Building2 },
        { href: '/admin/insurance',         label: '保険',            icon: Shield },
        { href: '/admin/gps',               label: 'GPS',             icon: MapPin },
      ],
    },
    {
      label: '事故・返却',
      items: [
        { href: '/admin/incidents',         label: '事故・故障',      icon: AlertTriangle },
        { href: '/admin/returns',           label: '返却管理',        icon: RotateCcw },
      ],
    },
    {
      label: '管理',
      items: [
        { href: '/admin/customers',         label: 'ユーザー管理',    icon: Users },
        { href: '/admin/notifications',     label: '通知管理',        icon: Bell },
        { href: '/admin/audit-logs',        label: '監査ログ',        icon: ScrollText },
        { href: '/admin/pricing',           label: 'AIプロンプト',    icon: Bot },
      ],
    },
  ];

  const isActive = (href: string) =>
    location === href || (href !== '/admin' && location.startsWith(href));

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
        <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
          <span className="text-xs font-medium text-muted-foreground">管理者</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            {group.items.map(item => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <div className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border shrink-0 space-y-2">
        <Link href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors">
          ← ユーザー画面へ
        </Link>
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-md transition-colors"
        >
          ログアウト
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-56 border-r border-border flex-col bg-sidebar shrink-0">
        <NavContent />
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border flex-col lg:hidden transition-transform duration-200 ${mobileOpen ? 'flex translate-x-0' : 'flex -translate-x-full'}`}>
        <div className="absolute top-3 right-3">
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden h-14 flex items-center gap-3 px-4 border-b border-border bg-background shrink-0">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logo.jpg" alt="Chat VAN" className="h-6 w-auto" />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
