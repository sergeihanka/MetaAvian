import { useState, useEffect } from 'react';

function getTimeUntilMidnightUtc() {
  const now = new Date();
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const diff = midnight - now;
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

export function useCountdown() {
  const [timeLeft, setTimeLeft] = useState(getTimeUntilMidnightUtc);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(getTimeUntilMidnightUtc());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return timeLeft;
}
