// api/places.js — Vercel serverless function
// Proxies Google Places API so the key is never exposed in the browser

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mapsUrl, query } = req.body || {};
  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    let placeId = null;

    // Try to extract place_id from Maps URL
    if (mapsUrl) {
      // Pattern: /place/Name/data=...!1s0x...:0x... or place_id in URL
      const placeIdMatch = mapsUrl.match(/place_id=([^&]+)/);
      const dataMatch = mapsUrl.match(/!1s([^!]+)!/);
      const shortMatch = mapsUrl.match(/maps\/place\/[^/]+\/@[^/]+\/([^?]+)/);

      if (placeIdMatch) {
        placeId = placeIdMatch[1];
      } else if (dataMatch) {
        placeId = dataMatch[1];
      }
    }

    let placeData = null;

    if (placeId) {
      // Direct place lookup by ID
      const detailsUrl = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
      const r = await fetch(detailsUrl, {
        headers: {
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'displayName,formattedAddress,addressComponents,internationalPhoneNumber,websiteUri,id'
        }
      });
      if (r.ok) placeData = await r.json();
    }

    // Fallback: text search using query or business name from URL
    if (!placeData) {
      let searchQuery = query;

      if (!searchQuery && mapsUrl) {
        // Extract business name from URL
        const nameMatch = mapsUrl.match(/\/place\/([^/@]+)/);
        if (nameMatch) {
          searchQuery = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        }
      }

      if (!searchQuery) return res.status(400).json({ error: 'Could not determine search query from URL' });

      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents,places.internationalPhoneNumber,places.websiteUri,places.id'
        },
        body: JSON.stringify({ textQuery: searchQuery })
      });

      if (!r.ok) {
        const err = await r.json();
        return res.status(r.status).json({ error: err.error?.message || 'Places API error' });
      }

      const data = await r.json();
      if (!data.places?.length) return res.status(404).json({ error: 'No place found for that URL or search' });
      placeData = data.places[0];
    }

    // Parse address components
    const get = (types) => {
      const comp = (placeData.addressComponents || []).find(c => types.some(t => c.types?.includes(t)));
      return comp?.longText || comp?.shortText || '';
    };
    const getShort = (types) => {
      const comp = (placeData.addressComponents || []).find(c => types.some(t => c.types?.includes(t)));
      return comp?.shortText || comp?.longText || '';
    };

    const streetNum  = get(['street_number']);
    const route      = get(['route']);
    const address    = [streetNum, route].filter(Boolean).join(' ');
    const city       = get(['locality', 'sublocality_level_1', 'postal_town']);
    const state      = getShort(['administrative_area_level_1']);
    const country    = get(['country']);
    const website    = (placeData.websiteUri || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

    return res.status(200).json({
      name:    placeData.displayName?.text || '',
      address,
      city,
      state,
      country,
      phone:   placeData.internationalPhoneNumber || '',
      website,
      map_url: mapsUrl || '',
    });

  } catch (err) {
    console.error('Places API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
