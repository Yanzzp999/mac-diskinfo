import { useCallback, useEffect, useState } from 'react';
import type { DiskDevice, SmartReport } from './shared/types';
import { DiskCard } from './components/DiskCard';
import { SmartDetail } from './components/SmartDetail';
import { HardDrive, RefreshCw } from 'lucide-react';
import appIcon from './assets/app-icon.png';

function getSmartHints(device: DiskDevice) {
  return {
    transport: device.transport,
    isInternal: device.isInternal,
    bridgeChip: device.bridgeChip,
    connectionPath: device.connectionPath,
  };
}

function App() {
  const [devices, setDevices] = useState<DiskDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, SmartReport>>({});
  const [reportLoading, setReportLoading] = useState(false);

  const loadDisks = useCallback(async (isManualRefresh = false) => {
    setLoading(true);
    try {
      const data = await window.electron.scanDisks();
      setDevices(data);
      if (isManualRefresh) {
        setReports({}); // clear cached reports so they get re-fetched and errors reappear
      }
      // Keep the current selection when it still exists after a refresh.
      // If the selected disk disappeared, fall back to the first available disk.
      setSelectedId((prev) => {
        if (prev && data.some((device) => device.id === prev)) {
          return prev;
        }

        return data[0]?.id ?? null;
      });
    } catch (error) {
      console.error('Failed to load disks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSmartReport = useCallback(async (device: DiskDevice) => {
    if (reports[device.id]) return; // Already cached
    setReportLoading(true);
    try {
      const data = await window.electron.getSmartReport(device.id, getSmartHints(device));
      setReports(prev => ({ ...prev, [device.id]: data }));
    } catch (e) {
      console.error(e);
    } finally {
      setReportLoading(false);
    }
  }, [reports]);

  useEffect(() => {
    void loadDisks();
  }, [loadDisks]);

  const selectedDevice = devices.find(d => d.id === selectedId);

  useEffect(() => {
    if (selectedDevice) {
      void loadSmartReport(selectedDevice);
    }
  }, [loadSmartReport, selectedDevice]);

  return (
    <div className="h-screen flex flex-col bg-background text-[#f5f5f7] overflow-hidden">
      <header
        className="flex-shrink-0 bg-sidebar/80 backdrop-blur-xl border-b border-separator z-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <img src={appIcon} alt="mac-diskinfo" className="w-8 h-8 rounded-[7px]" />
            <h1 className="text-[15px] font-semibold text-[#f5f5f7]">
              mac-diskinfo
            </h1>
          </div>
          <button
            onClick={() => loadDisks(true)}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-[#98989d] group-hover:text-[#f5f5f7] transition-colors ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 flex-shrink-0 border-r border-separator bg-sidebar overflow-y-auto p-2 space-y-0.5">
          {loading ? (
            <div className="space-y-1.5 p-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 bg-white/[0.04] rounded-lg animate-pulse"></div>
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
            <div className="text-center py-8 text-[#6e6e73] text-sm">
              <HardDrive className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No disks found</p>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-hidden bg-background">
          {selectedDevice ? (
            <SmartDetail
              key={selectedDevice.id}
              device={selectedDevice}
              report={reports[selectedId!] || null}
              loading={reportLoading && !reports[selectedId!]}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[#6e6e73]">
              <div className="text-center">
                <HardDrive className="w-14 h-14 mx-auto mb-4 opacity-20" />
                <p className="text-base font-medium text-[#a1a1a6]">Select a disk</p>
                <p className="text-sm mt-1">Choose a disk from the sidebar to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
