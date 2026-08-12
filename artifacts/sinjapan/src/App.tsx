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
import { CompanyLayout } from '@/components/layout/CompanyLayout';

// User Pages
const Home          = lazy(() => import('@/pages/home'));
const VanChat       = lazy(() => import('@/pages/van-chat'));
const VanProposal   = lazy(() => import('@/pages/van-proposal'));
const VanStatus     = lazy(() => import('@/pages/van-status'));
const VanContract   = lazy(() => import('@/pages/van-contract'));
const VanPayment    = lazy(() => import('@/pages/van-payment'));
const VanPickup     = lazy(() => import('@/pages/van-pickup'));
const VanHistory    = lazy(() => import('@/pages/van-history'));
const MyPage        = lazy(() => import('@/pages/mypage'));
const Settings      = lazy(() => import('@/pages/settings'));
const Login          = lazy(() => import('@/pages/login'));
const ForgotPassword = lazy(() => import('@/pages/forgot-password'));
const Register      = lazy(() => import('@/pages/register'));
const Contact       = lazy(() => import('@/pages/contact'));
const BreakdownPage = lazy(() => import('@/pages/breakdown'));
const IdentityVerification = lazy(() => import('@/pages/identity-verification'));

// Admin Pages
const AdminDashboard        = lazy(() => import('@/pages/admin/dashboard'));
const AdminApplications     = lazy(() => import('@/pages/admin/applications'));
const AdminApplicationDetail= lazy(() => import('@/pages/admin/application-detail'));
const AdminVehicles         = lazy(() => import('@/pages/admin/vehicles'));
const AdminRentalCompanies  = lazy(() => import('@/pages/admin/rental-companies'));
const AdminContracts        = lazy(() => import('@/pages/admin/contracts'));
const AdminCustomers        = lazy(() => import('@/pages/admin/customers'));
const AdminNotifications    = lazy(() => import('@/pages/admin/notifications'));
const AdminPricing          = lazy(() => import('@/pages/admin/pricing'));
// 契約チャット
const ContractChat = lazy(() => import('@/pages/contract-chat'));

// 協力会社ポータル
const CompanyDashboard   = lazy(() => import('@/pages/company/dashboard'));
const CompanyVehicles    = lazy(() => import('@/pages/company/vehicles'));
const CompanyContracts   = lazy(() => import('@/pages/company/contracts'));
const CompanyInsurance   = lazy(() => import('@/pages/company/insurance'));
const CompanyGps         = lazy(() => import('@/pages/company/gps'));
const CompanyContact     = lazy(() => import('@/pages/company/contact'));
const CompanySettlements = lazy(() => import('@/pages/company/settlements'));
const CompanyRegister    = lazy(() => import('@/pages/company/register'));

