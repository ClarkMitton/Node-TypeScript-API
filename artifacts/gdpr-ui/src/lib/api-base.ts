// Base URL for the API server. When the UI and API are served from the same
// origin (local dev, or a combined deploy) this is empty and all calls use
// relative `/api/...` paths. When the UI is deployed separately (e.g. a static
// site on Vercel pointing at a standalone API), set VITE_API_URL to the API's
// origin, e.g. https://my-api.vercel.app
export const API_BASE: string = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? ""
).replace(/\/+$/, "");
