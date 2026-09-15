import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/Header';
import { BottomNav } from '@/shared/components/BottomNav';
import { Sidebar } from '@/shared/components/Sidebar';
import { MobileNavDrawer } from '@/shared/components/MobileNavDrawer';
import { QuickAddTransactionModal } from '@/shared/components/QuickAddTransactionModal';
import { AddAccountModal } from '@/shared/components/AddAccountModal';
import { Toast } from '@/shared/components/Toast';
import { OfflineIndicator } from '@/shared/components/OfflineIndicator';
import { SendMessageModal } from '@/features/messaging/components/SendMessageModal';
import { ScheduleCollectionModal } from '@/features/messaging/components/ScheduleCollectionModal';
import { OCRReceiptScannerModal, SmartReceiptReviewModal, ReceiptToTransactionModal } from '@/features/ocr';
import { useSettingsStore, useAccountStore, useTransactionStore, useOCRStore } from '@/shared/stores';

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
        <QuickAddTransactionModal />
        <AddAccountModal />
        <SendMessageModal />
        <ScheduleCollectionModal />
        <OCRReceiptScannerModal />
        <SmartReceiptReviewModal />
        <ReceiptToTransactionModal
          isOpen={isConversionModalOpen}
          onClose={closeConversionModal}
          draft={draftToConvert}
        />
        <Toast />
        <OfflineIndicator />
      </div>
    </div>
  );
};

