import React, { createContext, useContext } from 'react';

type Translations = {
  scanTitle: string;
  scanSearching: string;
  scanNoDevices: string;
  scanNoDevicesHint: string;
  scanAgain: string;
  authEnterPassword: string;
  authPasswordHint: string;
  authWrongPassword: string;
  authConnect: string;
  authConnecting: string;
  errorTitle: string;
  errorMessage: string;
  errorTryAgain: string;
  errorDetails: string;
  evMotorOn: string;
  evMotorOff: string;
  tankLevel: string;
  stopTankFull: string;
  stopSupplyCut: string;
  tankLow: string;
  tankLowNotifBody: string;
  pumpManual: string;
  evManualOn: string;
};

const en: Translations = {
  scanTitle: 'Scan for Boards',
  scanSearching: 'Searching for ESP32 boards…',
  scanNoDevices: 'No boards found',
  scanNoDevicesHint: 'Make sure your ESP32 is powered on and running OS firmware.',
  scanAgain: 'Scan Again',
  authEnterPassword: 'Enter Password',
  authPasswordHint: 'Default password is printed on the board.',
  authWrongPassword: 'Incorrect password. Please try again.',
  authConnect: 'Connect',
  authConnecting: 'Connecting…',
  errorTitle: 'Something went wrong',
  errorMessage: 'An unexpected error occurred. Please restart the app.',
  errorTryAgain: 'Restart App',
  errorDetails: 'Error Details',
  evMotorOn: 'Motor On',
  evMotorOff: 'Motor Off',
  tankLevel: 'Tank Level',
  stopTankFull: 'Tank full',
  stopSupplyCut: 'Supply cut',
  tankLow: 'Tank Low',
  tankLowNotifBody: 'Your tank level is low.',
  pumpManual: 'Manual Override',
  evManualOn: 'Pump started manually.',
};

interface LanguageContextValue {
  t: (key: keyof Translations) => string;
  locale: string;
}

const LanguageContext = createContext<LanguageContextValue>({
  t: (key) => en[key] ?? key,
  locale: 'en',
});

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const t = (key: keyof Translations): string => en[key] ?? key;
  return (
    <LanguageContext.Provider value={{ t, locale: 'en' }}>
      {children}
    </LanguageContext.Provider>
  );
}
