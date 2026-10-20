"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import ToastContainer, { ToastMessage } from '@/components/notifications/Toast';

interface ToastContextType {
  showToast: (type: ToastMessage['type'], title: string, message: string, duration?: number) => void;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  showInfo: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], title: string, message: string, duration = 5000) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: ToastMessage = { id, type, title, message, duration };
    
    setToasts((prev) => [...prev, newToast]);
  }, []);

  const showSuccess = useCallback((title: string, message: string) => {
    showToast('success', title, message);
  }, [showToast]);

  const showError = useCallback((title: string, message: string) => {
    showToast('error', title, message);
  }, [showToast]);

  const showInfo = useCallback((title: string, message: string) => {
    showToast('info', title, message);
  }, [showToast]);

  const showWarning = useCallback((title: string, message: string) => {
    showToast('warning', title, message);
  }, [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo, showWarning }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
