import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, X, Sparkles, Loader2, Clock, Cpu, MapPin, KeyRound, Settings, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import { fetchPlaceDetailsFree } from '../utils/freeApi';

interface ItineraryItem {
  time: string;
  placeName: string;
  description: string;
  price: string;
}

interface ItineraryDay {
  day: string;
  items: ItineraryItem[];
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
  itinerary?: ItineraryDay[];
}

interface ModelInfo {
  id: string;
  label: string;
}

const MODEL_STORAGE_KEY = 'mtp.selectedModel';
const DEFAULT_MODEL_ID = 'gemini-2.5-flash';
const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B IT' },
];

interface ChatPayload {
  text?: string;
  itinerary?: ItineraryDay[];
}

function extractJsonPayload(raw: string): ChatPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as ChatPayload;
  } catch {
    // fall through to extraction
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      const parsed = JSON.parse(candidate.substring(first, last + 1));
      if (parsed && typeof parsed === 'object') return parsed as ChatPayload;
    } catch {
      // ignore
    }
  }
  return { text: raw };
}

function TimelinePlaceCard({ item }: { item: ItineraryItem }) {
  const [info, setInfo] = useState<{ imageUrl?: string; lat?: number; lng?: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetchPlaceDetailsFree(item.placeName)
      .then((data) => {
        if (active && data) {
          setInfo({ imageUrl: data.imageUrl, lat: data.lat, lng: data.lng });
        }
      })
      .catch((err) => console.error('Error loading place info:', err));
    return () => {
      active = false;
    };
  }, [item.placeName]);

  const handleLocate = () => {
    if (info?.lat != null && info?.lng != null) {
      window.dispatchEvent(
        new CustomEvent('map-pan-to', {
          detail: { lat: info.lat, lng: info.lng, title: item.placeName },
        }),
      );
    }
  };

  return (
    <div className="relative pl-6 pb-6 last:pb-0">
      <div className="absolute left-1.5 top-1.5 bottom-0 w-0.5 bg-white/10 -translate-x-1/2 last:hidden"></div>
      <div className="absolute left-1.5 top-1.5 w-3 h-3 bg-indigo-500 rounded-full border-2 border-indigo-300/30 -translate-x-1/2 z-10 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>

      <div className="bg-slate-950/20 backdrop-blur-md rounded-2xl p-3 shadow-lg border border-white/5 space-y-2.5 hover:border-indigo-500/20 transition-all duration-300">
        {info?.imageUrl && (
          <div className="w-full h-28 overflow-hidden rounded-xl border border-white/5 bg-slate-950/20">
            <img
              src={info.imageUrl}
              alt={item.placeName}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              loading="lazy"
            />
          </div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-black tracking-wider uppercase text-indigo-400">
              {item.time}
            </div>
            <h4 className="text-sm font-bold text-slate-100 mt-0.5">
              {item.placeName}
            </h4>
          </div>
          <div className="text-[10px] font-bold px-2.5 py-1 bg-white/5 rounded-lg text-slate-300 shrink-0 border border-white/5">
            {item.price}
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-snug">{item.description}</p>

        {info?.lat != null && info?.lng != null && (
          <button
            onClick={handleLocate}
            className="flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-400 hover:text-indigo-300 transition-colors pt-1"
          >
            <MapPin className="w-3.5 h-3.5" />
            Locate on Map
          </button>
        )}
      </div>
    </div>
  );
}

function KeySettings({
  hasKey,
  onClose,
  onSaved,
}: {
  hasKey: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server responded ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden border-b border-slate-200/50 dark:border-white/5 bg-slate-50/60 dark:bg-slate-900/60"
    >
      <form onSubmit={save} className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {hasKey ? 'Update Gemini API key' : 'Add a Gemini API key to enable the chat'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600"
            aria-label="Close settings"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="relative">
          <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIzaSy…"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
          >
            Get a key →
          </a>
          <button
            type="submit"
            disabled={!value.trim() || saving}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </button>
        </div>
      </form>
    </motion.div>
  );
}

export default function AIChatCanvas({ isOpen, onClose, activeTripId, onTripUpdated }: { isOpen: boolean; onClose: () => void; activeTripId?: number; onTripUpdated?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      parts: [
        {
          text: "Hello! I'm your AI travel assistant. Where would you like to explore today? I can help you build an itinerary and recommend spots.",
        },
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL_ID;
    return window.localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL_ID;
  });
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/models');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const list = data?.models;
        if (Array.isArray(list) && list.length > 0) {
          setModels(list as ModelInfo[]);
          const defaultId: string = data.defaultModel || DEFAULT_MODEL_ID;
          setSelectedModel((prev) => {
            const exists = (list as ModelInfo[]).some((m) => m.id === prev);
            if (exists) return prev;
            window.localStorage.setItem(MODEL_STORAGE_KEY, defaultId);
            return defaultId;
          });
        }
        if (typeof data?.hasGeminiKey === 'boolean') {
          setHasGeminiKey(data.hasGeminiKey);
          if (!data.hasGeminiKey) setShowSettings(true);
        }
      } catch (err) {
        console.warn('Could not load models from server, using fallback list.', err);
        setHasGeminiKey(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text }] };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map((m) => {
        if (m.role === 'user') {
          return { role: 'user', parts: [{ text: m.parts[0].text }] };
        }
        return {
          role: 'model',
          parts: [
            { text: JSON.stringify({ text: m.parts[0].text, itinerary: m.itinerary ?? [] }) },
          ],
        };
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: { role: 'user', parts: [{ text }] },
          history,
          model: selectedModel,
          tripId: activeTripId,
        }),
      });

      const data = await res.json();
      if (data && data.tripUpdated) {
        onTripUpdated?.();
      }
      if (!res.ok) {
        if (res.status === 400 && /GEMINI_API_KEY/i.test(data.error || '')) {
          setHasGeminiKey(false);
          setShowSettings(true);
        }
        throw new Error(data.error || 'Failed to fetch response');
      }

      const parsed = extractJsonPayload(data.text || '');
      const aiText = parsed.text || "I'm having trouble thinking right now.";
      const itinerary = Array.isArray(parsed.itinerary) ? parsed.itinerary : undefined;

      setMessages((prev) => [
        ...prev,
        { role: 'model', parts: [{ text: aiText }], itinerary },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sorry, I ran into an error processing your request.';
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'model', parts: [{ text: `**Error:** ${message}` }] },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const canSend = Boolean(input.trim()) && !isLoading && hasGeminiKey !== false;
 
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="absolute bottom-24 right-4 sm:right-8 w-[calc(100%-2rem)] sm:w-[400px] h-[550px] max-h-[70vh] z-40 rounded-3xl overflow-hidden flex flex-col shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl bg-slate-950/45 border border-white/10"
        >
          <div className="p-4 flex flex-col gap-3 border-b border-slate-800/30 bg-slate-950/20 bg-gradient-to-r from-indigo-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">Travel AI</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Powered by Gemini</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowSettings((s) => !s)}
                  className={`p-2 rounded-xl transition-colors ${
                    showSettings
                      ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-400'
                      : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                  aria-label="API key settings"
                  aria-pressed={showSettings}
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl hover:bg-white/5 transition-colors text-slate-400 hover:text-slate-200"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
 
            <AnimatePresence>
              {showSettings && (
                <KeySettings
                  hasKey={hasGeminiKey === true}
                  onClose={() => setShowSettings(false)}
                  onSaved={() => setHasGeminiKey(true)}
                />
              )}
            </AnimatePresence>
 
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
                <Cpu className="w-3 h-3" />
                Model
              </div>
              <div className="relative flex-1">
                <select
                  aria-label="Select AI model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoading}
                  className="w-full appearance-none pl-2.5 pr-7 py-1.5 rounded-xl text-xs font-extrabold bg-white/5 border border-white/5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/20 disabled:opacity-60 cursor-pointer hover:bg-white/10 transition-colors duration-300"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-950 text-slate-100">
                      {m.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
 
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-7 h-7 rounded-full bg-white/5 border border-white/5 shrink-0 flex items-center justify-center text-indigo-400 shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
 
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-md ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm border border-indigo-400/20 shadow-[0_2px_10px_rgba(99,102,241,0.2)]'
                      : 'bg-slate-950/20 border border-white/5 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.parts[0].text
                  ) : (
                    <div className="space-y-4">
                      <div className="prose prose-sm dark:prose-invert prose-p:leading-snug prose-p:my-1 prose-ul:my-1 max-w-none">
                        <Markdown>{msg.parts[0].text}</Markdown>
                      </div>
 
                      {msg.itinerary && msg.itinerary.length > 0 && (
                        <div className="block mt-4 space-y-6">
                          {msg.itinerary.map((day, dIdx) => (
                            <div key={dIdx} className="space-y-3">
                              <h3 className="font-extrabold text-slate-200 flex items-center gap-2 text-xs bg-white/5 py-1.5 px-3.5 rounded-xl w-max border border-white/5">
                                <Clock className="w-4 h-4 text-indigo-400" />
                                {day.day}
                              </h3>
                              <div className="ml-1 mt-2 relative">
                                {day.items.map((item, iIdx) => (
                                  <TimelinePlaceCard key={iIdx} item={item} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
 
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/5 shrink-0 flex items-center justify-center text-indigo-400 shadow-md">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-950/20 border border-white/5 rounded-2xl rounded-tl-sm p-3 text-xs flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="text-slate-400 text-xs font-semibold">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} className="h-2" />
          </div>
 
          <div className="p-3 border-t bg-slate-950/20 border-white/5">
            <form onSubmit={handleSend} className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={hasGeminiKey === false ? 'Add a Gemini API key to start…' : 'Ask for recommendations…'}
                className="w-full pl-4 pr-12 py-3 rounded-xl bg-white/5 border border-white/5 focus:border-indigo-500/30 focus:ring-2 focus:ring-indigo-500/20 text-xs text-white placeholder:text-slate-500 disabled:opacity-60 outline-none transition-all duration-300"
                disabled={isLoading || hasGeminiKey === false}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="absolute right-2 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(99,102,241,0.25)]"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
