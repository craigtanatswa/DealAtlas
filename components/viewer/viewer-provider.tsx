"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ViewerStatus = "unknown" | "anonymous" | "authenticated";

const ViewerStatusContext = createContext<ViewerStatus>("unknown");

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ViewerStatus>("unknown");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!active || response.status !== 200) {
          return;
        }
        const body = (await response.json()) as { authenticated?: unknown };
        if (!active) {
          return;
        }
        if (body.authenticated === true) {
          setStatus("authenticated");
        } else if (body.authenticated === false) {
          setStatus("anonymous");
        }
      } catch {
        // Network failures stay "unknown": treated as logged out, not confirmed.
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <ViewerStatusContext.Provider value={status}>
      {children}
    </ViewerStatusContext.Provider>
  );
}

export function useViewerStatus(): ViewerStatus {
  return useContext(ViewerStatusContext);
}

export function useIsAuthenticated(): boolean {
  return useViewerStatus() === "authenticated";
}

export function SignedInSwitch({
  signedIn,
  anonymous,
}: {
  signedIn: ReactNode;
  anonymous: ReactNode;
}) {
  return <>{useIsAuthenticated() ? signedIn : anonymous}</>;
}
