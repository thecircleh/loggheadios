import axios from "axios";

const STAT_PATTERNS = [
  "/api/players/increment-games-played",
  "/api/players/decrement-games-played",
  "/api/stats/log",
  "/api/player-match-stats/log",
];

const STAT_PARAM_RE = /\/api\/players\/[^/]+\/stats$/;

function isStatMutation(url) {
  if (!url) return false;
  if (STAT_PATTERNS.some(p => url.includes(p))) return true;
  if (STAT_PARAM_RE.test(url)) return true;
  return false;
}

function genId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let requestInterceptorId = null;
let responseInterceptorId = null;

export function setupStatRetryInterceptor() {
  // Avoid double-registering on hot reload
  if (requestInterceptorId !== null) return;

  // Add idempotency key to every stat mutation before it goes out
  requestInterceptorId = axios.interceptors.request.use(config => {
    const method = (config.method || "").toLowerCase();
    if (method !== "get" && isStatMutation(config.url)) {
      if (!config.headers["x-idempotency-key"]) {
        config.headers["x-idempotency-key"] = genId();
      }
    }
    return config;
  });

  // Retry stat mutations on network errors and 5xx responses
  responseInterceptorId = axios.interceptors.response.use(
    response => response,
    async error => {
      const config = error.config;

      if (!config || !isStatMutation(config.url)) {
        return Promise.reject(error);
      }

      // Calls from the offline queue drain manage their own retry cycle
      if (config._offlineDrain) {
        return Promise.reject(error);
      }

      // Never retry client errors (4xx) — those are application-level failures
      if (error.response && error.response.status < 500) {
        return Promise.reject(error);
      }

      const retryCount = config._retryCount || 0;
      const MAX_RETRIES = 3;

      if (retryCount >= MAX_RETRIES) {
        console.warn(
          `[StatRetry] Giving up after ${MAX_RETRIES} retries: ${config.url}`
        );
        return Promise.reject(error);
      }

      config._retryCount = retryCount + 1;
      const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s

      console.log(
        `[StatRetry] Retry ${config._retryCount}/${MAX_RETRIES} in ${delay}ms for ${config.url} (key=${config.headers["x-idempotency-key"]})`
      );

      await sleep(delay);
      return axios(config);
    }
  );
}
