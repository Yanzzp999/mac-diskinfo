import { useEffect, useState } from 'react';
import type { DiskDevice } from './shared/types';
import { DiskCard } from './components/DiskCard';
import { HardDrive } from 'lucide-react';

function App() {
  const [devices, setDevices] = useState<DiskDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDisks = async () => {
    setLoading(true);
    try {
      const data = await window.electron.scanDisks();
      setDevices(data);
    } catch (error) {
      console.error('Failed to load disks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDisks();
  }, []);

  return (
    <div className="min-h-screen bg-background text-slate-200">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-white/5 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                DiskInfo
              </h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide">SMART HEALTH MONITOR</p>
            </div>
          </div>
          <button 
            onClick={loadDisks}
            disabled={loading}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="h-28 bg-surface/50 rounded-2xl border border-white/5 animate-pulse"></div>
            ))}
          </div>
        ) : devices.length > 0 ? (
          <div className="space-y-6">
            {devices.map(device => (
              <DiskCard key={device.id} device={device} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto bg-white/5 rounded-2xl flex items-center justify-center mb-6">
              <HardDrive className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-300 mb-2">No Disks Found</h2>
            <p className="text-slate-500">Could not discover any compatible disks on this system.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
