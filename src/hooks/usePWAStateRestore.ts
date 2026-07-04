import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PWA_LAST_PATH_KEY = "pwa_last_path";

/**
 * Persists current route to sessionStorage so when the PWA is reopened
 * after minimize/background, we can restore the same page (no "refresh" feel).
 * Saves on navigation and when the app goes to background (visibility change).
 */
export function usePWAStateRestore() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasRestored = useRef(false);

  // Restore last path once on mount (e.g. after app was minimized and process restarted)
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const saved = sessionStorage.getItem(PWA_LAST_PATH_KEY);
    if (!saved || saved === location.pathname + location.search + location.hash) return;

    try {
      const [path, search = "", hash = ""] = saved.split(/(?=[?#])/);
      const full = path + search + hash;
      if (full && full !== location.pathname + location.search + location.hash) {
        navigate(full, { replace: true });
      }
    } catch {
      // ignore invalid saved path
    }
  }, []);

  // Persist current path on navigation and when app goes to background
  useEffect(() => {
    const full = location.pathname + location.search + location.hash;
    sessionStorage.setItem(PWA_LAST_PATH_KEY, full);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const full = location.pathname + location.search + location.hash;
        sessionStorage.setItem(PWA_LAST_PATH_KEY, full);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [location.pathname, location.search, location.hash]);
}
