import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AuthProvider } from "@/components/providers/AuthProvider";

const Login = lazy(() => import("@/pages/Login").then((module) => ({ default: module.Login })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then((module) => ({ default: module.ResetPassword })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const Equipamentos = lazy(() => import("@/pages/Equipamentos").then((module) => ({ default: module.Equipamentos })));
const Emails = lazy(() => import("@/pages/Emails").then((module) => ({ default: module.Emails })));
const Usuarios = lazy(() => import("@/pages/Usuarios").then((module) => ({ default: module.Usuarios })));
const CRM = lazy(() => import("@/pages/CRM").then((module) => ({ default: module.CRM })));
const Relatorios = lazy(() => import("@/pages/Relatorios").then((module) => ({ default: module.Relatorios })));
const Logs = lazy(() => import("@/pages/Logs").then((module) => ({ default: module.Logs })));

function withSuspense(element: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-appBg">
          <div className="rounded-full border border-black/8 bg-white/80 px-6 py-4 shadow-panel">Carregando...</div>
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={withSuspense(<Login />)} />
          <Route path="/redefinir-senha" element={withSuspense(<ResetPassword />)} />
          <Route element={<ProtectedRoute allowedRoles={["admin", "gestor", "lider", "usuario"]} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/equipamentos" element={withSuspense(<Equipamentos />)} />
        </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "gestor", "lider"]} />}>
            <Route path="/dashboard" element={withSuspense(<Dashboard />)} />
            <Route path="/emails" element={withSuspense(<Emails />)} />
            <Route path="/relatorios" element={withSuspense(<Relatorios />)} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "gestor"]} />}>
            <Route path="/usuarios" element={withSuspense(<Usuarios />)} />
            <Route path="/logs" element={withSuspense(<Logs />)} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "gestor", "lider"]} />}>
            <Route path="/crm" element={withSuspense(<CRM />)} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}
