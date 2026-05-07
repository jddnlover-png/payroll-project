import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

import Landing from "./pages/Landing";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import PayslipView from "./pages/PayslipView";
import AccountSettings from "./pages/AccountSettings";
import Expired from "./pages/Expired";

import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Routes>
      {/* 일반 페이지 */}
      <Route path="/landing" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/admin-login" element={<AdminLogin />} />

      {/* ✅ 핵심: Admin은 ProtectedRoute 제거 */}
            <Route path="/admin" element={<Admin />} />

      <Route
  path="/onboarding" element={<Onboarding />} />

<Route path="/expired" element={<Expired />} />

{/* 일반 유저 보호 라우트 */}
<Route
  path="/"
  element={
    <ProtectedRoute>
      <Index />
    </ProtectedRoute>
  }
/>

      <Route
  path="/settings"
  element={
    <ProtectedRoute>
      <AccountSettings />
    </ProtectedRoute>
  }
/>

<Route path="/payslip" element={<PayslipView />} />
<Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <OrganizationProvider>
            <AppRoutes />
          </OrganizationProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;