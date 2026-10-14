import { useSyncExternalStore } from "react";
export type PwaCacheState = {
  state: "checking" | "downloading" | "partial" | "ready";
  completed: number;
  total: number;
  downloads?: { label: string; loaded: number; total: number }[];
  storage?: boolean;
};
let current: PwaCacheState = { state: "checking", completed: 0, total: 0 };
const listeners = new Set<() => void>();
export function updatePwaCacheStatus(value: PwaCacheState) {
  current = value;
  listeners.forEach((listener) => listener());
}
export function requestPwaPreload() {
  window.dispatchEvent(new Event("album-retry-preload"));
}
export function usePwaCacheStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
