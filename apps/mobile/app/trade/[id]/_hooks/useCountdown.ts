import { useEffect, useState } from 'react';

/** Geri sayım için saniyede bir tetiklenen `now` (ms). */
export function useCountdown(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
