import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useGetMe, useLogout } from '@workspace/api-client-react';
import {
  LayoutDashboard, Car, Building2, Users, FileText,
  Loader2, ArrowLeft, Bell, Menu, X, MessageSquare,
  Bot, Receipt, TrendingUp, Mail, BookOpen, Search,
  MessageCircle, ScrollText, Activity, ClipboardCheck,
} from 'lucide-react';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
type Section = { title: string; items: NavItem[] };

const NAV_SECTIONS: Section[] = [
  {
    title: 'メイン',
    items: [
      { href: '/admin',              label: 'ダッシュボード', icon: LayoutDashboard },
      { href: '/admin/applications', label: '相談一覧',       icon: MessageSquare },
    ],
  },
  {
    title: 'マスター',
    items: [
      { href: '/admin/customers',        label: 'ユーザー管理', icon: Users },
      { href: '/admin/rental-companies', label: 'レンタル会社', icon: Building2 },
      { href: '/admin/vehicles',         label: '車両管理',     icon: Car },
      { href: '/admin/company-vehicles', label: '車両審査',     icon: ClipboardCheck },
    ],
  },
  {
    title: '財務',
    items: [
      { href: '/admin/corporate', label: '法人口座審査',   icon: Building2 },
      { href: '/admin/finance',  label: 'PL・BS・CF',    icon: TrendingUp },
    ],
  },
  {
    title: 'マーケ',
    items: [
      { href: '/admin/email-marketing', label: 'メール営業', icon: Mail },
      { href: '/admin/blog',            label: 'ブログ管理', icon: BookOpen },
    ],
  },
  {
    title: 'システム',
    items: [
      { href: '/admin/pricing',     label: 'AIプロンプト',   icon: Bot },
      { href: '/admin/notifications', label: '通知管理',     icon: Bell },
      { href: '/admin/audit-logs',  label: '監査ログ',       icon: ScrollText },
      { href: '/admin/user-logs',   label: 'ユーザーログ',   icon: Activity },
      { href: '/admin/seo',         label: 'SEO設定',        icon: Search },
      { href: '/admin/contacts',    label: 'お問い合わせ',   icon: MessageCircle },
    ],
  },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  React.useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) setLocation('/');
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
    logout.mutate(undefined);
    setLocation('/login');
    setMobileOpen(false);
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-6 border-b border-border shrink-0">
        <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
          <span className="text-xs font-medium text-muted-foreground">管理者</span>
        </Link>
        <button className="md:hidden text-muted-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
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
            </div>
          </div>
        ))}
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
          <Link href="/admin" className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Chat VAN" className="h-7 w-auto" />
            <span className="text-xs text-muted-foreground">管理者</span>
          </Link>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
