import { geolocation } from '@vercel/functions';

// Only run on real page navigations — skip static assets, api routes, and files.
export const config = {
  matcher: '/((?!api|assets|favicon|manifest|service-worker|icon-|.*\\..*).*)',
};

export default function middleware(request) {
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
