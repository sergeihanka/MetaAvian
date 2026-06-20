import { useState, useEffect } from 'react';

function getTimeUntil9amCentral() {
  const now = new Date();
  const hourDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    hour12: false,
  });
  const dateDtf = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' });

  const centralHour =
    parseInt(Object.fromEntries(hourDtf.formatToParts(now).map(p => [p.type, p.value])).hour, 10) % 24;

  const targetDateStr =
    centralHour < 9
      ? dateDtf.format(now)
      : dateDtf.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const [ty, tm, td] = targetDateStr.split('-').map(Number);

  let target = null;
  for (const utcHour of [14, 15]) {
    const candidate = new Date(Date.UTC(ty, tm - 1, td, utcHour, 0, 0, 0));
    const cHour =
      parseInt(Object.fromEntries(hourDtf.formatToParts(candidate).map(p => [p.type, p.value])).hour, 10) % 24;
    if (cHour === 9) { target = candidate; break; }
  }
  if (!target) target = new Date(Date.UTC(ty, tm - 1, td, 15, 0, 0, 0));

  const diff = target - now;
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function useCountdown() {
  const [timeLeft, setTimeLeft] = useState(getTimeUntil9amCentral);

  useEffect(() => {
    const id = setInterval(() => {
      setTimeLeft(getTimeUntil9amCentral());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return timeLeft;
}
