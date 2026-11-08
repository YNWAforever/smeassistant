"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

type RecentThread = { id: string; title: string };
const ConversationNavigation = createContext<{
  threads: RecentThread[];
  setThreads: Dispatch<SetStateAction<RecentThread[]>>;
} | null>(null);

/** Only the mounted, authorized conversation publishes browser-local titles to the sidebar. */
export function ConversationNavigationProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<RecentThread[]>([]);
  const value = useMemo(() => ({ threads, setThreads }), [threads]);
  return <ConversationNavigation.Provider value={value}>{children}</ConversationNavigation.Provider>;
}

export const useConversationNavigation = () => useContext(ConversationNavigation);

export function openConversationTool(id: string) {
  const panel = document.getElementById(id);
  if (!(panel instanceof HTMLDetailsElement)) return;
  panel.open = true;
  panel.scrollIntoView({ behavior: "instant", block: "start" });
  panel.querySelector("summary")?.focus();
}
