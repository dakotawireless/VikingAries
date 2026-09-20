import { useCallback, useEffect, useRef, useState } from "react";

export function formatUsd(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
  }).format(amount);
}

export function useApiUsage(days = 30) {
  const [state, setState] = useState({ usage: null, loading: true, error: "" });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const current = useRef(0);
  useEffect(() => {
    const generation = ++current.current;
    let controller;
    let inFlight = false;
    const load = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      setState((previous) => ({ ...previous, loading: true }));
      try {
        const response = await fetch(`/api/usage?days=${days}`, {
          cache: "no-store", signal: controller.signal,
        });
        const usage = await response.json();
        if (!response.ok) throw new Error(response.status === 401
          ? "Sign in again to view API usage."
          : "Usage storage is unavailable. Totals cannot be verified.");
        if (!usage?.totals || !usage?.today) throw new Error("Invalid API usage response.");
        if (current.current === generation) setState({ usage, loading: false, error: "" });
      } catch (error) {
        if (current.current === generation) setState((previous) => ({
          ...previous, loading: false,
          error: error.name === "AbortError" ? "API usage refresh timed out." : error.message,
        }));
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    };
    // Clear the prior period rather than showing it under a new range label.
    setState({ usage: null, loading: true, error: "" });
    load();
    const interval = setInterval(load, 15000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      ++current.current;
      clearInterval(interval);
      controller?.abort();
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [days, revision]);
  return { ...state, refresh };
}

export function ApiCounter() {
  const { usage, error } = useApiUsage(0);
  return (
    <output className="api-counter" data-api-counter="true" aria-live="polite" aria-label="Total recorded API spend in US dollars"
      title={error || "Total recorded OpenAI spend across all VA projects (estimated USD). Updates every 15 seconds. Open API Usage for details."}>
      {error ? "Unavailable" : usage ? formatUsd(usage.totals.estimatedCostUsd) : "..."}
    </output>
  );
}
