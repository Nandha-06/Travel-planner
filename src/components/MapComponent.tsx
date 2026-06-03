import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Star, Trash2, Search, Calendar, Menu, X, Sparkles, DollarSign, Briefcase, CheckSquare, PlusCircle } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import AIChatCanvas from './AIChatCanvas';
import {
  FreePlace,
  searchLocationFree,
  fetchNearbyAttractionsFree,
  fetchNearbyAmenitiesFree,
} from '../utils/freeApi';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MOBILE_BREAKPOINT = 640;
const DESKTOP_SIDEBAR_BREAKPOINT = 600;

const POPULAR_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { name: 'London, UK', lat: 51.5074, lng: -0.1278 },
  { name: 'New York City, New York', lat: 40.7128, lng: -74.0060 },
  { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093 },
  { name: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
  { name: 'Barcelona, Spain', lat: 41.3851, lng: 2.1734 },
  { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Los Angeles, USA', lat: 34.0522, lng: -118.2437 },
  { name: 'Berlin, Germany', lat: 52.5200, lng: 13.4050 },
  { name: 'Bangkok, Thailand', lat: 13.7563, lng: 100.5018 },
  { name: 'Istanbul, Turkey', lat: 41.0082, lng: 28.9784 },
  { name: 'Seoul, South Korea', lat: 37.5665, lng: 126.9780 },
  { name: 'San Francisco, California', lat: 37.7749, lng: -122.4194 },
];

const QUICK_CITIES: { label: string; search: string }[] = [
  { label: 'Paris', search: 'Paris' },
  { label: 'London', search: 'London' },
  { label: 'NYC', search: 'New York' },
  { label: 'Tokyo', search: 'Tokyo' },
  { label: 'SF', search: 'San Francisco' },
];

type Tab = 'search' | 'saved' | 'trip';
type TripSubTab = 'itinerary' | 'reservations' | 'checklists' | 'budget';
type PlaceType = 'tourist_attraction' | 'museum' | 'park' | 'restaurant' | 'cafe';

const MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-white fill-current"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;

function markerColor(selected: boolean, inItinerary: boolean, isTripPlace?: boolean): string {
  if (selected) return 'bg-rose-500 scale-125 z-50 ring-4 ring-rose-500/20';
  if (isTripPlace) return 'bg-indigo-600 ring-2 ring-indigo-300';
  if (inItinerary) return 'bg-amber-500';
  return 'bg-slate-500';
}

export default function MapComponent() {
  const [places, setPlaces] = useState<FreePlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<FreePlace | null>(null);
  const [selectedType, setSelectedType] = useState<PlaceType>('tourist_attraction');
  const [itinerary, setItinerary] = useState<FreePlace[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [citySearch, setCitySearch] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= DESKTOP_SIDEBAR_BREAKPOINT);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- TRIPS STATE ---
  const [trips, setTrips] = useState<any[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [tripSummary, setTripSummary] = useState<any | null>(null);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [tripSubTab, setTripSubTab] = useState<TripSubTab>('itinerary');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Trip Form fields
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const placesRef = useRef(places);
  const loadingRef = useRef(loading);
  const itineraryRef = useRef(itinerary);
  const hasSearchedRef = useRef(false);
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );

  useEffect(() => { placesRef.current = places; }, [places]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { itineraryRef.current = itinerary; }, [itinerary]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Load trips list on mount
  const fetchTripsList = async () => {
    try {
      const res = await fetch('/api/trips');
      if (res.ok) {
        const data = await res.json();
        setTrips(data.trips || []);
      }
    } catch (e) {
      console.error('Error fetching trips list:', e);
    }
  };

  useEffect(() => {
    fetchTripsList();

    const handlePanTo = (e: Event) => {
      const customEvent = e as CustomEvent<{ lat: number; lng: number; title: string }>;
      const { lat, lng, title } = customEvent.detail;
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lng, lat], zoom: 15 });
      }
      setSelectedPlace({
        id: `pan-${Date.now()}`,
        displayName: title,
        formattedAddress: '',
        location: { lat, lng },
      });
    };

    window.addEventListener('map-pan-to', handlePanTo);
    return () => {
      window.removeEventListener('map-pan-to', handlePanTo);
    };
  }, []);

  // Fetch trip details
  const fetchTripDetails = async (id: number) => {
    try {
      const res = await fetch(`/api/trips/${id}/summary`);
      if (res.ok) {
        const data = await res.json();
        setTripSummary(data);
        // Set first day as active if none selected or invalid
        if (data.days && data.days.length > 0) {
          const exists = data.days.some((d: any) => d.id === activeDayId);
          if (!exists) {
            setActiveDayId(data.days[0].id);
          }
        }
      }
    } catch (e) {
      console.error('Error loading trip summary:', e);
    }
  };

  useEffect(() => {
    if (selectedTripId) {
      fetchTripDetails(selectedTripId);
      setActiveTab('trip');
    } else {
      setTripSummary(null);
      setActiveDayId(null);
    }
  }, [selectedTripId]);

  // Draw routes and markers
  const syncMapFeatures = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Gather list of places to map
    const activeTripPlaces = tripSummary?.places || [];
    const pool = new Map<string, { id: string; name: string; lat: number; lng: number }>();
    
    // Legacy saved list
    for (const p of itinerary) {
      pool.set(p.id, { id: p.id, name: p.displayName, lat: p.location.lat, lng: p.location.lng });
    }
    // Search list
    for (const p of places) {
      pool.set(p.id, { id: p.id, name: p.displayName, lat: p.location.lat, lng: p.location.lng });
    }
    // Trip pool places
    for (const p of activeTripPlaces) {
      if (p.lat != null && p.lng != null) {
        pool.set(`trip-${p.id}`, { id: `trip-${p.id}`, name: p.name, lat: p.lat, lng: p.lng });
      }
    }

    // Clean old markers
    for (const [id, marker] of markersRef.current) {
      if (!pool.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Draw markers
    for (const entry of pool.values()) {
      const idStr = entry.id;
      const isTripPlace = idStr.startsWith('trip-');
      const realId = isTripPlace ? idStr.substring(5) : idStr;
      
      const isSelected = selectedPlace?.id === realId;
      const isInItinerary = isTripPlace ? false : itinerary.some((p) => p.id === realId);

      const existingMarker = markersRef.current.get(idStr);
      if (existingMarker) {
        const el = existingMarker.getElement();
        el.className = `maplibregl-marker p-2 rounded-full border-2 border-white shadow-lg transition-all cursor-pointer ${markerColor(isSelected, isInItinerary, isTripPlace)}`;
        continue;
      }

      const el = document.createElement('div');
      el.className = `maplibregl-marker p-2 rounded-full border-2 border-white shadow-lg transition-all cursor-pointer ${markerColor(isSelected, isInItinerary, isTripPlace)}`;
      el.innerHTML = MARKER_SVG;
      el.addEventListener('click', () => {
        if (isTripPlace) {
          const item = activeTripPlaces.find((x: any) => String(x.id) === realId);
          if (item) {
            setSelectedPlace({
              id: String(item.id),
              displayName: item.name,
              formattedAddress: item.address || '',
              description: item.description,
              location: { lat: item.lat!, lng: item.lng! },
              price: item.price != null ? String(item.price) : undefined,
              imageUrl: item.image_url,
            });
          }
        } else {
          const searchPlace = places.find(p => p.id === realId) || itinerary.find(p => p.id === realId);
          if (searchPlace) setSelectedPlace(searchPlace);
        }
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([entry.lng, entry.lat])
        .addTo(map);
      markersRef.current.set(idStr, marker);
    }

    // Draw route line
    const dayData = tripSummary?.days?.find((d: any) => d.id === activeDayId);
    const dayAssignments = dayData?.assignments || [];
    const routeCoords = dayAssignments
      .filter((a: any) => a.place && a.place.lat != null && a.place.lng != null)
      .map((a: any) => [Number(a.place.lng), Number(a.place.lat)]);

    const source = map.getSource('route') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeCoords.length > 1 ? routeCoords : [],
        },
      });
    }
  }, [places, itinerary, selectedPlace, tripSummary, activeDayId]);

  useEffect(() => {
    syncMapFeatures();
  }, [syncMapFeatures]);

  const performSearch = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    setLoading(true);
    hasSearchedRef.current = true;
    const { lat, lng } = map.getCenter();
    try {
      let results: FreePlace[] = [];
      if (selectedType === 'tourist_attraction' || selectedType === 'museum') {
        results = await fetchNearbyAttractionsFree(lat, lng);
        if (selectedType === 'museum') {
          results = results.filter(
            (p) =>
              p.displayName.toLowerCase().includes('museum') ||
              p.description?.toLowerCase().includes('museum'),
          );
        }
        if (results.length < 5) {
          const extra = await fetchNearbyAmenitiesFree(lat, lng, selectedType);
          const seen = new Set(results.map((r) => r.displayName.toLowerCase()));
          for (const item of extra) {
            if (!seen.has(item.displayName.toLowerCase())) {
              results.push(item);
              seen.add(item.displayName.toLowerCase());
            }
          }
        }
      } else {
        results = await fetchNearbyAmenitiesFree(lat, lng, selectedType);
      }
      setPlaces(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  const performSearchRef = useRef(performSearch);
  useEffect(() => {
    performSearchRef.current = performSearch;
  }, [performSearch]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: LIBERTY_STYLE_URL,
      center: [2.3522, 48.8566],
      zoom: 13,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.on('load', () => {
      // Add routes source and layers
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#6366f1',
          'line-width': 5,
          'line-opacity': 0.8,
        },
      });
    });

    const handleIdle = () => {
      if (!hasSearchedRef.current && !loadingRef.current) {
        performSearchRef.current();
      }
    };
    map.on('idle', handleIdle);

    return () => {
      map.off('idle', handleIdle);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      performSearch();
    }
  }, [selectedType, performSearch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply3DVisibility = () => {
      if (!map.getLayer('3d-buildings')) return;
      map.setLayoutProperty('3d-buildings', 'visibility', is3D ? 'visible' : 'none');
    };

    const handleStyleLoad = () => {
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'openmaptiles',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#e2e8f0',
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              15.05, ['get', 'render_height'],
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              15, 0,
              15.05, ['get', 'render_min_height'],
            ],
            'fill-extrusion-opacity': 0.75,
          },
        });
      }
      apply3DVisibility();
    };

    if (map.isStyleLoaded()) {
      handleStyleLoad();
    } else {
      map.on('style.load', handleStyleLoad);
    }
  }, [is3D]);

  const handlePlaceClick = (place: FreePlace) => {
    setSelectedPlace(place);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [place.location.lng, place.location.lat], zoom: 15 });
    }
  };

  const addToItinerary = (place: FreePlace) => {
    if (!itinerary.some((p) => p.id === place.id)) {
      setItinerary([...itinerary, place]);
    }
  };

  const removeFromItinerary = (id: string) => {
    setItinerary(itinerary.filter((p) => p.id !== id));
  };

  const handleCitySearchSubmit = async () => {
    if (!citySearch.trim()) return;
    const res = await searchLocationFree(citySearch);
    if (res && mapRef.current) {
      mapRef.current.flyTo({ center: [res.lng, res.lat], zoom: 12 });
      hasSearchedRef.current = false;
    }
  };

  const handleCitySelect = async (name: string) => {
    setCitySearch(name);
    const res = await searchLocationFree(name);
    if (res && mapRef.current) {
      mapRef.current.flyTo({ center: [res.lng, res.lat], zoom: 12 });
      hasSearchedRef.current = false;
    }
  };

  // --- TRIP ACTIONS ---
  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDesc,
          start_date: formStart || undefined,
          end_date: formEnd || undefined,
          currency: formCurrency,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchTripsList();
        setSelectedTripId(data.trip.id);
        setShowCreateForm(false);
        setFormTitle('');
        setFormDesc('');
        setFormStart('');
        setFormEnd('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTrip = async (id: number) => {
    if (!confirm('Are you sure you want to delete this trip plan?')) return;
    try {
      const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedTripId(null);
        fetchTripsList();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const savePlaceToTripPool = async (place: FreePlace) => {
    if (!selectedTripId) return;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: { role: 'user', parts: [{ text: `Create place named "${place.displayName}" at address "${place.formattedAddress}" with coordinates lat ${place.location.lat} lng ${place.location.lng} and google_place_id "${place.id}"` }] },
          tripId: selectedTripId,
          model: 'gemini-2.5-flash',
        }),
      });
      if (res.ok) {
        fetchTripDetails(selectedTripId);
        alert('Place saved to Trip Pool!');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const assignPlaceToDayId = async (placeId: number, dayId: number) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: { role: 'user', parts: [{ text: `Assign place ID ${placeId} to day ID ${dayId}` }] },
          tripId: selectedTripId,
          model: 'gemini-2.5-flash',
        }),
      });
      if (res.ok) {
        fetchTripDetails(selectedTripId!);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const togglePackingCheckbox = async (itemId: number, checked: boolean) => {
    try {
      const res = await fetch(`/api/packing/${itemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: selectedTripId, checked }),
      });
      if (res.ok) {
        fetchTripDetails(selectedTripId!);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTodoCheckbox = async (todoId: number, checked: boolean) => {
    try {
      const res = await fetch(`/api/todo/${todoId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: selectedTripId, checked }),
      });
      if (res.ok) {
        fetchTripDetails(selectedTripId!);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950 text-slate-100 font-sans relative">
      
      {/* BACKGROUND LIQUID GLOW BLOBS */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/20 blur-[120px] pointer-events-none z-0 animate-float-slow" />
      <div className="absolute bottom-[-10%] left-[20%] w-[45%] h-[45%] rounded-full bg-violet-600/15 blur-[100px] pointer-events-none z-0 animate-float-slower" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-rose-500/10 blur-[130px] pointer-events-none z-0 animate-float-slow" />
      
      {/* SIDEBAR */}
      <motion.div
        animate={{ width: isSidebarOpen ? (windowWidth < MOBILE_BREAKPOINT ? '100%' : '420px') : '0px' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-full border-r border-slate-800/40 bg-slate-950/45 backdrop-blur-xl flex flex-col z-20 shrink-0 relative overflow-hidden shadow-[8px_0_32px_-12px_rgba(0,0,0,0.5)]"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/30 flex items-center justify-between bg-slate-950/20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-[0_4px_20px_rgba(99,102,241,0.3)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="white" opacity="0.9"/>
                <path d="M8 12.5l2.5-2 2 1.5 3-3.5" stroke="url(#pinGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <defs>
                  <linearGradient id="pinGrad" x1="9" y1="9" x2="15" y2="13" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818cf8"/>
                    <stop offset="1" stopColor="#a78bfa"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <h1 className="font-extrabold text-sm uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-300">Trip Planner</h1>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="sm:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TOP LEVEL TRIP SELECTOR */}
        <div className="p-4 border-b border-slate-800/30 space-y-2 bg-slate-950/15">
          <label className="text-[10px] uppercase font-black tracking-wider text-indigo-400/80">Active Trip Plan</label>
          <div className="flex gap-2">
            <select
              aria-label="Active trip selector"
              value={selectedTripId || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'create') {
                  setShowCreateForm(true);
                } else if (val === '') {
                  setSelectedTripId(null);
                } else {
                  setSelectedTripId(Number(val));
                }
              }}
              className="flex-1 p-2.5 rounded-xl text-xs font-bold border border-white/5 bg-white/5 backdrop-blur-md text-white outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/30 hover:bg-white/10 transition-all duration-300"
            >
              <option value="" className="bg-slate-950">Legacy Local Mode (No Trip)</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id} className="bg-slate-950">{t.title}</option>
              ))}
              <option value="create" className="bg-slate-950 font-bold text-indigo-400">+ Create New Trip Plan...</option>
            </select>
            {selectedTripId && (
              <button
                onClick={() => handleDeleteTrip(selectedTripId)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-rose-400 border border-white/5 bg-white/5 hover:bg-rose-950/30 hover:border-rose-500/30 transition-all duration-300"
                title="Delete Trip"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* CREATE TRIP DIALOG */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-slate-800/30 bg-slate-950/20 p-4 space-y-3"
            >
              <h3 className="font-bold text-xs uppercase text-indigo-400 tracking-wider">Initialize Trip</h3>
              <form onSubmit={handleCreateTrip} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Trip Title (e.g. Rome 2026)"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-300"
                  required
                />
                <input
                  type="text"
                  placeholder="Short Description"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-300"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={formStart}
                    aria-label="Start date"
                    onChange={(e) => setFormStart(e.target.value)}
                    className="p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-slate-100 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-300"
                  />
                  <input
                    type="date"
                    value={formEnd}
                    aria-label="End date"
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-slate-100 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-300"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Currency (e.g. USD)"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    className="w-20 p-2.5 rounded-xl text-xs bg-white/5 border border-white/5 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-300 text-center"
                  />
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold transition-all duration-300 shadow-[0_4px_12px_rgba(99,102,241,0.2)]"
                  >
                    Confirm & Seed
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TABS HEADER */}
        <div className="p-3 bg-slate-950/20 border-b border-slate-800/30 flex gap-1.5">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 border ${
              activeTab === 'search'
                ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(99,102,241,0.25)] border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Discover
          </button>
          
          {selectedTripId ? (
            <button
              onClick={() => setActiveTab('trip')}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 border ${
                activeTab === 'trip'
                  ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(99,102,241,0.25)] border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Planner Board
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('saved')}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 border ${
                activeTab === 'saved'
                  ? 'bg-indigo-600 text-white shadow-[0_4px_15px_rgba(99,102,241,0.25)] border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Saved ({itinerary.length})
            </button>
          )}
        </div>

        {/* SIDEBAR INNER */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-950/5">

          {/* DISCOVER TAB */}
          {activeTab === 'search' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-800/30 bg-slate-950/10 space-y-2.5">
                <input
                  type="text"
                  list="city-options"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCitySearchSubmit()}
                  onBlur={handleCitySearchSubmit}
                  placeholder="Type city & press Enter..."
                  aria-label="Search for a city"
                  className="w-full p-2.5 rounded-xl text-xs outline-none bg-white/5 border border-white/5 text-slate-100 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-500 transition-all duration-300"
                />
                <datalist id="city-options">
                  {POPULAR_CITIES.map((city) => <option key={city.name} value={city.name} />)}
                </datalist>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CITIES.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => handleCitySelect(q.search)}
                      className="text-[10px] px-2.5 py-1 rounded-lg transition-colors font-semibold bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 border-b border-slate-800/30 bg-slate-950/5">
                <select
                  aria-label="Nearby filter category"
                  className="w-full p-2.5 rounded-xl border border-white/5 text-xs outline-none cursor-pointer bg-white/5 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 hover:bg-white/10 transition-all duration-300"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value as PlaceType);
                    setSelectedPlace(null);
                    hasSearchedRef.current = false;
                  }}
                >
                  <option value="tourist_attraction" className="bg-slate-950">Tourist Attractions</option>
                  <option value="museum" className="bg-slate-950">Museums</option>
                  <option value="park" className="bg-slate-950">Parks</option>
                  <option value="restaurant" className="bg-slate-950">Restaurants</option>
                  <option value="cafe" className="bg-slate-950">Cafes</option>
                </select>
              </div>

              {/* Places List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
                    <span className="text-xs">Exploring nearby attractions...</span>
                  </div>
                ) : places.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    No places found. Use search to center the map.
                  </div>
                ) : (
                  places.map((place) => {
                    const isSelected = selectedPlace?.id === place.id;
                    const isInItinerary = itinerary.some((p) => p.id === place.id);
                    return (
                      <div
                        key={place.id}
                        onClick={() => handlePlaceClick(place)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-300 flex flex-col gap-2.5 ${
                          isSelected
                            ? 'bg-indigo-950/30 border-indigo-500/60 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.4)] backdrop-blur-md'
                            : 'bg-slate-950/25 border-white/5 hover:border-indigo-500/30 hover:bg-slate-950/45 hover:shadow-lg'
                        }`}
                      >
                        {place.imageUrl && (
                          <div className="w-full h-28 overflow-hidden rounded-xl bg-slate-950/40 border border-white/5">
                            <img src={place.imageUrl} alt={place.displayName} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-xs text-slate-100 truncate">{place.displayName}</h4>
                            <span className="text-[10px] text-slate-400 block mt-0.5 truncate">{place.formattedAddress}</span>
                          </div>
                          {place.rating && (
                            <div className="flex items-center gap-0.5 text-xs text-amber-500 font-extrabold shrink-0 px-2 py-0.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                              <span>★</span>
                              <span>{place.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{place.description}</p>
                        <div className="flex gap-2 mt-1">
                          {selectedTripId ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                savePlaceToTripPool(place);
                              }}
                              className="flex-1 py-1.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[10px] flex items-center justify-center gap-1.5 transition-all duration-300 shadow-[0_2px_8px_rgba(99,102,241,0.2)]"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              Save to Trip Pool
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isInItinerary) removeFromItinerary(place.id);
                                else addToItinerary(place);
                              }}
                              className={`flex-1 py-1.5 px-3.5 rounded-xl font-extrabold text-[10px] transition-all duration-300 flex items-center justify-center gap-1.5 border ${
                                isInItinerary ? 'bg-amber-500 text-white border-amber-400/20 shadow-[0_2px_8px_rgba(245,158,11,0.2)]' : 'bg-white/5 text-slate-300 hover:bg-white/10 border-white/5'
                              }`}
                            >
                              <Star className={`w-3.5 h-3.5 ${isInItinerary ? 'fill-current' : ''}`} />
                              <span>{isInItinerary ? 'Saved' : 'Save'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* LEGACY SAVED TAB */}
          {activeTab === 'saved' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {itinerary.length === 0 ? (
                <div className="text-center py-12">
                  <Star className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Your legacy saved list is empty.</p>
                </div>
              ) : (
                itinerary.map((place) => (
                  <div
                    key={place.id}
                    onClick={() => handlePlaceClick(place)}
                    className="p-3 bg-slate-950/20 hover:bg-slate-950/40 border border-white/5 hover:border-indigo-500/30 rounded-xl relative cursor-pointer transition-all duration-300"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromItinerary(place.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <h4 className="font-bold text-xs text-slate-100 pr-8 truncate">{place.displayName}</h4>
                    <span className="text-[9px] text-slate-400 block mt-0.5 truncate">{place.formattedAddress}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TRIP PLANNER BOARD TAB */}
          {activeTab === 'trip' && selectedTripId && tripSummary && (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* SUB TABS */}
              <div className="flex border-b border-slate-800/30 bg-slate-950/20 text-[10px] font-extrabold text-slate-400">
                <button
                  onClick={() => setTripSubTab('itinerary')}
                  className={`flex-1 py-2.5 border-b-2 flex flex-col items-center gap-1 transition-all duration-300 ${
                    tripSubTab === 'itinerary'
                      ? 'border-indigo-500 text-indigo-400 bg-white/5'
                      : 'border-transparent hover:text-slate-200 hover:bg-white/2'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Itinerary
                </button>
                <button
                  onClick={() => setTripSubTab('reservations')}
                  className={`flex-1 py-2.5 border-b-2 flex flex-col items-center gap-1 transition-all duration-300 ${
                    tripSubTab === 'reservations'
                      ? 'border-indigo-500 text-indigo-400 bg-white/5'
                      : 'border-transparent hover:text-slate-200 hover:bg-white/2'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Bookings
                </button>
                <button
                  onClick={() => setTripSubTab('checklists')}
                  className={`flex-1 py-2.5 border-b-2 flex flex-col items-center gap-1 transition-all duration-300 ${
                    tripSubTab === 'checklists'
                      ? 'border-indigo-500 text-indigo-400 bg-white/5'
                      : 'border-transparent hover:text-slate-200 hover:bg-white/2'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Checklist
                </button>
                <button
                  onClick={() => setTripSubTab('budget')}
                  className={`flex-1 py-2.5 border-b-2 flex flex-col items-center gap-1 transition-all duration-300 ${
                    tripSubTab === 'budget'
                      ? 'border-indigo-500 text-indigo-400 bg-white/5'
                      : 'border-transparent hover:text-slate-200 hover:bg-white/2'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Budget
                </button>
              </div>

              {/* SUB TAB VIEWS */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-950/5">
                
                {/* 1. ITINERARY VIEW */}
                {tripSubTab === 'itinerary' && (
                  <div className="space-y-4">
                    {/* Days selector */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                      {tripSummary.days?.map((day: any) => (
                        <button
                          key={day.id}
                          onClick={() => setActiveDayId(day.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all duration-300 border ${
                            activeDayId === day.id
                              ? 'bg-indigo-600 text-white border-indigo-500/30 shadow-[0_2px_10px_rgba(99,102,241,0.2)]'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border-white/5'
                          }`}
                        >
                          Day {day.day_number}
                        </button>
                      ))}
                    </div>

                    {/* Active Day Assignments */}
                    {(() => {
                      const activeDay = tripSummary.days?.find((d: any) => d.id === activeDayId);
                      if (!activeDay) return <div className="text-slate-500 text-xs py-4 text-center">No days configured.</div>;
                      
                      return (
                        <div className="space-y-3">
                          <div className="p-3.5 bg-slate-950/20 backdrop-blur-md rounded-xl border border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">{activeDay.title || `Day ${activeDay.day_number}`}</span>
                            <span className="text-[10px] text-slate-400">{activeDay.date}</span>
                          </div>

                          <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                            {activeDay.assignments?.length === 0 ? (
                              <div className="text-slate-500 text-[11px] py-4">No places scheduled for this day yet. Ask the AI chat to add activities!</div>
                            ) : (
                              activeDay.assignments.map((ass: any) => {
                                const place = ass.place;
                                if (!place) return null;
                                return (
                                  <div key={ass.id} className="relative group">
                                    <div className="absolute -left-4 top-1.5 w-3 h-3 bg-indigo-500 rounded-full border-2 border-indigo-300/30 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                                    <div className="p-3.5 rounded-2xl bg-slate-950/15 border border-white/5 hover:border-indigo-500/20 hover:bg-slate-950/25 transition-all duration-300 flex flex-col gap-1.5">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          {ass.place_time && (
                                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider block">{ass.place_time}</span>
                                          )}
                                          <h5
                                            onClick={() => handlePlaceClick({
                                              id: String(place.id),
                                              displayName: place.name,
                                              formattedAddress: place.address || '',
                                              description: place.description,
                                              location: { lat: place.lat!, lng: place.lng! },
                                              imageUrl: place.image_url,
                                            })}
                                            className="font-bold text-xs text-white hover:underline cursor-pointer"
                                          >
                                            {place.name}
                                          </h5>
                                        </div>
                                      </div>
                                      {ass.notes && <p className="text-[10px] text-slate-400 italic">“{ass.notes}”</p>}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Unassigned Pool places */}
                          <div className="pt-4 border-t border-white/5 space-y-2">
                            <h4 className="text-[10px] uppercase tracking-wider font-black text-indigo-400/80">Trip Place Pool</h4>
                            {tripSummary.places?.length === 0 ? (
                              <div className="text-slate-500 text-[11px] py-2">Trip pool is empty. Search attractions & save to trip pool.</div>
                            ) : (
                              <div className="grid grid-cols-1 gap-2">
                                {tripSummary.places.map((place: any) => {
                                  // Check if already assigned to any day
                                  const isAssigned = tripSummary.days.some((d: any) => 
                                    d.assignments?.some((a: any) => a.place_id === place.id)
                                  );
                                  
                                  return (
                                    <div key={place.id} className="p-2.5 rounded-xl bg-slate-950/15 border border-white/5 flex items-center justify-between hover:bg-slate-950/25 transition-colors duration-300">
                                      <div
                                        onClick={() => {
                                          if (place.lat != null && place.lng != null) {
                                            handlePlaceClick({
                                              id: String(place.id),
                                              displayName: place.name,
                                              formattedAddress: place.address || '',
                                              description: place.description,
                                              location: { lat: place.lat, lng: place.lng },
                                              imageUrl: place.image_url,
                                            });
                                          }
                                        }}
                                        className="cursor-pointer hover:underline min-w-0 flex-1 mr-2"
                                      >
                                        <span className="font-bold text-xs block text-slate-200 truncate">{place.name}</span>
                                        <span className="text-[9px] text-slate-400 block truncate">{place.address}</span>
                                      </div>
                                      {!isAssigned ? (
                                        <button
                                          onClick={() => assignPlaceToDayId(place.id, activeDayId!)}
                                          className="text-[9px] font-extrabold px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 shadow-[0_2px_8px_rgba(99,102,241,0.2)] transition-all duration-300"
                                        >
                                          + Schedule
                                        </button>
                                      ) : (
                                        <span className="text-[9px] text-slate-500 px-2 font-bold shrink-0">Scheduled</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 2. BOOKINGS VIEW */}
                {tripSubTab === 'reservations' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Reservations & Bookings</h3>
                    {tripSummary.reservations?.length === 0 ? (
                      <div className="text-slate-500 text-xs py-8 text-center bg-slate-950/25 rounded-2xl border border-white/5">
                        No reservations recorded yet. Ask the AI chat to book flights or hotels.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {tripSummary.reservations.map((res: any) => (
                          <div key={res.id} className="p-3.5 bg-slate-950/20 border border-white/5 rounded-2xl space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                                {res.type}
                              </span>
                              {res.price != null && (
                                <span className="text-[10px] font-extrabold text-slate-200">{res.price} {tripSummary.trip?.currency}</span>
                              )}
                            </div>
                            <h4 className="font-bold text-xs text-white">{res.title}</h4>
                            {res.location && <p className="text-[10px] text-slate-400">{res.location}</p>}
                            {res.confirmation_number && (
                              <p className="text-[9px] font-mono text-indigo-300 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded-lg w-max">
                                Conf: {res.confirmation_number}
                              </p>
                            )}
                            {res.notes && <p className="text-[10px] text-slate-400 border-l-2 border-indigo-500/30 pl-2 mt-1.5">{res.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. CHECKLISTS VIEW */}
                {tripSubTab === 'checklists' && (
                  <div className="space-y-6">
                    {/* Packing items */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">🎒 Packing List</h4>
                      {tripSummary.packing?.length === 0 ? (
                        <div className="text-slate-500 text-[11px] py-4 italic bg-slate-950/15 border border-white/5 p-3 rounded-2xl text-center">No packing items. Type "add raincoat to packing list" in the chat.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {tripSummary.packing.map((item: any) => (
                            <label key={item.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950/15 border border-white/5 hover:bg-white/5 hover:border-indigo-500/20 cursor-pointer transition-all duration-300">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) => togglePackingCheckbox(item.id, e.target.checked)}
                                className="rounded-lg border-white/10 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4"
                              />
                              <span className={`text-xs ${item.checked ? 'line-through text-slate-500' : 'text-slate-200'}`}>{item.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Todos */}
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">☑ Planning Tasks</h4>
                      {tripSummary.todos?.length === 0 ? (
                        <div className="text-slate-500 text-[11px] py-4 italic bg-slate-950/15 border border-white/5 p-3 rounded-2xl text-center">No tasks. Tell the AI to create planning tasks.</div>
                      ) : (
                        <div className="space-y-1.5">
                          {tripSummary.todos.map((todo: any) => (
                            <label key={todo.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950/15 border border-white/5 hover:bg-white/5 hover:border-indigo-500/20 cursor-pointer transition-all duration-300">
                              <input
                                type="checkbox"
                                checked={todo.checked}
                                onChange={(e) => toggleTodoCheckbox(todo.id, e.target.checked)}
                                className="rounded-lg border-white/10 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4"
                              />
                              <span className={`text-xs ${todo.checked ? 'line-through text-slate-500' : 'text-slate-200'}`}>{todo.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. BUDGET VIEW */}
                {tripSubTab === 'budget' && (
                  <div className="space-y-4">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/30 to-violet-950/30 border border-indigo-500/15 text-center space-y-1 shadow-[0_8px_32px_rgba(99,102,241,0.1)] backdrop-blur-md">
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Total Spend Summary</span>
                      <h3 className="text-xl font-black text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300">
                        {tripSummary.budget?.reduce((sum: number, b: any) => sum + b.total_price, 0).toFixed(2)}{' '}
                        {tripSummary.trip?.currency || 'USD'}
                      </h3>
                    </div>

                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Expense Breakdown</h4>
                      {tripSummary.budget?.length === 0 ? (
                        <div className="text-slate-500 text-xs py-6 text-center bg-slate-950/25 rounded-2xl border border-white/5">No expenses logged. Ask the AI to record entry prices or reservations.</div>
                      ) : (
                        tripSummary.budget.map((b: any) => (
                          <div key={b.id} className="p-3 rounded-2xl bg-slate-950/15 border border-white/5 flex items-center justify-between hover:bg-slate-950/25 transition-all duration-300">
                            <div>
                              <span className="font-bold text-xs text-slate-200 block">{b.name}</span>
                              <span className="text-[9px] text-slate-400">{b.category}</span>
                            </div>
                            <span className="text-xs font-black text-indigo-400 font-mono">
                              +{b.total_price.toFixed(2)} {tripSummary.trip?.currency}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>
      </motion.div>

      {/* MAP WRAPPER */}
      <div className="flex-1 h-full relative z-10">
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setIsSidebarOpen((s) => !s)}
          className="absolute top-4 left-4 p-3.5 rounded-full bg-slate-950/40 backdrop-blur-md border border-white/5 text-white z-10 shadow-xl hover:bg-white/10 transition-all duration-300"
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Map Container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Map Utilities (3D Toggle) */}
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
          <button
            onClick={() => setIs3D((v) => !v)}
            className={`px-4 py-2.5 rounded-full font-extrabold text-xs shadow-xl border backdrop-blur-md transition-all duration-300 ${
              is3D
                ? 'bg-indigo-600 border-indigo-400/20 text-white shadow-[0_4px_15px_rgba(99,102,241,0.3)]'
                : 'bg-slate-950/40 border-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            3D View: {is3D ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Chat Toggle & Canvas Overlay */}
        <div className="absolute bottom-6 right-4 sm:right-8 z-30 flex flex-col items-end gap-4">
          <AIChatCanvas
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            activeTripId={selectedTripId || undefined}
            onTripUpdated={() => {
              if (selectedTripId) {
                fetchTripDetails(selectedTripId);
                fetchTripsList();
              }
            }}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsChatOpen((s) => !s)}
            className={`p-4 rounded-full shadow-[0_8px_32px_rgba(99,102,241,0.3)] border flex items-center justify-center transition-all duration-300 ${
              isChatOpen
                ? 'bg-slate-950/40 backdrop-blur-md border-white/5 text-white hover:bg-white/10'
                : 'bg-gradient-to-r from-indigo-500 to-indigo-600 border-indigo-400/20 text-white hover:from-indigo-600 hover:to-indigo-700 hover:shadow-[0_8px_32px_rgba(99,102,241,0.5)]'
            }`}
            aria-label={isChatOpen ? 'Close AI Chat' : 'Open AI Chat'}
          >
            {isChatOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6 animate-pulse" />}
          </motion.button>
        </div>
      </div>

    </div>
  );
}
