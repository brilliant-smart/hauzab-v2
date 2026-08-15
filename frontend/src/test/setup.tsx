import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { MemoryRouter } from "react-router-dom";
import { render, renderHook, type RenderHookOptions } from "@testing-library/react";
import type { ReactNode } from "react";

// jsdom is missing a handful of browser APIs the app touches on mount.
class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", MockObserver);
vi.stubGlobal("ResizeObserver", MockObserver);

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("print", () => {});

// Radix portals render into a real document.body; keep each test isolated.
beforeEach(() => {
  document.documentElement.className = "";
});
afterEach(() => {
  cleanup();
});

/** Providers every routed component expects: router, React Query, theme. */
export function AllProviders({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <MemoryRouter>{children}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Render a component wrapped in the standard providers. */
export function renderWithProviders(ui: ReactNode) {
  return render(<AllProviders>{ui}</AllProviders>);
}

/** renderHook wrapped in the standard providers (for hooks that use routing). */
export function renderHookWithProviders<TResult>(
  hook: () => TResult,
  options?: RenderHookOptions<TResult>,
) {
  return renderHook(hook, { wrapper: AllProviders, ...options });
}