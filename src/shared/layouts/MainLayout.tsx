import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/Header';
import { BottomNav } from '@/shared/components/BottomNav';
import { Sidebar } from '@/shared/components/Sidebar';
import { MobileNavDrawer } from '@/shared/components/MobileNavDrawer';
import { AddAccountModal } from '@/shared/components/AddAccountModal';
import { Toast } from '@/shared/components/Toast';
import { OfflineIndicator } from '@/shared/components/OfflineIndicator';

const QuickAddTransactionModal = React.lazy(() => import('@/shared/components/QuickAddTransactionModal').then(m => ({ default: m.QuickAddTransactionModal })));
const SendMessageModal = React.lazy(() => import('@/features/messaging/components/SendMessageModal').then(m => ({ default: m.SendMessageModal })));
const ScheduleCollectionModal = React.lazy(() => import('@/features/messaging/components/ScheduleCollectionModal').then(m => ({ default: m.ScheduleCollectionModal })));
const OCRReceiptScannerModal = React.lazy(() => import('@/features/ocr/components/OCRReceiptScannerModal').then(m => ({ default: m.OCRReceiptScannerModal })));
const SmartReceiptReviewModal = React.lazy(() => import('@/features/ocr/components/SmartReceiptReviewModal').then(m => ({ default: m.SmartReceiptReviewModal })));
const ReceiptToTransactionModal = React.lazy(() => import('@/features/ocr/components/ReceiptToTransactionModal').then(m => ({ default: m.ReceiptToTransactionModal })));

import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useAccountStore } from '@/shared/stores/accountStore';
import { useTransactionStore } from '@/shared/stores/transactionStore';
import { useOCRStore } from '@/shared/stores/ocrStore';

export const MainLayout: React.FC = () => {
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
  const fetchRecentTransactions = useTransactionStore((state) => state.fetchRecentTransactions);

  const isConversionModalOpen = useOCRStore((state) => state.isConversionModalOpen);
  const closeConversionModal = useOCRStore((state) => state.closeConversionModal);
  const draftToConvert = useOCRStore((state) => state.draftToConvert);

  useEffect(() => {
    // Initial data hydration
    loadSettings();
    fetchAccounts();
    fetchRecentTransactions(10);
  }, [loadSettings, fetchAccounts, fetchRecentTransactions]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-row overflow-x-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Content wrapper */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen pb-20 md:pb-8">
        <Header />

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <Outlet />
        </main>

        {/* Floating Global Components */}
        <MobileNavDrawer />
        <BottomNav />
        <AddAccountModal />
        <React.Suspense fallback={null}>
          <QuickAddTransactionModal />
          <SendMessageModal />
          <ScheduleCollectionModal />
          <OCRReceiptScannerModal />
          <SmartReceiptReviewModal />
          <ReceiptToTransactionModal
            isOpen={isConversionModalOpen}
            onClose={closeConversionModal}
            draft={draftToConvert}
          />
        </React.Suspense>
        <Toast />
        <OfflineIndicator />
      </div>
    </div>
  );
};

