"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  briefResultSchema,
  customerResultSchema,
  type AIKind,
} from "@/lib/ai-schema";
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
  aiBusy: AIKind | null;
  aiStatus: { active: boolean; endsAt?: string } | null;
  requestAI: (
    kind: AIKind,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
};
const Context = createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), [pathname]);
  const [isNavigating, startNavigation] = useTransition();
  const [state, setState] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [aiBusy, setAIBusy] = useState<AIKind | null>(null);
  const busyRef = useRef(false);
  const [aiStatus, setAIStatus] = useState<{
    active: boolean;
    endsAt?: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((result) => setAIStatus(result))
      .catch(() => {
        if (!controller.signal.aborted) setAIStatus({ active: false });
      });
    return () => controller.abort();
  }, []);
  async function requestAI(
    kind: AIKind,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    if (busyRef.current) throw new Error("An AI request is already running.");
    busyRef.current = true;
    setAIBusy(kind);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/ai/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(85_000),
        ]),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The AI request could not be completed.");
      return kind === "brief"
        ? briefResultSchema.parse(data)
        : customerResultSchema.parse(data);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      )
        throw new Error(
          "The request timed out. Your input is preserved; no automatic retry was made.",
        );
      throw error;
    } finally {
      setAIBusy(null);
      busyRef.current = false;
      abortRef.current = null;
    }
  }
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
        aiBusy,
        aiStatus,
        requestAI,
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
