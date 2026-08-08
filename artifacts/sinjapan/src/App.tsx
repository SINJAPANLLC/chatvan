import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';

// Send auth token from localStorage on every API request (bypasses cookie issues)
setAuthTokenGetter(() => localStorage.getItem('sinjapan_auth_token'));

import { UserLayout } from '@/components/layout/UserLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';

// ── Lazy-loaded pages (code splitting) ────────────────────────────────────────
// User Pages
const Home          = lazy(() => import('@/pages/home'));
const Chat          = lazy(() => import('@/pages/chat'));
const Proposal      = lazy(() => import('@/pages/proposal'));
const Shipment      = lazy(() => import('@/pages/shipment'));
const Payment       = lazy(() => import('@/pages/payment'));
const History       = lazy(() => import('@/pages/history'));
const Settings      = lazy(() => import('@/pages/settings'));
const Login         = lazy(() => import('@/pages/login'));
const Register      = lazy(() => import('@/pages/register'));
const ForgotPassword = lazy(() => import('@/pages/forgot-password'));
const ResetPassword = lazy(() => import('@/pages/reset-password'));
const Contact       = lazy(() => import('@/pages/contact'));
const CorporateApply = lazy(() => import('@/pages/corporate-apply'));
const Invoices      = lazy(() => import('@/pages/invoices'));
const InvoiceDetail = lazy(() => import('@/pages/invoice-detail'));

// Admin Pages
const Dashboard          = lazy(() => import('@/pages/admin/dashboard'));
const AdminShipments     = lazy(() => import('@/pages/admin/shipments'));
const AdminShipmentDetail = lazy(() => import('@/pages/admin/shipment-detail'));
const AdminCarriers      = lazy(() => import('@/pages/admin/carriers'));
const AdminCustomers     = lazy(() => import('@/pages/admin/customers'));
const AdminPricing       = lazy(() => import('@/pages/admin/pricing'));
const AdminCorporate     = lazy(() => import('@/pages/admin/corporate'));
const AdminInvoices      = lazy(() => import('@/pages/admin/invoices'));
const AdminFinance       = lazy(() => import('@/pages/admin/finance'));
const AdminNotifications = lazy(() => import('@/pages/admin/notifications'));
const AdminEmailMarketing = lazy(() => import('@/pages/admin/email-marketing'));
const AdminSeo           = lazy(() => import('@/pages/admin/seo'));
const AdminBlog          = lazy(() => import('@/pages/admin/blog'));
const AdminContacts      = lazy(() => import('@/pages/admin/contacts'));

// Blog & Public
const BlogIndex    = lazy(() => import('@/pages/blog/index'));
const BlogArticle  = lazy(() => import('@/pages/blog/article'));
const LP           = lazy(() => import('@/pages/lp'));
const DriverPortal = lazy(() => import('@/pages/driver-portal'));
const MasterCard   = lazy(() => import('@/pages/master-card'));

// ── QueryClient with sensible cache times ─────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30秒間はキャッシュを使いまわす（再フェッチしない）
      gcTime: 5 * 60_000,     // 5分間はメモリ保持
      retry: 1,
      refetchOnWindowFocus: false, // タブ切替のたびにフェッチしない
    },
  },
});

// ── Suspense fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Auth */}
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />

        {/* Admin */}
        <Route path="/admin">
          <AdminLayout><Dashboard /></AdminLayout>
        </Route>
        <Route path="/admin/shipments">
          <AdminLayout><AdminShipments /></AdminLayout>
        </Route>
        <Route path="/admin/shipments/:id">
          <AdminLayout><AdminShipmentDetail /></AdminLayout>
        </Route>
        <Route path="/admin/carriers">
          <AdminLayout><AdminCarriers /></AdminLayout>
        </Route>
        <Route path="/admin/customers">
          <AdminLayout><AdminCustomers /></AdminLayout>
        </Route>
        <Route path="/admin/pricing">
          <AdminLayout><AdminPricing /></AdminLayout>
        </Route>
        <Route path="/admin/corporate">
          <AdminLayout><AdminCorporate /></AdminLayout>
        </Route>
        <Route path="/admin/invoices">
          <AdminLayout><AdminInvoices /></AdminLayout>
        </Route>
        <Route path="/admin/finance">
          <AdminLayout><AdminFinance /></AdminLayout>
        </Route>
        <Route path="/admin/notifications">
          <AdminLayout><AdminNotifications /></AdminLayout>
        </Route>
        <Route path="/admin/email-marketing">
          <AdminLayout><AdminEmailMarketing /></AdminLayout>
        </Route>
        <Route path="/admin/seo">
          <AdminLayout><AdminSeo /></AdminLayout>
        </Route>
        <Route path="/admin/blog">
          <AdminLayout><AdminBlog /></AdminLayout>
        </Route>
        <Route path="/admin/contacts">
          <AdminLayout><AdminContacts /></AdminLayout>
        </Route>

        {/* User */}
        <Route path="/">
          <UserLayout><Home /></UserLayout>
        </Route>
        <Route path="/chat/:id">
          <UserLayout><Chat /></UserLayout>
        </Route>
        <Route path="/proposal/:id">
          <UserLayout><Proposal /></UserLayout>
        </Route>
        <Route path="/shipment/:id">
          <UserLayout><Shipment /></UserLayout>
        </Route>
        <Route path="/payment/:id">
          <UserLayout><Payment /></UserLayout>
        </Route>
        <Route path="/history">
          <UserLayout><History /></UserLayout>
        </Route>
        <Route path="/settings">
          <UserLayout><Settings /></UserLayout>
        </Route>
        <Route path="/contact">
          <UserLayout><Contact /></UserLayout>
        </Route>
        <Route path="/corporate-apply">
          <UserLayout><CorporateApply /></UserLayout>
        </Route>
        <Route path="/invoices">
          <UserLayout><Invoices /></UserLayout>
        </Route>
        <Route path="/invoices/:id">
          <UserLayout><InvoiceDetail /></UserLayout>
        </Route>

        {/* 公開：マスターカード */}
        <Route path="/master-card/:token" component={MasterCard} />

        {/* Blog — no auth, no layout */}
        <Route path="/blog/:slug" component={BlogArticle} />
        <Route path="/blog" component={BlogIndex} />

        {/* LP — no auth, no layout */}
        <Route path="/lp" component={LP} />

        {/* Driver portal — no auth, no layout */}
        <Route path="/driver/:token" component={DriverPortal} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
