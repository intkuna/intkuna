import express from "express";
import maxmind from "maxmind";

const app = express();

// Load GeoLite databases
let cityDB;
let asnDB;

async function loadDB() {
  cityDB = await maxmind.open("./GeoLite2-City.mmdb");
  asnDB = await maxmind.open("./GeoLite2-ASN.mmdb");
}
loadDB();

// Extract IP safely
function extractIP(req) {
  return req.params.ip || req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
}

// Check if ASN / ISP indicates VPN / Proxy / Hosting
function isVPN(asnData) {
  if (!asnData) return false;
  const vpnKeywords = ["VPN", "Proxy", "Hosting", "DigitalOcean", "AWS", "OVH", "Hetzner"];
  return vpnKeywords.some(k => asnData.autonomous_system_organization?.toLowerCase().includes(k.toLowerCase()));
}

// Get country flag (emoji) from ISO code
function getCountryFlag(isoCode) {
  if (!isoCode) return null;
  // Convert "US" → 🇺🇸
  const codePoints = isoCode.toUpperCase().split('').map(c => 127397 + c.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

// Build response JSON
function buildResponse(ip, cityData, asnData) {
  const isoCode = cityData?.country?.iso_code;
  return {
    ip,
    country: cityData?.country?.names?.en || null,
    city: cityData?.city?.names?.en || null,
    continent: cityData?.continent?.names?.en || null,
    location: {
      latitude: cityData?.location?.latitude || null,
      longitude: cityData?.location?.longitude || null,
      timezone: cityData?.location?.time_zone || null
    },
    isp: asnData?.autonomous_system_organization || null,
    asn: asnData?.autonomous_system_number || null,
    postal: cityData?.postal?.code || null,
    subdivision: cityData?.subdivisions?.[0]?.names?.en || null,
    vpn_or_proxy: isVPN(asnData),
    country_flag: getCountryFlag(isoCode)
  };
}

// Route: GET /geo (client IP)
app.get("/geo", (req, res) => {
  const ip = extractIP(req);
  const cityData = cityDB.get(ip);
  const asnData = asnDB.get(ip);
  if (!cityData) return res.json({ error: "Invalid or private IP" });
  res.json(buildResponse(ip, cityData, asnData));
});

// Route: GET /geo/:ip (target IP)
app.get("/geo/:ip", (req, res) => {
  const ip = extractIP(req);
  const cityData = cityDB.get(ip);
  const asnData = asnDB.get(ip);
  if (!cityData) return res.json({ error: "Invalid IP" });
  res.json(buildResponse(ip, cityData, asnData));
});

// Start server
app.listen(3000, () => console.log("IP GEO API with VPN & Flags running on port 3000"));
