import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

export function useLockBody(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = '100%';
    }
    lockCount++;

    return () => {
      lockCount--;
      if (lockCount === 0) {
        const top = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        const scrollY = top ? Math.abs(parseInt(top, 10)) : savedScrollY;
        window.scrollTo(0, isNaN(scrollY) ? savedScrollY : scrollY);
      }
    };
  }, [isLocked]);
}
