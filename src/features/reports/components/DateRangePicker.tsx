import React from 'react';
import { Calendar, Check } from 'lucide-react';
import { DatePreset, DateRange } from '@/shared/types';
import { DATE_PRESETS } from '@/core/utils/dateRange';

interface DateRangePickerProps {
  preset: DatePreset;
  customRange: DateRange;
  onPresetChange: (preset: DatePreset) => void;
  onCustomRangeChange: (range: DateRange) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  preset,
  customRange,
  onPresetChange,
  onCustomRangeChange,
}) => {
  return (
    <div className="space-y-3">
      {/* Preset Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
        {DATE_PRESETS.map((p) => {
          const isSelected = preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPresetChange(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1 shrink-0 ${
                isSelected
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {isSelected && <Check className="w-3.5 h-3.5" />}
              {p.labelAr}
            </button>
          );
        })}
      </div>

      {/* Custom Range Inputs */}
      {preset === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 animate-in fade-in">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              من تاريخ (بداية الفترة)
            </label>
            <div className="relative">
              <input
                type="date"
                value={customRange.startDate}
                onChange={(e) =>
                  onCustomRangeChange({
                    ...customRange,
                    startDate: e.target.value,
                  })
                }
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              إلى تاريخ (نهاية الفترة)
            </label>
            <div className="relative">
              <input
                type="date"
                value={customRange.endDate}
                onChange={(e) =>
                  onCustomRangeChange({
                    ...customRange,
                    endDate: e.target.value,
                  })
                }
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
