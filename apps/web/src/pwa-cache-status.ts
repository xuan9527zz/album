import { useSyncExternalStore } from "react";
type State = {
  state: "checking" | "downloading" | "partial" | "ready";
  completed: number;
  total: number;
};
let current: State = { state: "checking", completed: 0, total: 0 };
const listeners = new Set<() => void>();
export function updatePwaCacheStatus(value: State) {
  current = value;
  listeners.forEach((listener) => listener());
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
