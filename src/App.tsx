import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/shared/layouts/MainLayout';
import {
  DashboardPage,
  AccountsPage,
  AccountDetailsPage,
} from '@/features';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { seedInitialMockData } from '@/shared/data/mockData';
import { useSettingsStore } from '@/shared/stores';

// Lazy loaded features
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const MessagingPage = lazy(() => import('@/features/messaging/pages/MessagingPage').then(m => ({ default: m.MessagingPage })));
const AIAssistantPage = lazy(() => import('@/features/ai/pages/AIAssistantPage').then(m => ({ default: m.AIAssistantPage })));
const TeamPage = lazy(() => import('@/features/team/pages/TeamPage').then(m => ({ default: m.TeamPage })));
const FinancialHealthDashboardPage = lazy(() => import('@/features/bi/pages/FinancialHealthDashboardPage').then(m => ({ default: m.FinancialHealthDashboardPage })));

const PageLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12 animate-in fade-in duration-500 min-h-[50vh]">
    <div className="w-12 h-12 border-4 border-teal-600/10 border-t-teal-600 rounded-full animate-spin mb-4"></div>
    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 tracking-widest uppercase">جاري التحميل</p>
  </div>
);

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function initApp() {
      try {
        await seedInitialMockData(false);
        await useSettingsStore.getState().loadSettings();
      } catch (e) {
        console.error('Failed initializing app data:', e);
      } finally {
        setIsReady(true);
      }
    }
    initApp();
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-slate-200">
        <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-teal-600/30 animate-pulse mb-4">
          ح
        </div>
        <p className="text-sm font-bold">جاري تحميل دفتر الحسابات...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/accounts/:id" element={<AccountDetailsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/bi" element={<FinancialHealthDashboardPage />} />
              <Route path="/messaging" element={<MessagingPage />} />
              <Route path="/ai" element={<AIAssistantPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

