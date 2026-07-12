// api/places.js — Vercel serverless function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mapsUrl } = req.body || {};
  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });
  if (!mapsUrl) return res.status(400).json({ error: 'No URL provided' });

  try {
    // Step 1: Resolve shortened URLs (maps.app.goo.gl, goo.gl, etc.)
    let resolvedUrl = mapsUrl;
    if (mapsUrl.includes('goo.gl') || mapsUrl.includes('maps.app')) {
      const r = await fetch(mapsUrl, { method: 'HEAD', redirect: 'follow' });
      resolvedUrl = r.url;
    }

    // Step 2: Try to extract place_id from the resolved URL
    let placeId = null;

    // Pattern: !1s followed by ChIJ place_id
    const chijMatch = resolvedUrl.match(/!1s(ChIJ[^!&]+)/);
    if (chijMatch) placeId = decodeURIComponent(chijMatch[1]);

    // Pattern: place_id= in URL params
    const placeIdParam = resolvedUrl.match(/place_id=([^&]+)/);
    if (!placeId && placeIdParam) placeId = placeIdParam[1];

    let placeData = null;

    // Step 3: If we have a place_id, do a direct lookup
    if (placeId) {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'displayName,formattedAddress,addressComponents,internationalPhoneNumber,websiteUri'
        }
      });
      if (r.ok) placeData = await r.json();
    }

    // Step 4: Fallback — extract business name from URL and text search
    if (!placeData) {
      let searchQuery = null;

      // Try to get business name from URL path: /place/Business+Name/
      const nameMatch = resolvedUrl.match(/\/place\/([^/@?]+)/);
      if (nameMatch) {
        searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        // Remove trailing coordinates or junk
        searchQuery = searchQuery.split(',')[0].trim();
      }

      // Also try query param
      const qMatch = resolvedUrl.match(/[?&]q=([^&]+)/);
      if (!searchQuery && qMatch) searchQuery = decodeURIComponent(qMatch[1]);

      if (!searchQuery) {
        return res.status(400).json({ error: 'Could not extract business info from this URL. Try copying the full Google Maps URL from your browser.' });
      }

      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.internationalPhoneNumber,places.websiteUri'
        },
        body: JSON.stringify({ textQuery: searchQuery })
      });

      if (!r.ok) {
        const err = await r.json();
        return res.status(r.status).json({ error: err.error?.message || 'Places API error' });
      }

      const data = await r.json();
      if (!data.places?.length) {
        return res.status(404).json({ error: `No place found for "${searchQuery}". Try a different Maps URL.` });
      }
      placeData = data.places[0];
    }

    // Step 5: Parse address components
    const get = (...types) => {
      const comp = (placeData.addressComponents || []).find(c => types.some(t => c.types?.includes(t)));
      return comp?.longText || comp?.shortText || '';
    };
    const getShort = (...types) => {
      const comp = (placeData.addressComponents || []).find(c => types.some(t => c.types?.includes(t)));
      return comp?.shortText || comp?.longText || '';
    };

    const streetNum = get('street_number');
    const route     = get('route');
    const city      = get('locality', 'sublocality_level_1', 'postal_town');
    const state     = getShort('administrative_area_level_1');
    const country   = get('country');
    const website   = (placeData.websiteUri || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

    return res.status(200).json({
      name:    placeData.displayName?.text || '',
      address: [streetNum, route].filter(Boolean).join(' '),
      city,
      state,
      country,
      phone:   placeData.internationalPhoneNumber || '',
      website,
      map_url: mapsUrl,
    });

  } catch (err) {
    console.error('Places API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
