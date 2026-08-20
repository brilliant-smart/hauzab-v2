import { useEffect } from "react";

/**
 * Sets the browser-tab title. Pass the fully-formed title, e.g.
 * `useDocumentTitle("Hauzab Super Market - Dashboard")`. Re-applies whenever the
 * title string changes, so route/tenant updates keep the tab in sync.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}