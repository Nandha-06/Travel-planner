import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import MapComponent from './components/MapComponent';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <div className="flex-1 relative overflow-hidden">
        <MapComponent />
      </div>
    </div>
  );
}
