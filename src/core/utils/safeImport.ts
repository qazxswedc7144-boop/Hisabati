import React from 'react';

/**
 * Creates a React.lazy component with error boundary handling for failed dynamic imports
 * (e.g. when network changes or old chunks are missing after a new deployment).
 */
export function safeLazy<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await importFn();
    } catch (err) {
      console.error('[SafeLazy] Failed to dynamically import component:', err);
      // Return a graceful fallback component
      return {
        default: (() => React.createElement(
          'div',
          { className: 'p-4 text-center text-rose-500 text-xs' },
          'تعذر تحميل هذا الجزء. يرجى تحديث الصفحة.'
        )) as unknown as T,
      };
    }
  });
}
