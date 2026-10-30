"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import {
  emptyWorkspace,
  restoreWorkspace,
  STORAGE_KEY,
  type Workspace,
} from "@/lib/model";

type WorkspaceContext = {
  state: Workspace;
  setState: Dispatch<SetStateAction<Workspace>>;
  ready: boolean;
  storageAvailable: boolean;
  isNavigating: boolean;
  navigate: (href: string) => void;
};
const Context = createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [state, setState] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setState(restoreWorkspace(JSON.parse(stored)));
    } catch {
      setStorageAvailable(false);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setStorageAvailable(false);
    }
  }, [ready, state]);
  return (
    <Context.Provider
      value={{
        state,
        setState,
        ready,
        storageAvailable,
        isNavigating,
        navigate: (href) => startNavigation(() => router.push(href)),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider is required.");
  return context;
}
