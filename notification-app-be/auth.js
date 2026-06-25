import { BASE_URL, CLIENT_ID, CLIENT_SECRET, EMAIL, NAME, ROLL_NO, ACCESS_CODE } from "./config.js";

let _token = null;
let _tokenExpiry = 0;

export async function getAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token && now < _tokenExpiry - 60) {
    return _token;
  }
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      name: NAME,
      rollNo: ROLL_NO,
      accessCode: ACCESS_CODE,
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("Auth failed: " + res.status);
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = data.expires_in;
  return _token;
}
