import { useEffect, useRef, useState } from 'react';

export function useQuestionTimer(ms: number, onExpire: () => void, resetKey: unknown): number {
  const [progress, setProgress] = useState(1);
  const cb = useRef(onExpire);
  cb.current = onExpire;

  useEffect(() => {
    setProgress(1);
    const start = Date.now();
    const id = window.setInterval(() => {
      const p = 1 - (Date.now() - start) / ms;
      if (p <= 0) {
        window.clearInterval(id);
        setProgress(0);
        cb.current();
      } else {
        setProgress(p);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [ms, resetKey]);

  return progress;
}