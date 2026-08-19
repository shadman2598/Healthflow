"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ageYearsFromDob, shouldUseEasyMode } from "@technovate/shared";

type EasyModeContextValue = {
  easy: boolean;
  setUserToggle: (on: boolean | null) => void;
  userToggle: boolean | null;
};

const EasyModeContext = createContext<EasyModeContextValue>({
  easy: false,
  setUserToggle: () => undefined,
  userToggle: null
});

const STORAGE_KEY = "healthflow-easy-mode";

export function EasyModeProvider({
  dateOfBirth,
  children
}: {
  dateOfBirth?: string | null;
  children: React.ReactNode;
}) {
  const [userToggle, setUserToggleState] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "on") setUserToggleState(true);
    if (stored === "off") setUserToggleState(false);
  }, []);

  const age = ageYearsFromDob(dateOfBirth ?? null);
  const easy = useMemo(() => shouldUseEasyMode(age, userToggle), [age, userToggle]);

  useEffect(() => {
    document.documentElement.dataset.easyMode = easy ? "on" : "off";
  }, [easy]);

  const setUserToggle = (on: boolean | null): void => {
    setUserToggleState(on);
    if (on === true) window.localStorage.setItem(STORAGE_KEY, "on");
    else if (on === false) window.localStorage.setItem(STORAGE_KEY, "off");
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <EasyModeContext.Provider value={{ easy, setUserToggle, userToggle }}>
      {children}
    </EasyModeContext.Provider>
  );
}

export function useEasyMode(): EasyModeContextValue {
  return useContext(EasyModeContext);
}
