import React, { createContext, useContext, useEffect, useState } from 'react';

const InstallPromptContext = createContext(null);

const DISMISSED_KEY = 'a2hs_dismissed';

function detectEnv() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isIosSafari = isIos && /^((?!chrome|android).)*safari/i.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
  return { isIos, isIosSafari, isStandalone };
}

export function InstallPromptProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const { isIos, isIosSafari, isStandalone } = detectEnv();

  // canInstall: browser offered native prompt (Android/Chrome) OR iOS Safari not in standalone
  const canInstall = !isStandalone && (!!deferredPrompt || isIosSafari);

  const isPermanentlyDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
  const shouldShowBanner = canInstall && !dismissed && !isPermanentlyDismissed;

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const dismiss = (isLoggedIn) => {
    setDismissed(true);
    if (isLoggedIn) {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    // Guest dismissal is session-only — resets on next page load
  };

  return (
    <InstallPromptContext.Provider
      value={{ isStandalone, isIos, isIosSafari, canInstall, shouldShowBanner, promptInstall, dismiss }}
    >
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  return useContext(InstallPromptContext);
}
