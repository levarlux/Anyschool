// ConfirmProvider — Global confirm context
// Provides useConfirm() hook that replaces window.confirm() with themed modal

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmModal, { ConfirmOptions } from './ConfirmModal';

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: (value: string | boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<string | boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<string | boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const handleConfirm = (typedValue?: string) => {
    state?.resolve(state.requireTypedConfirm ? (typedValue || false) : true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <ConfirmModal
          open={state.open}
          title={state.title}
          message={state.message}
          confirmText={state.confirmText}
          cancelText={state.cancelText}
          variant={state.variant}
          requireTypedConfirm={state.requireTypedConfirm}
          typedConfirmText={state.typedConfirmText}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}
