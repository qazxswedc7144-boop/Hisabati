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
} from '@/features';
import { seedInitialMockData } from '@/shared/data/mockData';
import { useSettingsStore } from '@/shared/stores';

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const theme = useSettingsStore((state) => state.settings.theme);

  useEffect(() => {
    // Apply theme class to document element
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [theme]);

  useEffect(() => {
    async function initApp() {
      try {
        await seedInitialMockData(false);
      } catch (e) {
        console.error('Failed initializing mock seed:', e);
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
          <Route path="/messaging" element={<MessagingPage />} />
          <Route path="/ai" element={<AIAssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

