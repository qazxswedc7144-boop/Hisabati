import React, { useState } from 'react';
import { Download, X, Smartphone, CheckCircle, Share2, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '@/shared/hooks/usePWAInstall';
import { useI18n } from '@/shared/hooks/useI18n';

interface PWAInstallPromptProps {
  variant?: 'banner' | 'button' | 'compact';
  id?: string;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  variant = 'button',
  id = 'pwa-install-component',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { t } = useI18n();

  if (isInstalled || isDismissed) {
    return null;
  }

  // If not installable and not iOS, don't show
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      install();
    }
  };

  if (variant === 'button') {
    return (
      <>
        <button
          id={`${id}-button`}
          onClick={handleInstallClick}
          aria-label={t('common.installPWA')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-teal-700/20 active:scale-[0.98] transition-all min-h-[40px]"
        >
          <Download className="w-4 h-4" />
          <span>{t('common.install')}</span>
        </button>

        {showIOSGuide && (
          <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
        )}
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <button
          id={`${id}-compact`}
          onClick={handleInstallClick}
          className="p-2 rounded-xl text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 transition min-w-[40px] min-h-[40px] flex items-center justify-center"
          title={t('common.installPWA')}
          aria-label={t('common.installPWA')}
        >
          <Download className="w-5 h-5" />
        </button>

        {showIOSGuide && (
          <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
        )}
      </>
    );
  }

  // Banner variant
  return (
    <>
      <div
        id={`${id}-banner`}
        className="mx-4 my-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-teal-900 to-emerald-900 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-teal-300" />
          </div>
          <div>
            <h4 className="text-sm font-bold">{t('common.installPWA')}</h4>
            <p className="text-xs text-teal-200/90">{t('common.installPWADesc')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsDismissed(true)}
            className="px-3 py-1.5 rounded-lg text-xs text-teal-200 hover:text-white hover:bg-white/10 transition"
          >
            {t('common.dismiss')}
          </button>
          <button
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {t('common.install')}
          </button>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-2 start-2 p-1 text-teal-300/70 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {showIOSGuide && (
        <IOSInstallModal onClose={() => setShowIOSGuide(false)} />
      )}
    </>
  );
};

const IOSInstallModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div
      id="ios-install-guide-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal-600" />
            التثبيت على iPhone / iPad
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-teal-600 shrink-0 mt-0.5">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">1. اضغط على زر المشاركة</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">في شريط متصفح سفاري بالأسفل أو بالأعلى</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-teal-600 shrink-0 mt-0.5">
              <PlusSquare className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">2. اختر "إضافة إلى الشاشة الرئيسية"</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add to Home Screen من القائمة</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-emerald-600 shrink-0 mt-0.5">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">3. اضغط "إضافة" (Add)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">سيعمل التطبيق بدون متصفح ويدعم وضع عدم الاتصال</p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition shadow-sm"
        >
          فهمت ذلك
        </button>
      </div>
    </div>
  );
};
