export interface FreePlace {
  id: string;
  displayName: string;
  formattedAddress: string;
  description?: string;
  location: { lat: number; lng: number };
  imageUrl?: string;
  rating?: number;
  type?: string;
  price?: string;
}

export interface PlaceDetails {
  title: string;
  extract: string;
  imageUrl?: string;
  lat?: number;
  lng?: number;
}

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const USER_AGENT = 'MapsTravelPlanner/1.0 (contact: travelplanner@example.com)';

const OSM_TAG_MAP: Record<string, string> = {
  cafe: 'amenity=cafe',
  park: 'leisure=park',
  museum: 'tourism=museum',
  tourist_attraction: 'tourism=attraction',
  restaurant: 'amenity=restaurant',
};

const geocodeCache = new Map<string, GeocodeResult | null>();
const placeDetailsCache = new Map<string, PlaceDetails | null>();
const attractionsCache = new Map<string, FreePlace[]>();
const amenitiesCache = new Map<string, FreePlace[]>();

export async function searchLocationFree(query: string): Promise<GeocodeResult | null> {
  const cacheKey = query.trim().toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      geocodeCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    if (!data || data.length === 0) {
      geocodeCache.set(cacheKey, null);
      return null;
    }
    const result = {
      name: data[0].display_name,
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
    geocodeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Nominatim geocoding failed:', err);
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

interface WikiSearchResult {
  query?: {
    search?: Array<{ pageid: number; title: string }>;
  };
}

interface WikiPage {
  pageid: number;
  title: string;
  extract?: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  original?: { source: string };
}

interface WikiDetailsResult {
  query?: {
    pages?: Record<string, WikiPage>;
  };
}

export async function fetchPlaceDetailsFree(query: string): Promise<PlaceDetails | null> {
  const cacheKey = query.trim().toLowerCase();
  if (placeDetailsCache.has(cacheKey)) {
    return placeDetailsCache.get(cacheKey) ?? null;
  }
  try {
    const searchUrl = `${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      placeDetailsCache.set(cacheKey, null);
      return null;
    }
    const searchData = (await searchRes.json()) as WikiSearchResult;
    const first = searchData.query?.search?.[0];
    if (!first) {
      placeDetailsCache.set(cacheKey, null);
      return null;
    }

    const detailsUrl = `${WIKIPEDIA_API}?action=query&pageids=${first.pageid}&prop=pageimages|extracts|coordinates&piprop=original&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`;
    const detailsRes = await fetch(detailsUrl);
    if (!detailsRes.ok) {
      placeDetailsCache.set(cacheKey, null);
      return null;
    }
    const detailsData = (await detailsRes.json()) as WikiDetailsResult;
    const page = detailsData.query?.pages?.[first.pageid];
    if (!page) {
      placeDetailsCache.set(cacheKey, null);
      return null;
    }

    const result = {
      title: page.title,
      extract: page.extract ?? '',
      imageUrl: page.original?.source,
      lat: page.coordinates?.[0]?.lat,
      lng: page.coordinates?.[0]?.lon,
    };
    placeDetailsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('Wikipedia place details failed:', err);
    placeDetailsCache.set(cacheKey, null);
    return null;
  }
}

interface WikiGeoResult {
  query?: {
    geosearch?: Array<{ pageid: number; title: string; lat: number; lon: number }>;
  };
}

export async function fetchNearbyAttractionsFree(lat: number, lng: number): Promise<FreePlace[]> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (attractionsCache.has(cacheKey)) {
    return attractionsCache.get(cacheKey)!;
  }
  try {
    const radius = 5000;
    const listUrl = `${WIKIPEDIA_API}?action=query&list=geosearch&gsradius=${radius}&gscoord=${lat}|${lng}&gslimit=15&format=json&origin=*`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) return [];
    const listData = (await listRes.json()) as WikiGeoResult;
    const pages = listData.query?.geosearch ?? [];
    if (pages.length === 0) return [];

    const pageIds = pages.map((p) => p.pageid).join('|');
    const detailsUrl = `${WIKIPEDIA_API}?action=query&pageids=${pageIds}&prop=pageimages|extracts&piprop=original&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`;
    const detailsRes = await fetch(detailsUrl);
    if (!detailsRes.ok) return [];
    const detailsData = (await detailsRes.json()) as WikiDetailsResult;
    const pageDetails = detailsData.query?.pages ?? {};

    const results = pages.map((page) => {
      const details = pageDetails[page.pageid];
      return {
        id: String(page.pageid),
        displayName: page.title,
        formattedAddress: `Lat: ${page.lat.toFixed(4)}, Lng: ${page.lon.toFixed(4)}`,
        description: details?.extract || 'Interesting historical point of interest.',
        location: { lat: page.lat, lng: page.lon },
        imageUrl: details?.original?.source,
        type: 'tourist_attraction',
        rating: 4.5 + Math.random() * 0.5,
      };
    });
    attractionsCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error('Wikipedia geosearch failed:', err);
    return [];
  }
}

interface OverpassElement {
  id: number | string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export async function fetchNearbyAmenitiesFree(
  lat: number,
  lng: number,
  type: string,
): Promise<FreePlace[]> {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${type}`;
  if (amenitiesCache.has(cacheKey)) {
    return amenitiesCache.get(cacheKey)!;
  }
  const tag = OSM_TAG_MAP[type] ?? 'amenity=restaurant';
  const radius = 2000;
  const query = `[out:json];(${['node', 'way'].map((t) => `${t}[${tag}](around:${radius}, ${lat}, ${lng});`).join('')});out center limit 20;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OverpassResponse;
    const elements = data.elements ?? [];

    const results = elements
      .map<FreePlace | null>((el) => {
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        if (elLat == null || elLng == null) return null;
        const name = el.tags?.name || el.tags?.operator || `Nearby ${type.replace('_', ' ')}`;
        const street = el.tags?.['addr:street'];
        const houseNumber = el.tags?.['addr:housenumber'];
        return {
          id: String(el.id),
          displayName: name,
          formattedAddress: street
            ? `${street} ${houseNumber ?? ''}`.trim()
            : `Coordinates: ${elLat.toFixed(4)}, ${elLng.toFixed(4)}`,
          description: el.tags?.cuisine
            ? `Serving ${el.tags.cuisine} cuisine.`
            : `${name} - a local ${type.replace('_', ' ')}.`,
          location: { lat: elLat, lng: elLng },
          type,
          rating: 4.0 + Math.random() * 1.0,
        };
      })
      .filter((p): p is FreePlace => p !== null);
    amenitiesCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error('Overpass query failed:', err);
    return [];
  }
}
