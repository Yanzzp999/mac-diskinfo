import { useEffect, useState } from 'react';
import type { DiskDevice, SmartReport } from './shared/types';
import { DiskCard } from './components/DiskCard';
import { SmartDetail } from './components/SmartDetail';
import { HardDrive, RefreshCw } from 'lucide-react';
import appIcon from './assets/app-icon.png';

function App() {
  const [devices, setDevices] = useState<DiskDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, SmartReport>>({});
  const [reportLoading, setReportLoading] = useState(false);

  const loadDisks = async (isManualRefresh = false) => {
    setLoading(true);
    try {
      const data = await window.electron.scanDisks();
      setDevices(data);
      if (isManualRefresh) {
        setReports({}); // clear cached reports so they get re-fetched and errors reappear
      }
      // Auto-select first disk
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load disks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSmartReport = async (diskId: string) => {
    if (reports[diskId]) return; // Already cached
    setReportLoading(true);
    try {
      const data = await window.electron.getSmartReport(diskId);
      setReports(prev => ({ ...prev, [diskId]: data }));
    } catch (e) {
      console.error(e);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadDisks();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadSmartReport(selectedId);
    }
  }, [selectedId]);

  const selectedDevice = devices.find(d => d.id === selectedId);

  return (
    <div className="h-screen flex flex-col bg-background text-slate-200 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-background/80 backdrop-blur-md border-b border-white/5 shadow-sm z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={appIcon} alt="mac-diskinfo" className="w-9 h-9 rounded-lg shadow-lg" />
            <div>
              <h1 className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                mac-diskinfo
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Smart Health Monitor</p>
            </div>
          </div>
          <button
            onClick={() => loadDisks(true)}
            disabled={loading}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 group-hover:text-white transition-colors ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Disk List */}
        <aside className="w-72 flex-shrink-0 border-r border-white/5 bg-surface/30 overflow-y-auto p-3 space-y-1">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse"></div>
              ))}
            </div>
          ) : devices.length > 0 ? (
            devices.map(device => (
              <DiskCard
                key={device.id}
                device={device}
                selected={device.id === selectedId}
                onClick={() => setSelectedId(device.id)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              <HardDrive className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No disks found</p>
            </div>
          )}
        </aside>

        {/* Right Panel — Detail View */}
        <main className="flex-1 overflow-hidden bg-background">
          {selectedDevice ? (
            <SmartDetail
              device={selectedDevice}
              report={reports[selectedId!] || null}
              loading={reportLoading && !reports[selectedId!]}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              <div className="text-center">
                <HardDrive className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a disk</p>
                <p className="text-sm mt-1">Choose a disk from the sidebar to view SMART details</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
