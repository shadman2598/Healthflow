"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { IconCheckCircle, IconXCircle } from "../components/ui/Icons";

type ToastType = "success" | "error";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            onClick={() => dismiss(toast.id)}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all ${
              toast.type === "success"
                ? "border-emerald-200 bg-white text-emerald-800"
                : "border-red-200 bg-white text-red-800"
            }`}
          >
            {toast.type === "success" ? (
              <IconCheckCircle className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <IconXCircle className="h-5 w-5 shrink-0 text-red-500" />
            )}
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
