import React, { useState } from 'react';
import { 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  BookOpen, 
  MessageSquare, 
  Mail,
  ShieldCheck,
  Globe
} from 'lucide-react';

export const HelpSupportSection: React.FC = () => {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: 'كيف تعمل المزامنة في حال انقطاع الإنترنت؟',
      a: 'يعمل التطبيق بشكل كامل وبأعلى كفاءة في وضع عدم الاتصال (Offline-First). تسجل جميع المعاملات في طابور المزامنة المحلي وتنتقل تلقائياً إلى السحابة فور عودة الاتصال دون أي تدخل منك.',
    },
    {
      q: 'كيف يتعامل النظام مع تعارض التعديل من جهازين مختلفين؟',
      a: 'عند تعديل نفس الحساب أو المعاملة على جهازين دون اتصال، يرصد محرك المزامنة التعارض تلقائياً ويقوم بعزله في مركز التحكم ليمنحك خيار اعتماد النسخة المحلية أو نسخة السحابة بأمان محاسبي تام.',
    },
    {
      q: 'هل يمكنني استعادة بياناتي إذا قمت بتغيير هاتفي؟',
      a: 'نعم، بكل سهولة. يمكنك ربط حساب Google Drive في الهاتف الجديد واستعادة أحدث نسخة احتياطية بضغطة زر واحدة، أو تصدير ملف JSON مشفر من الهاتف القديم واستيراده مباشرة.',
    },
    {
      q: 'هل تطلع شركة جوجل أو أي جهة أخرى على مبالغي المالية؟',
      a: 'مطلقاً. المزامنة تتم مع مساحتك الشخصية المعزولة في Google Drive. البيانات مشفرة ولا يمكن لأي خادم وسيط أو حتى شركة جوجل قراءة محتويات ملفاتك المالية التابعة للتطبيق.',
    },
  ];

  return (
    <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-teal-600" />
            <span>المساعدة والدعم ومعلومات الإصدار</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إرشادات الاستخدام والأسئلة الأكثر شيوعاً
          </p>
        </div>
        <span className="text-[10px] font-bold font-mono px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
          v1.0.0 (Stable)
        </span>
      </div>

      {/* FAQ list */}
      <div className="space-y-2">
        {faqs.map((item, idx) => (
          <div
            key={idx}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 overflow-hidden transition-all duration-200"
          >
            <button
              type="button"
              onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
              className="w-full p-4 flex items-center justify-between text-start text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition min-h-[48px]"
            >
              <span className="leading-tight">{item.q}</span>
              <span className="text-slate-400 shrink-0 ms-4">
                {expandedFaq === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {expandedFaq === idx && (
              <div className="p-4 pt-0 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-1 duration-200">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Support Channels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a 
          href="#" 
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">دليل الاستخدام الشامل</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">فيديوهات وشروحات تعليمية</span>
          </div>
        </a>

        <a 
          href="mailto:support@hisabati.app" 
          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">الدعم الفني المباشر</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">تواصل معنا عبر البريد الإلكتروني</span>
          </div>
        </a>
      </div>

      {/* Footer Info */}
      <div className="pt-2 text-center space-y-2">
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> مشفر محلياً</span>
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> يعمل بدون إنترنت</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> دعم عربي</span>
        </div>
        <p className="text-[9px] text-slate-300 dark:text-slate-600 uppercase tracking-widest font-bold">
          Made with excellence for financial integrity
        </p>
      </div>
    </section>
  );
};
