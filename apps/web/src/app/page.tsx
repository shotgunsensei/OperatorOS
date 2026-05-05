'use client';

import { useState } from 'react';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import SaasLayout from '@/components/SaasLayout';
import LoginPage from '@/components/pages/LoginPage';
import RegisterPage from '@/components/pages/RegisterPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import SuspendedPage from '@/components/pages/SuspendedPage';
import UnauthorizedPage from '@/components/pages/UnauthorizedPage';
import DashboardPage from '@/components/pages/DashboardPage';
import ProjectsPage from '@/components/pages/ProjectsPage';
import TasksPage from '@/components/pages/TasksPage';
import NotesPage from '@/components/pages/NotesPage';
import ActivityPage from '@/components/pages/ActivityPage';
import AiToolsPage from '@/components/pages/AiToolsPage';
import WorkspacesPage from '@/components/pages/WorkspacesPage';
import BillingPage from '@/components/pages/BillingPage';
import SettingsPage from '@/components/pages/SettingsPage';
import AdminPage from '@/components/pages/AdminPage';
import AppsPage from '@/components/pages/AppsPage';

function AppContent() {
  const { user, loading, authError, logout, clearAuthError } = useAuth();
  const [authPage, setAuthPage] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>('login');
  const [activePage, setActivePage] = useState('dashboard');
  const [taskProject, setTaskProject] = useState<{ id: string; name: string } | null>(null);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#010409', color: '#8b949e',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
          }}>O</div>
          <div style={{ fontSize: 14 }}>Loading OperatorOS...</div>
        </div>
      </div>
    );
  }

  if (authError?.code === 'ACCOUNT_SUSPENDED') {
    return <SuspendedPage onLogout={async () => { clearAuthError(); await logout(); }} message={authError.message} />;
  }

  if (!user) {
    const handleSwitch = (page: string) => setAuthPage(page as any);
    if (authPage === 'register') return <RegisterPage onSwitch={handleSwitch} />;
    if (authPage === 'forgot-password') return <ForgotPasswordPage onSwitch={handleSwitch} />;
    if (authPage === 'reset-password') return <ResetPasswordPage onSwitch={handleSwitch} />;
    return <LoginPage onSwitch={handleSwitch} />;
  }

  const handleNavigate = (page: string) => {
    setActivePage(page);
    if (page !== 'tasks') setTaskProject(null);
  };

  const handleNavigateToTasks = (projectId: string, projectName: string) => {
    setTaskProject({ id: projectId, name: projectName });
    setActivePage('tasks');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <DashboardPage />;
      case 'projects': return <ProjectsPage onNavigateToTasks={handleNavigateToTasks} />;
      case 'tasks': return (
        <TasksPage
          projectId={taskProject?.id}
          projectName={taskProject?.name}
          onBack={() => setActivePage('projects')}
        />
      );
      case 'notes': return <NotesPage />;
      case 'activity': return <ActivityPage />;
      case 'ai-tools': return <AiToolsPage />;
      case 'workspace': return <WorkspacesPage />;
      case 'apps': return <AppsPage onNavigate={setActivePage} />;
      case 'billing': return <BillingPage />;
      case 'settings': return <SettingsPage />;
      case 'admin':
        return user.role === 'admin'
          ? <AdminPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('dashboard')} message="Only administrators can access this page." />;
      default: return <DashboardPage />;
    }
  };

  return (
    <SaasLayout activePage={activePage} onNavigate={handleNavigate}>
      {renderPage()}
    </SaasLayout>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