// Chat VAN 固有管理画面
const AdminInsurance        = lazy(() => import('@/pages/admin/insurance'));
const AdminGps              = lazy(() => import('@/pages/admin/gps'));
const AdminIncidents        = lazy(() => import('@/pages/admin/incidents'));
const AdminRecovery         = lazy(() => import('@/pages/admin/recovery'));
const AdminPayments         = lazy(() => import('@/pages/admin/payments-van'));
const AdminScreening        = lazy(() => import('@/pages/admin/screening'));
const AdminCorporate        = lazy(() => import('@/pages/admin/corporate'));
const AdminInvoices         = lazy(() => import('@/pages/admin/invoices'));
const AdminAuditLogs        = lazy(() => import('@/pages/admin/audit-logs'));
const AdminUserLogs         = lazy(() => import('@/pages/admin/user-logs'));
const AdminCompanyVehicles  = lazy(() => import('@/pages/admin/company-vehicles'));
const AdminFinance          = lazy(() => import('@/pages/admin/finance'));
const AdminBlog             = lazy(() => import('@/pages/admin/blog'));
const AdminEmailMarketing   = lazy(() => import('@/pages/admin/email-marketing'));
const AdminSeo              = lazy(() => import('@/pages/admin/seo'));
const AdminContacts         = lazy(() => import('@/pages/admin/contacts'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
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
        <Route path="/forgot-password" component={ForgotPassword} />
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
        <Route path="/admin/pricing">
          <AdminLayout><AdminPricing /></AdminLayout>
        </Route>
        {/* Chat VAN 固有 */}
        <Route path="/admin/insurance">
          <AdminLayout><AdminInsurance /></AdminLayout>
        </Route>
        <Route path="/admin/gps">
          <AdminLayout><AdminGps /></AdminLayout>
        </Route>
        <Route path="/admin/incidents">
          <AdminLayout><AdminIncidents /></AdminLayout>
        </Route>
        <Route path="/admin/recovery">
          <AdminLayout><AdminRecovery /></AdminLayout>
        </Route>
        <Route path="/admin/payments">
          <AdminLayout><AdminPayments /></AdminLayout>
        </Route>
        <Route path="/admin/invoices">
          <AdminLayout><AdminInvoices /></AdminLayout>
        </Route>
        <Route path="/admin/screening">
          <AdminLayout><AdminScreening /></AdminLayout>
        </Route>
        <Route path="/admin/corporate">
          <AdminLayout><AdminCorporate /></AdminLayout>
        </Route>
        <Route path="/admin/audit-logs">
          <AdminLayout><AdminAuditLogs /></AdminLayout>
        </Route>
        <Route path="/admin/user-logs">
          <AdminLayout><AdminUserLogs /></AdminLayout>
        </Route>
        <Route path="/admin/company-vehicles">
          <AdminLayout><AdminCompanyVehicles /></AdminLayout>
        </Route>
        <Route path="/admin/finance">
          <AdminLayout><AdminFinance /></AdminLayout>
        </Route>
        <Route path="/admin/blog">
          <AdminLayout><AdminBlog /></AdminLayout>
        </Route>
        <Route path="/admin/email-marketing">
          <AdminLayout><AdminEmailMarketing /></AdminLayout>
        </Route>
        <Route path="/admin/seo">
          <AdminLayout><AdminSeo /></AdminLayout>
        </Route>
        <Route path="/admin/contacts">
          <AdminLayout><AdminContacts /></AdminLayout>
        </Route>

        {/* 契約チャット（ユーザー・協力会社・Admin共通） */}
        <Route path="/contract-chat/:id" component={ContractChat} />

        {/* 協力会社ポータル */}
        <Route path="/company">
          <CompanyLayout><CompanyDashboard /></CompanyLayout>
        </Route>
        <Route path="/company/vehicles">
          <CompanyLayout><CompanyVehicles /></CompanyLayout>
        </Route>
        <Route path="/company/contracts">
          <CompanyLayout><CompanyContracts /></CompanyLayout>
        </Route>
        <Route path="/company/insurance">
          <CompanyLayout><CompanyInsurance /></CompanyLayout>
        </Route>
        <Route path="/company/gps">
          <CompanyLayout><CompanyGps /></CompanyLayout>
        </Route>
        <Route path="/company/contact">
          <CompanyLayout><CompanyContact /></CompanyLayout>
        </Route>
        <Route path="/company/settlements">
          <CompanyLayout><CompanySettlements /></CompanyLayout>
        </Route>
        <Route path="/company/register" component={CompanyRegister} />

        {/* User Routes */}
        <Route path="/">
          <UserLayout><Home /></UserLayout>
        </Route>
        <Route path="/van/history">
          <UserLayout><VanHistory /></UserLayout>
        </Route>
        <Route path="/van/:id/proposal">
          <UserLayout><VanProposal /></UserLayout>
        </Route>
        <Route path="/van/:id/status">
          <UserLayout><VanStatus /></UserLayout>
        </Route>
        <Route path="/van/:id/contract">
          <UserLayout><VanContract /></UserLayout>
        </Route>
        <Route path="/van/:id/payment">
          <UserLayout><VanPayment /></UserLayout>
        </Route>
        <Route path="/van/:id/pickup">
          <UserLayout><VanPickup /></UserLayout>
        </Route>
        <Route path="/van/:id">
          <UserLayout><VanChat /></UserLayout>
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
        <Route path="/breakdown">
          <UserLayout><BreakdownPage /></UserLayout>
        </Route>
        <Route path="/identity-verification">
          <UserLayout><IdentityVerification /></UserLayout>
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
