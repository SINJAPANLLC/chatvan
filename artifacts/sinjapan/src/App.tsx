import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';

setAuthTokenGetter(() => localStorage.getItem('sinjapan_auth_token'));

import { UserLayout } from '@/components/layout/UserLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';

// User Pages
const Home          = lazy(() => import('@/pages/home'));
const VanChat       = lazy(() => import('@/pages/van-chat'));
const VanProposal   = lazy(() => import('@/pages/van-proposal'));
const MyPage        = lazy(() => import('@/pages/mypage'));
const Settings      = lazy(() => import('@/pages/settings'));
const Login         = lazy(() => import('@/pages/login'));
const Register      = lazy(() => import('@/pages/register'));
const Contact       = lazy(() => import('@/pages/contact'));

// Admin Pages
const AdminDashboard        = lazy(() => import('@/pages/admin/dashboard'));
const AdminApplications     = lazy(() => import('@/pages/admin/applications'));
const AdminApplicationDetail= lazy(() => import('@/pages/admin/application-detail'));
const AdminVehicles         = lazy(() => import('@/pages/admin/vehicles'));
const AdminRentalCompanies  = lazy(() => import('@/pages/admin/rental-companies'));
const AdminContracts        = lazy(() => import('@/pages/admin/contracts'));
const AdminCustomers        = lazy(() => import('@/pages/admin/customers'));
const AdminNotifications    = lazy(() => import('@/pages/admin/notifications'));
const AdminInvoices         = lazy(() => import('@/pages/admin/invoices'));
const AdminFinance          = lazy(() => import('@/pages/admin/finance'));
const AdminPricing          = lazy(() => import('@/pages/admin/pricing'));
const AdminEmailMarketing   = lazy(() => import('@/pages/admin/email-marketing'));
const AdminBlog             = lazy(() => import('@/pages/admin/blog'));
const AdminSeo              = lazy(() => import('@/pages/admin/seo'));
const AdminContacts         = lazy(() => import('@/pages/admin/contacts'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />

        {/* Admin Routes */}
        <Route path="/admin">
          <AdminLayout><AdminDashboard /></AdminLayout>
        </Route>
        <Route path="/admin/applications">
          <AdminLayout><AdminApplications /></AdminLayout>
        </Route>
        <Route path="/admin/applications/:id">
          <AdminLayout><AdminApplicationDetail /></AdminLayout>
        </Route>
        <Route path="/admin/vehicles">
          <AdminLayout><AdminVehicles /></AdminLayout>
        </Route>
        <Route path="/admin/rental-companies">
          <AdminLayout><AdminRentalCompanies /></AdminLayout>
        </Route>
        <Route path="/admin/contracts">
          <AdminLayout><AdminContracts /></AdminLayout>
        </Route>
        <Route path="/admin/customers">
          <AdminLayout><AdminCustomers /></AdminLayout>
        </Route>
        <Route path="/admin/notifications">
          <AdminLayout><AdminNotifications /></AdminLayout>
        </Route>
        <Route path="/admin/invoices">
          <AdminLayout><AdminInvoices /></AdminLayout>
        </Route>
        <Route path="/admin/finance">
          <AdminLayout><AdminFinance /></AdminLayout>
        </Route>
        <Route path="/admin/pricing">
          <AdminLayout><AdminPricing /></AdminLayout>
        </Route>
        <Route path="/admin/email-marketing">
          <AdminLayout><AdminEmailMarketing /></AdminLayout>
        </Route>
        <Route path="/admin/blog">
          <AdminLayout><AdminBlog /></AdminLayout>
        </Route>
        <Route path="/admin/seo">
          <AdminLayout><AdminSeo /></AdminLayout>
        </Route>
        <Route path="/admin/contacts">
          <AdminLayout><AdminContacts /></AdminLayout>
        </Route>

        {/* User Routes */}
        <Route path="/">
          <UserLayout><Home /></UserLayout>
        </Route>
        <Route path="/van/:id">
          <UserLayout><VanChat /></UserLayout>
        </Route>
        <Route path="/van/:id/proposal">
          <UserLayout><VanProposal /></UserLayout>
        </Route>
        <Route path="/mypage">
          <UserLayout><MyPage /></UserLayout>
        </Route>
        <Route path="/settings">
          <UserLayout><Settings /></UserLayout>
        </Route>
        <Route path="/contact">
          <UserLayout><Contact /></UserLayout>
        </Route>

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