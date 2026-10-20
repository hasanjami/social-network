"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

interface ConfirmContextType {
  confirm: (opts?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<Resolver | null>(null);

  const confirm = useCallback((options?: ConfirmOptions): Promise<boolean> => {
    setOpts(options ?? {});
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const finish = (value: boolean) => {
    if (resolver) resolver(value);
    setResolver(null);
    setOpts(null);
  };

  const isOpen = opts !== null;
  const title = opts?.title || 'Are you sure?';
  const body = opts?.body || '';
  const confirmText = opts?.confirmText || 'Confirm';
  const cancelText = opts?.cancelText || 'Cancel';
  const destructive = opts?.destructive ?? false;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => finish(false)}>
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            {body && <p className="mt-2 text-sm text-gray-600">{body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => finish(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
                  destructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
                autoFocus
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx.confirm;
}
