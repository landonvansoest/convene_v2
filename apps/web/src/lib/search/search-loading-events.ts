export const SEARCH_LOADING_CHANGED = "convene:search-loading-changed";

export function dispatchSearchLoading(loading: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SEARCH_LOADING_CHANGED, { detail: { loading } }));
}
