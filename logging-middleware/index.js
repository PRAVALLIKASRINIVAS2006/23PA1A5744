const BASE_URL = "http://4.224.186.213/evaluation-service";

const clientConfig = {
  clientID: "ff165d28-9b56-4a0a-8359-c1bbe088818c",
  clientSecret: "gCdPQDpNvDRPmGTZ",
  email: "23pa1a5744@vishnu.edu.in",
  name: "penumarthi pravallika",
  rollNo: "23pa1a5744",
  accessCode: "ahXjvp",
};

let _token = null;
let _tokenExpiry = 0;

async function getAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token && now < _tokenExpiry - 60) {
    return _token;
  }
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clientConfig),
  });
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = data.expires_in;
  return _token;
}

/**
 * Sends a structured log entry to the evaluation server.
 * @param {"backend"|"frontend"} stack
 * @param {"debug"|"info"|"warn"|"error"|"fatal"} level
 * @param {string} pkg - package name (e.g. "handler", "service", "component")
 * @param {string} message
 */
export async function Log(stack, level, pkg, message) {
  try {
    const token = await getAuthToken();
    await fetch(`${BASE_URL}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stack, level, package: pkg, message }),
    });
  } catch (err) {
    console.error("[Logger] Failed to send log:", err?.message ?? err);
  }
}
