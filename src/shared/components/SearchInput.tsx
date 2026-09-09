import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showClear?: boolean;
  onClear?: () => void;
  className?: string; // wrapper class
  inputClassName?: string; // input override
}

export const SearchInput: React.FC<SearchInputProps> = ({
  id,
  value,
  onChange,
  placeholder = '',
  showClear = true,
  onClear,
  className = '',
  inputClassName = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full text-xs font-semibold ps-9 pe-8 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 ${inputClassName}`}
        aria-label={placeholder || 'Search'}
      />

      {showClear && value && (
        <button
          type="button"
          onClick={() => {
            onClear ? onClear() : onChange('');
          }}
          className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          title="مسح البحث"
          aria-label="مسح البحث"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
