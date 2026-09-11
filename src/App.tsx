import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/shared/layouts/MainLayout';
import {
  DashboardPage,
  AccountsPage,
  AccountDetailsPage,
  ReportsPage,
  SettingsPage,
  MessagingPage,
  AIAssistantPage,
  TeamPage,
  FinancialHealthDashboardPage,
} from '@/features';
import { seedInitialMockData } from '@/shared/data/mockData';
import { useSettingsStore } from '@/shared/stores';

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
    </BrowserRouter>
  );
}

