// Build the public origin used in invitation links.
//
// Prefer the explicitly configured canonical URL. Otherwise honour
// reverse-proxy headers (Vercel/Hostinger/Cloudflare/nginx), then the
// request URL itself. When ALLOWED_INVITE_HOSTS is configured, derived
// hosts must be on that allow-list to prevent Host-header poisoning.

function allowedHosts(): readonly string[] | null {
  const raw = process.env.ALLOWED_INVITE_HOSTS?.trim();
  if (!raw) return null;
  const hosts = raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : null;
}

function hostIsAllowed(host: string, allowList: readonly string[] | null) {
  if (!allowList) return true;
  // Strip the port before checking a configured hostname.
  const hostname = host.toLowerCase().replace(/:\d+$/, "");
  return allowList.includes(hostname);
}

export function resolveInviteBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const allowList = allowedHosts();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedHost && hostIsAllowed(forwardedHost, allowList)) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const requestUrl = new URL(request.url);
  if (hostIsAllowed(requestUrl.host, allowList)) {
    return requestUrl.origin;
  }

  console.warn("[invite base URL] rejected non-allow-listed host", {
    forwardedHost,
    requestHost: requestUrl.host,
  });
  return "https://wacrm.tech";
}
