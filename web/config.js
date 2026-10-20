/* Runtime configuration for the static Vercel frontend.
 * Local development points at the local API; production points at Wispbyte.
 * Change API_URL in one place if the backend domain changes.
 */
window.APP_CONFIG = {
  API_URL: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:3000"
    : "https://familygame.wisp.uno",
};
