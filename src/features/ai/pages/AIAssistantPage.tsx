import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Bot,
  User,
  Trash2,
  HelpCircle,
  Clock,
  ShieldCheck,
  WifiOff,
  CornerDownLeft,
} from 'lucide-react';
import { AIChatMessage, StructuredAICommand } from '@/shared/types/ai.types';
import { aiService, voiceInputService } from '@/core/services/ai';
import { AICardRenderer } from '../components/AICardRenderer';
import { useUIStore } from '@/shared/stores';
import { useNavigate } from 'react-router-dom';

export const AIAssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const showToast = useUIStore((state) => state.showToast);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome_msg',
      sender: 'assistant',
      text: 'مرحباً بك! أنا مساعدك المالي الذكي في "حساباتي".\nيمكنك سؤالي عن ديونك ومستحقاتك، أو طلب تسجيل معاملات مباشرة، مثل: "كم لي عند الناس؟" أو "سجل على أحمد 5000 ريال".',
      timestamp: new Date().toISOString(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || inputPrompt).trim();
    if (!promptToSend || isLoading) return;

    setInputPrompt('');

    // Add user message
    const userMsg: AIChatMessage = {
      id: 'user_' + Date.now(),
      sender: 'user',
      text: promptToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await aiService.ask(promptToSend);

      const botMsg: AIChatMessage = {
        id: 'bot_' + Date.now(),
        sender: 'assistant',
        text: response.text,
        intent: response.intent,
        mode: response.mode,
        confidence: response.confidence,
        card: response.card,
        isOffline: response.isOfflineFallback,
        provider: response.provider,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: AIChatMessage = {
        id: 'bot_err_' + Date.now(),
        sender: 'assistant',
        text: err?.message || 'عذراً، حدث خطأ أثناء معالجة طلبك.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleToggleVoice = () => {
    if (isListening) {
      voiceInputService.stopListening();
      setIsListening(false);
      return;
    }

    if (!voiceInputService.isSupported()) {
      showToast('الإدخال الصوتي غير مدعوم على هذا المتصفح أو الجهاز', 'info');
      return;
    }

    setIsListening(true);
    voiceInputService.startListening(
      (result) => {
        setInputPrompt(result.transcript);
        if (result.isFinal && result.transcript.trim()) {
          setIsListening(false);
          handleSendMessage(result.transcript);
        }
      },
      (err) => {
        setIsListening(false);
        showToast(err, 'error');
      },
      () => {
        setIsListening(false);
      }
    );
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome_reset',
        sender: 'assistant',
        text: 'تم بدء محادثة جديدة. كيف يمكنني مساعدتك مالياً اليوم؟',
        timestamp: new Date().toISOString(),
      },
    ]);
    showToast('تم مسح المحادثة', 'info');
  };

  const quickPills = [
    'كم لي؟',
    'كم علي؟',
    'أعلى المدينين',
    'ملخص الشهر',
    'آخر العمليات',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto px-3 sm:px-4 py-2 space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between py-2 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>المساعد المالي الذكي</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                Phase 6
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>مبني على قواعد التحقق المالي الصارمة ومحرك المعاملات المحلي</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="مسح سجل المحادثة"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Prompts Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 no-scrollbar">
        <span className="text-[11px] font-bold text-slate-400 shrink-0 ml-1">اقتراحات سريعة:</span>
        {quickPills.map((pill) => (
          <button
            key={pill}
            onClick={() => handleSendMessage(pill)}
            disabled={isLoading}
            className="text-xs px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition whitespace-nowrap min-h-[34px]"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pl-1">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-slate-800 dark:bg-slate-700 text-white'
                    : 'bg-teal-600 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[85%] sm:max-w-[75%] space-y-1`}>
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-slate-800 dark:bg-slate-800 text-white rounded-tr-none'
                      : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-tl-none shadow-xs'
                  }`}
                >
                  {msg.text}

                  {/* Render Embedded Financial Card if Present */}
                  {msg.card && (
                    <AICardRenderer
                      card={msg.card}
                      onNavigateToAccount={(accId) => navigate(`/accounts/${accId}`)}
                      onSelectAccount={(name) => handleSendMessage(`سجل على ${name}`)}
                      onCommandExecuted={(cmd) => {
                        // Refresh or update state
                      }}
                    />
                  )}
                </div>

                <div
                  className={`flex items-center gap-2 text-[10px] text-slate-400 px-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{new Date(msg.timestamp).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.isOffline && (
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                      <WifiOff className="w-2.5 h-2.5" />
                      <span>معالجة محلية</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 animate-pulse" />
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 shadow-xs">
              <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" />
              <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-teal-500 animate-bounce [animation-delay:0.4s]" />
              <span className="mr-1">جاري التحليل واستعلام البيانات المالية...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="shrink-0 pt-2 border-t border-slate-200/80 dark:border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder={isListening ? 'جاري الاستماع لصوتك الآن...' : 'اسألني: كم لي؟ أو سجل على أحمد 5000...'}
              className={`w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none transition min-h-[48px] ${
                isListening
                  ? 'border-rose-500 ring-2 ring-rose-200 dark:ring-rose-950'
                  : 'border-slate-200 dark:border-slate-800 focus:border-teal-500'
              }`}
            />
          </div>

          {/* Microphone Voice Button */}
          <button
            type="button"
            onClick={handleToggleVoice}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition shrink-0 ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
            title={isListening ? 'إيقاف التسجيل' : 'إدخال صوتي'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputPrompt.trim() || isLoading}
            className="w-12 h-12 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:hover:bg-teal-600 text-white flex items-center justify-center transition shrink-0 shadow-xs"
            title="إرسال"
          >
            <Send className="w-5 h-5 rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
