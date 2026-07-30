import { geolocation } from '@vercel/functions';

// Gate the entire site (including /api) behind a password while it's not
// ready to be fully public. Static asset files are excluded since they're
// meaningless without the page anyway, but every route/page/API is covered.
export const config = {
  matcher: '/((?!assets|favicon|manifest|service-worker|icon-|.*\\..*).*)',
};

// Plain HTTP Basic Auth — browser's native login popup, no custom page needed.
// The password lives in the SITE_PASSWORD env var in Vercel (Settings ->
// Environment Variables), never in this file. Username is ignored.
function isAuthorized(request) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) return false;
  try {
    const decoded = atob(auth.slice('Basic '.length));
    const sep = decoded.indexOf(':');
    const pass = sep === -1 ? decoded : decoded.slice(sep + 1);
    return Boolean(process.env.SITE_PASSWORD) && pass === process.env.SITE_PASSWORD;
  } catch {
    return false;
  }
}

export default function middleware(request) {
  if (!isAuthorized(request)) {
    return new Response('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="The Treasures List — Private Preview"' },
    });
  }

  const { country, countryRegion } = geolocation(request);

  const response = new Response(null, {
    headers: { 'x-middleware-next': '1' },
  });

  // Cookies are readable client-side (not httpOnly) — the React app uses them
  // once on first load to set a default location filter. 7 day expiry so a
  // returning visitor gets a fresh read periodically (e.g. after traveling).
  if (country) {
    response.headers.append(
      'Set-Cookie',
      `tl_geo_country=${country}; Path=/; Max-Age=604800; SameSite=Lax`
    );
  }
  if (countryRegion) {
    response.headers.append(
      'Set-Cookie',
      `tl_geo_region=${countryRegion}; Path=/; Max-Age=604800; SameSite=Lax`
    );
  }

  return response;
}
