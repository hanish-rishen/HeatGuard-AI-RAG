import React, { useState, useRef, useEffect } from 'react';
// import * as Tesseract from 'tesseract.js'; Removed Tesseract

import * as d3 from 'd3';
import {
  Bell,
  Search,
  LayoutDashboard,
  Activity,
  Map as MapIcon,
  FileText,
  Briefcase,
  LifeBuoy,
  PlusCircle,
  MoreVertical,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  UploadCloud,
  Shield,
  Zap,
  BrainCircuit,
  AlertTriangle,
  Send,
  Layers,
  Calendar,
  Locate,
  User,
  Download,
  Filter,
  Trash2,
  Database,
  Bot,
  Sparkles,
  PanelLeft,
  Menu,
  X,
  Thermometer,
  Droplet,
  ScrollText // Added ScrollText icon
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { HeatGuardAPI, DistrictData, AnalysisResponse, DistrictRanking, RankingsResponse, UploadedFile } from '../api';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui';
import { useNavigate } from 'react-router-dom';
import { LogConsole } from '../components/LogConsole';
import { RankingsView } from './RankingsPage';
import { Settings } from 'lucide-react'; // Added Settings import
import ReactMarkdown from 'react-markdown'; // Added markdown support
import { jsPDF } from 'jspdf';
import { ConfirmModal } from '../components/ConfirmModal';
import html2canvas from 'html2canvas';

// --- Types ---

type ViewType = 'dashboard' | 'map' | 'rag' | 'datasources' | 'reports' | 'rankings';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  hasSubmenu?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

interface StatCardProps {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  isIncreaseBad?: boolean;
  progress?: number;
  icon?: React.ReactNode;
  loading?: boolean;
}

interface ActionProtocol {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'In Progress' | 'Completed';
}

// --- Components ---

const Logo = ({ collapsed }: { collapsed: boolean }) => (
  <div className={`flex items-center gap-2 transition-all duration-300 ${collapsed ? 'justify-center w-full' : ''}`}>
    <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-br from-primary to-orange-400 rounded-xl shadow-lg border-2 border-white/20 flex-shrink-0">
      <Shield className="text-primary-foreground absolute w-6 h-6" />
      <Zap className="text-white absolute w-3 h-3 -top-1 -right-1 fill-white" />
    </div>
    <div className={`flex flex-col overflow-hidden transition-all duration-300 ${collapsed ? 'w-0 opacity-0 absolute' : 'w-auto opacity-100'}`}>
      <span className="font-bold text-lg leading-none tracking-tight text-white whitespace-nowrap">HeatGuard<span className="text-primary">AI</span></span>
      <span className="text-[10px] text-gray-400 font-bold tracking-wider whitespace-nowrap">PREDICTIVE RAG</span>
    </div>
  </div>
);

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, hasSubmenu, collapsed, onClick }) => (
  <div
    onClick={onClick}
    className={`
      flex items-center py-2.5 rounded-lg mb-1 cursor-pointer transition-all duration-200 border border-transparent
      ${collapsed ? 'justify-center px-0 w-full' : 'px-3 gap-3'}
      ${active ? 'bg-sidebar-accent/10 text-sidebar-foreground font-semibold border-sidebar-border/30 shadow-sm' : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/5'}
    `}
    title={collapsed ? label : undefined}
  >
    {active && !collapsed && <div className="w-1 h-5 absolute left-2 bg-sidebar-primary rounded-full" />}
    <div className={`${active ? 'text-sidebar-primary' : 'text-sidebar-foreground/80'} flex-shrink-0`}>
      {icon}
    </div>
    <span className={`flex-1 text-sm font-medium whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 overflow-hidden opacity-0 hidden' : 'w-auto opacity-100 block'}`}>
      {label}
    </span>
    {hasSubmenu && !collapsed && <ChevronDown size={14} className="opacity-70" />}
  </div>
);

const StatCard: React.FC<StatCardProps> = ({ title, value, change, trend, isIncreaseBad = false, progress, icon, loading }) => {
  const trendColor = trend === 'up'
    ? (isIncreaseBad ? 'text-red-500' : 'text-emerald-500')
    : (isIncreaseBad ? 'text-emerald-500' : 'text-red-500');

  const IconComponent = icon ? (
    <div className={`p-2.5 rounded-xl ${trendColor.replace('text-', 'bg-')}/10 ${trendColor} mb-3 inline-block shadow-sm`}>
      {React.cloneElement(icon as React.ReactElement, { size: 22, strokeWidth: 2 } as any)}
    </div>
  ) : null;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-all duration-300 hover:border-primary/20 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity transform group-hover:scale-110 duration-700 pointer-events-none">
          {icon && React.cloneElement(icon as React.ReactElement, { size: 140 } as any)}
      </div>

      <div className="flex justify-between items-start mb-2 relative z-10">
        {IconComponent}
        {change && (
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full bg-background/50 border border-border/50 backdrop-blur-sm ${trendColor} flex items-center gap-1`}>
            {trend === 'up' ? '↑' : '↓'} {change}
          </span>
        )}
      </div>

      <div className="relative z-10">
        <h3 className="text-muted-foreground font-semibold text-[11px] uppercase tracking-wider mb-0.5">
            {title}
        </h3>
        <div className="text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-1">
            {loading ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
                value
            )}
        </div>
      </div>

      {(progress !== undefined) && (
        <div className="mt-4 relative z-10">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5 font-medium">
                <span>Safe Zone</span>
                <span className={progress > 70 ? "text-red-500" : "text-primary"}>
                    {progress > 70 ? "Critical" : "Stable"}
                </span>
            </div>
            <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${progress > 80 ? 'bg-red-500' : (progress > 50 ? 'bg-orange-400' : 'bg-emerald-500')}`}
                    style={{ width: `${progress}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                ></div>
            </div>
        </div>
      )}
    </div>
  );
};

const UploadArea = () => (
  <div className="bg-card/50 border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-card/80 transition-colors cursor-pointer group flex flex-col items-center justify-center min-h-[200px]">
    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <UploadCloud className="text-primary" size={32} />
    </div>
    <h4 className="text-base font-semibold text-foreground">Upload Knowledge Base</h4>
    <p className="text-sm text-muted-foreground/80 mt-2 max-w-xs">Drag & drop PDFs, DOCX, or CSV files here to train the RAG model.</p>
    <button className="mt-4 px-4 py-2 bg-card border border-border shadow-3d-sm rounded-lg text-xs font-bold hover:translate-y-[-1px] transition-transform">Browse Files</button>
  </div>
);

// --- Simulation Panel Component ---

interface SimulationPanelProps {
  data: DistrictData;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onRun: () => void;
  loading: boolean;
}

const SimulationPanel: React.FC<SimulationPanelProps> = ({ data, onChange, onRun, loading }) => {
    // Auto-fill district defaults removed as per request for real data only.
    // Users must input specific data or data should be fetched from an API.
    const handleDistrictChange = (val: string) => {
         onChange({ target: { name: 'district_name', value: val } } as any);
         // TODO: reliable fetch for district specifics if available
    };

    return (
  <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d mb-8 relative overflow-hidden">
    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
        <Activity size={200} />
    </div>

    <div className="flex justify-between items-center mb-6 relative z-10">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="text-primary" size={20} />
          Live Risk Simulator
        </h2>
        <p className="text-sm text-muted-foreground/80">Input real-time environmental data.</p>
      </div>
      <button
        onClick={onRun}
        disabled={loading}
        className={`px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl shadow-3d-sm active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
      >
        {loading ? <span className="animate-spin">⌛</span> : <Zap size={18} />}
        {loading ? 'Analyzing...' : 'Run Simulation'}
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">District Name</label>
        <Select
          value={data.district_name}
          onChange={handleDistrictChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select District" value={data.district_name} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Adilabad">Adilabad</SelectItem>
            <SelectItem value="Narmada">Narmada</SelectItem>
            <SelectItem value="Ahmedabad">Ahmedabad</SelectItem>
            <SelectItem value="Hyderabad">Hyderabad</SelectItem>
            <SelectItem value="Karimnagar">Karimnagar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">Max Temp (°C)</label>
        <input
          type="number"
          name="max_temp"
          value={data.max_temp}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">Relative Humidity (%)</label>
        <input
          type="number"
          name="humidity"
          value={data.humidity}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">LST (°C)</label>
        <input
          type="number"
          name="lst"
          value={data.lst}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
             % Children
        </label>
        <input
          type="number"
          name="pct_children"
          value={data.pct_children}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input/50 bg-muted/10 px-3 py-2 text-sm text-muted-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            % Outdoor Workers
        </label>
        <input
          type="number"
          name="pct_outdoor_workers"
          value={data.pct_outdoor_workers}
          onChange={onChange}
           className="flex h-10 w-full rounded-md border border-input/50 bg-muted/10 px-3 py-2 text-sm text-muted-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
            % Vulnerable Social
        </label>
        <input
          type="number"
          name="pct_vulnerable_social"
          value={data.pct_vulnerable_social}
          onChange={onChange}
           className="flex h-10 w-full rounded-md border border-input/50 bg-muted/10 px-3 py-2 text-sm text-muted-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">Date</label>
        <input
          type="date"
          name="date"
          value={data.date}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  </div>
);
};

// --- D3.js India Map Component ---
interface IndiaMapUIProps {
  simplified?: boolean;
  data?: DistrictRanking[];
}

const IndiaMapUI: React.FC<{ rankings: DistrictRanking[]; simplified?: boolean }> = ({ rankings, simplified = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const transformRef = useRef<any>(d3.zoomIdentity);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected pin anchor (screen-space) so we can initially place the floating card near the dot.
  const [pinAnchor, setPinAnchor] = useState<{ left: number; top: number } | null>(null);

  // Floating (draggable) card position within the map container.
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const draggingRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  // Real AI recommendation for the currently selected district
  const [aiAdvice, setAiAdvice] = useState<string>('');
  const [aiAdviceLoading, setAiAdviceLoading] = useState<boolean>(false);
  const [aiAdviceError, setAiAdviceError] = useState<string | null>(null);
  const [aiAdviceModalOpen, setAiAdviceModalOpen] = useState<boolean>(false);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDistricts, setFilteredDistricts] = useState<DistrictRanking[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictRanking | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!selectedDistrict || simplified) return;

      setAiAdviceLoading(true);
      setAiAdviceError(null);
      try {
        // Use the real backend RAG+LLM prescriptive engine via /analyze.
        const res = await HeatGuardAPI.analyzeDistrict({
          district_name: selectedDistrict.district_name,
          max_temp: selectedDistrict.max_temp,
          lst: selectedDistrict.lst,
          humidity: selectedDistrict.humidity,
          pct_children: selectedDistrict.pct_children,
          pct_outdoor_workers: selectedDistrict.pct_outdoor_workers,
          pct_vulnerable_social: selectedDistrict.pct_vulnerable_social,
          date: new Date().toISOString().slice(0, 10)
        });
        const raw = String(res?.prescriptive_advice || '').trim();

        // If the backend returned plain paragraphs (not markdown), convert into bullet points
        // for easier scanning.
        const looksLikeMarkdownList = /^\s*([-*]|\d+\.)\s+/m.test(raw);
        const formatted = (() => {
          if (!raw) return '';
          if (looksLikeMarkdownList) return raw;

          // Split into logical lines / sentences and bullet them.
          const lines = raw
            .split(/\r?\n+/)
            .map(l => l.trim())
            .filter(Boolean);

          if (lines.length > 1) {
            return lines.map(l => `- ${l}`).join('\n');
          }

          // Single paragraph: split by sentence-ish boundaries.
          const parts = raw
            .split(/(?<=[.!?])\s+(?=[A-Z(])/)
            .map(p => p.trim())
            .filter(Boolean);

          if (parts.length <= 1) return `- ${raw}`;
          return parts.map(p => `- ${p}`).join('\n');
        })();

        setAiAdvice(formatted);
      } catch (e: any) {
        setAiAdvice('');
        setAiAdviceError(e?.message || 'Failed to generate AI recommendation');
      } finally {
        setAiAdviceLoading(false);
      }
    };

    run();
  }, [selectedDistrict, simplified]);

  // Close modal when switching districts.
  useEffect(() => {
    if (!selectedDistrict) return;
    setAiAdviceModalOpen(false);
  }, [selectedDistrict?.district_name]);

  // Some environments (esp. when switching views) mount the SVG before it has a measurable size.
  // Ensure the element can always stretch to its container.
  const svgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'block'
  };

  const updatePinAnchor = (district: DistrictRanking | null) => {
    if (!district || simplified) {
      setPinAnchor(null);
      return;
    }

    if (!svgRef.current || !containerRef.current) {
      setPinAnchor(null);
      return;
    }

    const svg = d3.select(svgRef.current);
    const projection = (svg.node() as any)?.__projection;
    if (!projection || !Number.isFinite(district.lat) || !Number.isFinite(district.lon)) {
      setPinAnchor(null);
      return;
    }

    const [x, y] = projection([district.lon, district.lat]);
    const t = transformRef.current || d3.zoomIdentity;
    const sx = x * t.k + t.x;
    const sy = y * t.k + t.y;

    // Convert SVG-local to container-local.
    // svgRef is inside the container, so align to the container's top-left.
    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const left = (svgRect.left - containerRect.left) + sx;
    const top = (svgRect.top - containerRect.top) + sy;

    setPinAnchor({ left, top });
  };

  const clampCardPos = (pos: { left: number; top: number }) => {
    const el = containerRef.current;
    if (!el) return pos;
    const rect = el.getBoundingClientRect();
    // Keep inside container with a small margin.
    const margin = rect.width < 420 ? 8 : 12;
    const cardW = 288; // w-72
    const cardH = 320; // approximate (varies with content)
    const minLeft = margin;
    const minTop = margin;
    const maxLeft = Math.max(minLeft, rect.width - cardW - margin);
    const maxTop = Math.max(minTop, rect.height - cardH - margin);
    return {
      left: Math.min(maxLeft, Math.max(minLeft, pos.left)),
      top: Math.min(maxTop, Math.max(minTop, pos.top))
    };
  };

  const beginDragCard = (e: React.PointerEvent) => {
    if (!cardPos) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: cardPos.left,
      startTop: cardPos.top
    };
  };

  const onDragCard = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    const next = clampCardPos({
      left: draggingRef.current.startLeft + dx,
      top: draggingRef.current.startTop + dy
    });
    setCardPos(next);
  };

  const endDragCard = () => {
    draggingRef.current = null;
  };

  useEffect(() => {
    if (simplified) return;

    const onResize = () => updatePinAnchor(selectedDistrict);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [selectedDistrict, simplified]);

  // When selecting a new district, place the floating card near the pin (once)
  // but keep it where the user dragged it afterwards.
  useEffect(() => {
    if (simplified) return;
    if (!selectedDistrict) {
      setCardPos(null);
      return;
    }

    // If card already placed (user dragged), don't snap it.
    if (cardPos) return;

    // Initial placement: under the search field (top-right), then user can drag within the map.
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = rect.width < 420 ? 8 : 12;
    const searchW = 320; // search overlay width (w-80)

    const initial = clampCardPos({
      left: rect.width - searchW - margin, // align with search's left edge
      top: margin + 64 // under search field
    });
    setCardPos(initial);
  }, [selectedDistrict, pinAnchor, simplified]);

  // 1. Load Base Map (India States)
  // Prefer a real remote GeoJSON (since the local placeholder may be empty),
  // but fall back to the local asset to support offline / locked-down environments.
  useEffect(() => {
    let aborted = false;

    const loadGeoJson = async () => {
      setLoading(true);
      setError(null);

      // Sources (country outline). We only need a valid MultiPolygon/Polygon FeatureCollection.
      // Natural Earth (via GitHub mirror) is stable and avoids per-request tokens.
      const sources = [
        // Remote fallback (world countries; we'll filter to India)
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
        // Local asset (may be empty placeholder)
        '/india_states.geojson'
      ];

      const tryFetch = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      };

      for (const url of sources) {
        try {
          const data = await tryFetch(url);
          if (aborted) return;

          // If we loaded the world dataset, extract India.
          const features = Array.isArray(data?.features) ? data.features : [];
          const isWorldDataset = url.includes('geo-countries') || features.length > 250;

          let normalized = data;
          if (isWorldDataset) {
            const india = features.find((f: any) => {
              const p = f?.properties || {};
              return (
                p.ADMIN === 'India' ||
                p.name === 'India' ||
                p.ISO_A3 === 'IND' ||
                p.ISO3 === 'IND' ||
                p.ISO === 'IND'
              );
            });

            if (!india) throw new Error('India feature not found in world dataset');
            normalized = { type: 'FeatureCollection', features: [india] };
          }

          // Reject empty/invalid GeoJSON so we can try next source.
          if (!Array.isArray(normalized?.features) || normalized.features.length === 0) {
            throw new Error('Empty GeoJSON features');
          }

          setGeoData(normalized);
          setLoading(false);
          return;
        } catch (err) {
          console.warn(`[IndiaMapUI] GeoJSON source failed: ${url}`, err);
        }
      }

      if (!aborted) {
        setError('Could not load India map geojson');
        setLoading(false);
      }
    };

    loadGeoJson();
    return () => {
      aborted = true;
    };
  }, []);

  // 2. Handle Search Filtering
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredDistricts([]);
      return;
    }
    const lower = searchTerm.toLowerCase();
    const matches = rankings
      .filter(r => r.district_name.toLowerCase().includes(lower))
      .slice(0, 5); // Limit to 5 suggestions
    setFilteredDistricts(matches);
  }, [searchTerm, rankings]);

  // 3. D3 Rendering & Zoom Logic
  useEffect(() => {
    if (!svgRef.current) return;

  // In simplified tiles, the container can momentarily measure 0px.
  // Use a conservative fallback so we still render (and don't appear blank).
  const width = svgRef.current.clientWidth || (simplified ? 360 : 800);
  const height = svgRef.current.clientHeight || (simplified ? 260 : 600);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear canvas

    // Create a Group for all map content (this will be zoomed)
    const g = svg.append("g");

    // Projection Center (India)
    const projection = d3.geoMercator()
      .center([82, 23]) // Center of India
      .scale(simplified ? width * 1.5 : width * 1.2)
      .translate([width / 2, height / 2]);

    const pathGenerator = d3.geoPath().projection(projection);

    // --- Draw Base Map (States) ---
    if (geoData) {
      g.selectAll("path")
        .data(geoData.features)
        .enter()
        .append("path")
        .attr("d", pathGenerator as any)
        .attr("fill", "#2a3b47") // Slate-like color
        .attr("stroke", "#3a4b57")
        .attr("stroke-width", 0.5);
    }

    // --- Draw District Points ---
    // Color Scale based on Risk Score (0..1)
    const colorScale = (score: number) => {
      if (score > 0.75) return '#ef4444'; // High Risk
      if (score > 0.50) return '#f97316'; // Moderate Risk
      return '#10b981'; // Low Risk
    };

    // Plot valid points.
    // Note: fallback coords can be 0/0 (invalid for India) which makes pins stack at one spot and look "missing".
    // Also exclude out-of-range coordinates.
    const validPoints = rankings.filter(d => {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return false;
      if (d.lat === 0 && d.lon === 0) return false;
      if (d.lat < -90 || d.lat > 90) return false;
      if (d.lon < -180 || d.lon > 180) return false;
      return true;
    });

    if (!simplified && !loading && validPoints.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .style('font-size', '12px')
        .text('No district coordinates available to plot yet.');
    }

    // If geojson is empty, show a non-fatal warning rather than a blank map.
    // Hide this warning in simplified tiles so the Risk Overview card doesn't look "blank".
    if (!simplified && !loading && geoData && Array.isArray(geoData.features) && geoData.features.length === 0 && !error) {
      setError('Base map polygons are unavailable (empty GeoJSON). Showing district pins only.');
    }

  // Fix: Add transparent background for zoom capturing.
  // IMPORTANT: we attach the zoom handler to this rect so it consistently receives drag events.
  // (When attached to the SVG, D3 can miss pointer events due to layered <g> content.)
  let captureRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
  if (!simplified) {
    // Keep the capture rect aligned to the visible viewport.
    // Oversized rects can interact oddly with pointer events and may contribute to jitter.
    captureRect = g.insert("rect", ":first-child")
      .attr("width", width)
      .attr("height", height)
      .attr("x", 0)
      .attr("y", 0)
      .attr("fill", "transparent")
      .style("pointer-events", "all")
      // Ensure the cursor feedback matches the actual behavior.
      .style("cursor", "grab");
  }

  // Pulse animation removed per UX request (keep map calm and avoid visual noise).

    const pointsSelection = g.selectAll("circle.point")
      .data(validPoints, (d: any) => d?.district_name)
      .enter()
      .append("circle")
      .attr("class", "point")
      .attr("cx", d => projection([d.lon, d.lat])?.[0] || 0)
      .attr("cy", d => projection([d.lon, d.lat])?.[1] || 0)
      .attr("r", simplified ? 3 : 5)
      .attr("fill", d => colorScale(d.risk_score))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1)
      .attr("opacity", 0.8)
      .attr("cursor", "pointer")
      .on("mouseover", function(event, d) {
          // Avoid stacking transitions (can feel glitchy during/after panning).
          d3.select(this).interrupt();
          d3.select(this)
            .transition().duration(200)
            .attr("r", 15)
            .attr("opacity", 1);

          if (!simplified) {
             // Add Tooltip (simple D3 way or use React portal)
             // We'll use a React state for "selectedDistrict" instead on click
          }
      })
      .on("mouseout", function() {
          d3.select(this).interrupt();
          d3.select(this)
            .transition().duration(200)
            .attr("r", simplified ? 3 : 5)
            .attr("opacity", 0.8);
      })
      .on("click", (event, d) => {
          event.stopPropagation();
          setSelectedDistrict(d);
          updatePinAnchor(d);
          // Optional: Zoom to clicked
      });

    // --- Configure Zoom ---
    if (!simplified) {
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 8]) // Min/Max zoom
            // Avoid glitchy interactions when users click pins/search overlay.
            // Allow wheel-zoom and left mouse drag.
            .filter((event: any) => {
              // Block zoom when modifier keys are held (often means browser/trackpad gestures)
              if (event?.ctrlKey || event?.metaKey) return false;
              // Only left-button drag pans
              if (event?.type === 'mousedown' && event?.button !== 0) return false;
              return true;
            })
            .on("start", () => {
              // Stop any ongoing point hover transitions during pan/zoom.
              try {
                pointsSelection.interrupt();
              } catch {}
            })
            .on("zoom", (event) => {
              // Keep zoom handler lightweight: only update the group transform.
              // Round translate slightly to reduce sub-pixel flicker ("vibrating" feel)
              // on some GPUs/browsers while dragging.
              const t = event.transform;
              const tx = Math.round(t.x * 10) / 10;
              const ty = Math.round(t.y * 10) / 10;
              const k = Math.round(t.k * 1000) / 1000;
              const rounded = d3.zoomIdentity.translate(tx, ty).scale(k);
              g.attr("transform", rounded.toString());
              transformRef.current = rounded;

              // Keep the anchored card on top of the pin while panning/zooming.
              if (selectedDistrict) {
                updatePinAnchor(selectedDistrict);
              }
            });

        // Attach zoom to the capture rect so drag-to-pan works reliably.
        // Also prevent the browser from treating drag as text selection.
        if (captureRect) {
          (captureRect as any).call(zoom as any);
        } else {
          svg.call(zoom);
        }

  // Disable double-click zoom (feels glitchy when selecting districts)
  svg.on('dblclick.zoom', null);

        // Store zoom instance on DOM node for external access
        (svg.node() as any).__zoom = zoom;
        (svg.node() as any).__projection = projection;
    }

  }, [rankings, geoData, simplified]);


  // 4. Programmatic Zoom (for Search)
  const handleZoomToDistrict = (district: DistrictRanking) => {
      setSelectedDistrict(district);
      setSearchTerm(district.district_name);
      setShowSuggestions(false);

      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current);
      const zoom = (svg.node() as any).__zoom;
      const projection = (svg.node() as any).__projection;

  if (projection && zoom && Number.isFinite(district.lat) && Number.isFinite(district.lon)) {
          const [x, y] = projection([district.lon, district.lat]);
          const scale = 4; // Zoom level
          const width = svgRef.current.clientWidth;
          const height = svgRef.current.clientHeight;

          // Calculate translate to center the point
          // transform = translate(tx, ty) scale(k)
          // center = [width/2, height/2]
          // tx = width/2 - x * k
          // ty = height/2 - y * k

          const transform = d3.zoomIdentity
             .translate(width / 2, height / 2)
             .scale(scale)
             .translate(-x, -y);

          svg.transition()
             .duration(750)
             .call(zoom.transform, transform);
      }

  // Update anchor immediately (and again after the zoom settles).
  updatePinAnchor(district);
  window.setTimeout(() => updatePinAnchor(district), 800);

  };

  return (
    <div ref={containerRef} className={`relative flex flex-col bg-[#1a2c38] overflow-hidden ${simplified ? 'w-full h-full' : 'w-full h-full border-2 border-border rounded-xl shadow-3d'}`}>

      {/* --- Search Bar Overlay --- */}
      {!simplified && (
        <div className="absolute top-4 right-4 z-20 w-80">
            <div className="relative group">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
                    <Search size={16} />
                </div>
                <input
                    type="text"
                    className="w-full bg-[#2a3b47]/90 backdrop-blur text-white border border-slate-600 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-xl transition-all"
                    placeholder="Search District..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                />

                {/* Suggestions Dropdown */}
                {showSuggestions && filteredDistricts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#2a3b47] border border-slate-600 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto z-30">
                        {filteredDistricts.map(d => (
                            <div
                                key={d.district_name}
                                className="px-4 py-3 hover:bg-slate-600 cursor-pointer flex justify-between items-center border-b border-slate-700 last:border-0"
                                onClick={() => handleZoomToDistrict(d)}
                            >
                                <div className="flex flex-col">
                                    <span className="font-medium text-slate-100">{d.district_name}</span>
                                    <span className="text-[10px] text-slate-400">Lat: {d.lat.toFixed(2)}</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                                    ${d.risk_score > 0.75 ? 'bg-red-500/20 text-red-400' :
                                      d.risk_score > 0.50 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {(d.risk_score * 100).toFixed(0)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
      )}

  {/* Legend removed per request */}

      {/* --- Selected District Details Card (anchored above the selected pin) --- */}
  {selectedDistrict && !simplified && (
          <div
            className="absolute z-20 w-72 bg-[#2a3b47]/95 backdrop-blur border border-slate-600 rounded-xl shadow-2xl p-4 animate-in fade-in-0 duration-200"
            style={{
      left: cardPos?.left ?? (pinAnchor?.left ?? 16),
      top: cardPos?.top ?? (pinAnchor?.top ?? 16),
      transform: cardPos ? 'none' : (pinAnchor ? 'translate(-50%, calc(-100% - 12px))' : 'none')
            }}
          >
               {/* Drag handle */}
               <div
                 className="-mx-4 -mt-4 mb-3 px-4 py-2 border-b border-slate-600/70 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
                 onPointerDown={beginDragCard}
                 onPointerMove={onDragCard}
                 onPointerUp={endDragCard}
                 onPointerCancel={endDragCard}
               >
                 <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">District Summary</div>
                 <div className="flex items-center gap-2 text-slate-400">
                   <div className="h-1 w-1 rounded-full bg-slate-500" />
                   <div className="h-1 w-1 rounded-full bg-slate-500" />
                   <div className="h-1 w-1 rounded-full bg-slate-500" />
                 </div>
               </div>

               <div className="flex justify-between items-start mb-4">
                   <div>
                       <h3 className="font-bold text-lg text-white">{selectedDistrict.district_name}</h3>
                       <div className="text-xs text-slate-400">Lat: {selectedDistrict.lat.toFixed(2)}, Lon: {selectedDistrict.lon.toFixed(2)}</div>
                   </div>
                   <button
                       onClick={() => { setSelectedDistrict(null); setPinAnchor(null); setCardPos(null); }}
                       className="p-1 hover:bg-slate-600 rounded-full text-slate-400 hover:text-white transition-colors">
                       <X size={16}/>
                   </button>
               </div>

               <div className="space-y-3">
                   <div className="bg-slate-800/50 p-3 rounded-lg flex justify-between items-center">
                       <span className="text-sm text-slate-300">Heat hospitalization risk</span>
                       <span className={`text-xl font-bold ${selectedDistrict.risk_score > 0.75 ? 'text-red-400' : 'text-emerald-400'}`}>
                           {(selectedDistrict.risk_score * 100).toFixed(0)}%
                       </span>
                   </div>

                   <div className="grid grid-cols-2 gap-2">
                       <div className="bg-slate-800/50 p-2 rounded-lg text-center">
                            <div className="text-[10px] text-slate-400 uppercase">Max Temp</div>
                            <div className="font-mono text-white">{selectedDistrict.max_temp.toFixed(1)}°C</div>
                       </div>
                       <div className="bg-slate-800/50 p-2 rounded-lg text-center">
                            <div className="text-[10px] text-slate-400 uppercase">LST Day</div>
                            <div className="font-mono text-white">{selectedDistrict.lst.toFixed(1)}°C</div>
                       </div>
                   </div>

                   <div className="pt-2 border-t border-slate-600">
                       <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center justify-between">
                         <span>AI Recommendation</span>
                         <div className="flex items-center gap-2">
                           {aiAdviceLoading && (
                             <span className="inline-flex items-center" aria-label="Generating recommendation">
                               <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                             </span>
                           )}
                           <button
                             type="button"
                             className="pointer-events-auto text-slate-300 hover:text-white transition-colors"
                             onClick={() => setAiAdviceModalOpen(true)}
                             title="Expand"
                             aria-label="Open AI recommendation in large view"
                           >
                             <ArrowUpRight size={14} />
                           </button>
                         </div>
                       </div>

                       {aiAdviceError ? (
                         <div className="text-xs text-red-300 leading-relaxed">
                           Unable to generate recommendation ({aiAdviceError}).
                         </div>
                       ) : aiAdviceLoading ? (
                         <div className="text-xs text-slate-300 leading-relaxed">
                           Generating recommendation…
                         </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto pr-1">
                          <div className="prose prose-invert prose-xs max-w-none text-slate-200 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                            <ReactMarkdown>
                              {aiAdvice || '—'}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                   </div>

                    {/* AI recommendation modal */}
                    {aiAdviceModalOpen && (
                      <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
                        <button
                          type="button"
                          className="absolute inset-0 bg-black/70"
                          aria-label="Close"
                          onClick={() => setAiAdviceModalOpen(false)}
                        />
                        <div className="relative w-[min(1800px,calc(100vw-1rem))] h-[92vh] sm:h-[94vh] overflow-hidden rounded-2xl border border-slate-600 bg-[#0f1f29] shadow-2xl">
                          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-700">
                            <div>
                              <div className="text-base sm:text-lg font-bold text-white">AI Recommendation</div>
                              <div className="text-sm text-slate-400">{selectedDistrict.district_name}</div>
                            </div>
                            <button
                              type="button"
                              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors"
                              onClick={() => setAiAdviceModalOpen(false)}
                              aria-label="Close modal"
                            >
                              <X size={18} />
                            </button>
                          </div>

                          <div className="p-5 sm:p-6 overflow-y-auto h-[calc(92vh-64px)] sm:h-[calc(94vh-64px)]">
                            {aiAdviceError ? (
                              <div className="text-base text-red-300 leading-relaxed">
                                Unable to generate recommendation ({aiAdviceError}).
                              </div>
                            ) : aiAdviceLoading ? (
                              <div className="flex items-center gap-3 text-base text-slate-200">
                                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Generating recommendation…
                              </div>
                            ) : (
                              <div className="prose prose-invert prose-lg max-w-none text-slate-100 leading-relaxed prose-headings:text-white prose-ul:my-4 prose-ol:my-4 prose-li:my-2">
                                <ReactMarkdown>
                                  {aiAdvice || '—'}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
               </div>
          </div>
      )}

      {/* --- Map Container --- */}
      <div className="flex-1 bg-[#1a2c38] relative flex items-center justify-center overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-primary animate-pulse font-bold text-xs">Loading India map...</div>}
        {!loading && error && <div className="absolute inset-0 flex items-center justify-center text-destructive font-bold text-xs">{error}</div>}
        <svg ref={svgRef} className={`w-full h-full block ${simplified ? '' : 'cursor-grab active:cursor-grabbing'}`} style={{background: '#1a2c38'}}></svg>
      </div>
    </div>
  );
};

// --- RAG Engine View ---
const RagEngineView = () => {
  const [messages, setMessages] = useState<any[]>(() => {
      const saved = localStorage.getItem('chat_history');
      return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [reasoning, setReasoning] = useState<string>('');
  const [context, setContext] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [selectedSource, setSelectedSource] = useState<any | null>(null);

  const RAG_REASONING_KEY = 'rag_last_reasoning_v1';
  const RAG_CONTEXT_KEY = 'rag_last_context_v1';
  const LAST_ANALYSIS_KEY = 'heatguard_last_analysis_v1';

  const [lastDistrictContext, setLastDistrictContext] = useState<string | null>(null);
  const [topRiskDistrict, setTopRiskDistrict] = useState<{ district_name: string; risk_score?: number; risk_status?: string } | null>(null);
  const [dailyRankingsDate, setDailyRankingsDate] = useState<string | null>(null);
  const [topRiskCensus, setTopRiskCensus] = useState<{ pct_children?: number; pct_outdoor_workers?: number; pct_vulnerable_social?: number } | null>(null);

  const buildDistrictContextString = () => {
    const parts: string[] = [];
    if (topRiskDistrict?.district_name) {
      const scoreStr = typeof topRiskDistrict.risk_score === 'number' ? ` score=${topRiskDistrict.risk_score.toFixed(3)}` : '';
      const statusStr = topRiskDistrict.risk_status ? ` (${topRiskDistrict.risk_status})` : '';
      const dateStr = dailyRankingsDate ? ` on ${dailyRankingsDate}` : '';
      parts.push(`Top risk district${dateStr} is ${topRiskDistrict.district_name}${statusStr}.${scoreStr}`);
    }

    if (topRiskCensus) {
      const pctChildren = typeof topRiskCensus.pct_children === 'number' ? `${topRiskCensus.pct_children.toFixed(1)}%` : 'n/a';
      const pctOutdoor = typeof topRiskCensus.pct_outdoor_workers === 'number' ? `${topRiskCensus.pct_outdoor_workers.toFixed(1)}%` : 'n/a';
      const pctVuln = typeof topRiskCensus.pct_vulnerable_social === 'number' ? `${topRiskCensus.pct_vulnerable_social.toFixed(1)}%` : 'n/a';
      parts.push(`Static district vulnerability indicators (approx, from dataset): pct_children=${pctChildren}, pct_outdoor_workers=${pctOutdoor}, pct_vulnerable_social=${pctVuln}.`);
      parts.push('Tailoring instruction: when recommending actions, prioritize measures for outdoor workers, children, and vulnerable groups proportional to these indicators.');
    }

    return parts.join('\n');
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

  const fetchRankingsOnce = async (opts?: { force?: boolean }) => {
  const force = !!opts?.force;

    // If we're forcing a refresh, clear current state so the user sees it's reloading.
    if (force) {
      setTopRiskDistrict(null);
      setDailyRankingsDate(null);
      setTopRiskCensus(null);
    }

    try {
      await new Promise<void>((resolve) => {
        const url = force
          ? `http://localhost:8000/api/districts/rankings?force=1&_ts=${Date.now()}`
          : 'http://localhost:8000/api/districts/rankings';
        const eventSource = new EventSource(url);

        const kill = window.setTimeout(() => {
          eventSource.close();
          resolve();
        }, 15000);

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'result') {
              const rankingsData = payload?.data;
              const rankings = Array.isArray(rankingsData?.rankings) ? rankingsData.rankings : [];
              if (!rankings.length) return;
              setDailyRankingsDate(rankingsData?.date || null);
              const sorted = [...rankings].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
              const top = sorted[0];
              if (top?.district_name) {
                setTopRiskDistrict({
                  district_name: top.district_name,
                  risk_score: top.risk_score,
                  risk_status: top.risk_status
                });
                setTopRiskCensus({
                  pct_children: typeof top.pct_children === 'number' ? top.pct_children : undefined,
                  pct_outdoor_workers: typeof top.pct_outdoor_workers === 'number' ? top.pct_outdoor_workers : undefined,
                  pct_vulnerable_social: typeof top.pct_vulnerable_social === 'number' ? top.pct_vulnerable_social : undefined
                });
              }

              window.clearTimeout(kill);
              eventSource.close();
              resolve();
            }
            if (payload?.type === 'error') {
              window.clearTimeout(kill);
              eventSource.close();
              resolve();
            }
            if (payload?.type === 'complete') {
              window.clearTimeout(kill);
              eventSource.close();
              resolve();
            }
          } catch {
            // ignore
          }
        };

        eventSource.onerror = () => {
          window.clearTimeout(kill);
          eventSource.close();
          resolve();
        };
      });

      try {
        localStorage.setItem('heatguard_rankings_fetched_once_v1', '1');
      } catch {
        // ignore
      }
    } finally {
      // no-op
    }
  };

  // Restore last reasoning/context when navigating away and back.
  useEffect(() => {
    try {
      const lastReasoning = localStorage.getItem(RAG_REASONING_KEY);
      if (lastReasoning) setReasoning(lastReasoning);
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(RAG_CONTEXT_KEY);
      if (raw) setContext(JSON.parse(raw));
    } catch {
      // ignore
    }

  // Load cached analysis payload presence (localStorage) and pull top-risk info from DB-cached rankings.
    try {
      const raw = localStorage.getItem(LAST_ANALYSIS_KEY);
      setLastDistrictContext(raw);
    } catch {
      setLastDistrictContext(null);
    }

  // Also derive current top-risk district from today's cached rankings (DB-backed via SSE).
  fetchRankingsOnce();
  }, []);

  // Persist reasoning/context updates.
  useEffect(() => {
    try {
      if (reasoning) localStorage.setItem(RAG_REASONING_KEY, reasoning);
    } catch {
      // ignore
    }
  }, [reasoning]);

  useEffect(() => {
    try {
      if (context?.length) localStorage.setItem(RAG_CONTEXT_KEY, JSON.stringify(context));
    } catch {
      // ignore
    }
  }, [context]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userText = input;
    const newMsg = { id: Date.now(), role: 'user', content: userText };
    setMessages(prev => [...prev, newMsg]);
    setInput('');

  // Reset panels & enter loading state
  setIsChatLoading(true);
  setReasoning('');
  setContext([]);

  try {
        let districtContext: string | null = null;
        try {
          districtContext = localStorage.getItem(LAST_ANALYSIS_KEY);
        } catch {
          districtContext = null;
        }

        // If we don't have a full analysis payload cached locally, at least send the
        // daily top-risk district summary (DB-cached rankings) so the bot can answer.
        if (!districtContext || !districtContext.trim()) {
          const fallback = buildDistrictContextString();
          districtContext = fallback ? fallback : null;
        }

        // Keep these as logs (not UI) for debugging.
        try {
          const hasPayload = !!localStorage.getItem(LAST_ANALYSIS_KEY);
          console.log('[RAG] District payload attached:', hasPayload);
          console.log('[RAG] Top risk district:', topRiskDistrict);
          console.log('[RAG] Daily rankings date:', dailyRankingsDate);
          if (!hasPayload) console.log('[RAG] Using fallback district context string.');
        } catch {
          // ignore
        }

        const response = await fetch('http://localhost:8000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: userText, district_context: districtContext })
        });

        if (!response.ok) throw new Error("Backend connection failed");

        const data = await response.json();

        // Backend now returns { answer, context, reasoning }
        setMessages(prev => [...prev, {
            id: Date.now() + 1,
            role: 'ai',
            content: data.answer || data.response // fallback
        }]);

        if (data.reasoning) setReasoning(data.reasoning);
        if (data.context) setContext(data.context);

    } catch (e) {
         setMessages(prev => [...prev, {
            id: Date.now() + 1,
            role: 'ai',
            content: 'System: Error connecting to RAG backend. Please ensure the server is running.'
          }]);
  } finally {
    setIsChatLoading(false);
    }
  };

  const clearHistory = () => {
      if(window.confirm("Clear chat history?")) {
          setMessages([]);
          localStorage.removeItem('chat_history');
          setReasoning('');
          setContext([]);
          localStorage.removeItem(RAG_REASONING_KEY);
          localStorage.removeItem(RAG_CONTEXT_KEY);
      }
  };

  return (
    <>
    <div className="h-full min-h-[650px] flex flex-col xl:flex-row items-stretch gap-6">
      <div className="flex-1 bg-card rounded-2xl border-2 border-border shadow-3d flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Bot size={24} />
            </div>
            <div>
              <h2 className="font-bold text-lg">Knowledge Base Assistant</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Online • Index Updated 5m ago
              </div>
            </div>
          </div>
          <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 size={12} /> Clear History
          </button>
        </div>

  <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-muted/5">

          {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                  <Bot size={48} className="mb-4" />
                  <p>Awaiting User Input or RAG Connection...</p>
              </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'ai' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary mt-1">
                  <Sparkles size={16} />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-sm shadow-sm ${msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-tr-none font-medium'
                : 'bg-card border border-border rounded-tl-none font-medium text-foreground'
                }`}>
                {/* Use ReactMarkdown */}
                <ReactMarkdown
                    components={{
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc ml-4 mb-2" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal ml-4 mb-2" {...props} />,
                        li: ({node, ...props}) => <li className="mb-1" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-bold text-foreground/90" {...props} />
                    }}
                >
                    {msg.content}
                </ReactMarkdown>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-sidebar-border flex-shrink-0 flex items-center justify-center text-sidebar-foreground mt-1">
                  <User size={16} />
                </div>
              )}
            </div>
          ))}

          {/* Loading bubble */}
          {isChatLoading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary mt-1">
                <Sparkles size={16} />
              </div>
              <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-sm shadow-sm bg-card border border-border rounded-tl-none font-medium text-foreground flex items-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="relative flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question..."
              className="w-full bg-[#1e293b] border-2 border-slate-600 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-primary transition-colors text-white placeholder:text-slate-400"
            />
            <button
              onClick={handleSend}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="w-full xl:w-80 flex flex-col gap-6 h-full">
    <div className="bg-card rounded-2xl border-2 border-border shadow-3d p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <BrainCircuit size={16} /> Reasoning Process
          </h3>

      <div className="text-sm text-foreground/80 flex-1 overflow-y-auto custom-scrollbar min-h-0">
       {reasoning ? (
         <div className="space-y-2">
           {reasoning.split('\n').filter(Boolean).map((line, i) => {
             const [k, ...rest] = line.split(':');
             const v = rest.join(':').trim();
             return (
               <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/5 px-3 py-2">
                 <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{k}</div>
                 <div className="text-xs text-foreground/90 text-right font-mono break-words">{v || line}</div>
               </div>
             );
           })}
         </div>
       ) : isChatLoading ? (
         <div className="flex items-center justify-center py-10 text-muted-foreground gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Analyzing...</p>
         </div>
       ) : (
         <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <p className="text-sm">No reasoning yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Ask a question to see retrieval + synthesis details.</p>
         </div>
       )}
          </div>
        </div>

    <div className="bg-card rounded-2xl border-2 border-border shadow-3d p-4 flex-1 flex flex-col min-h-0">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <Database size={16} /> Source Context
          </h3>
      <div className="space-y-3 pt-4 text-sm flex-1 overflow-y-auto custom-scrollbar min-h-0">
       {context.length > 0 ? (
         context.map((doc, idx) => (
           <button
             key={idx}
             type="button"
             onClick={() => setSelectedSource(doc)}
             className="w-full text-left p-3 bg-muted/10 rounded-lg border border-border hover:bg-muted/20 transition-colors"
             title="Click to view full source text"
           >
             <div className="flex justify-between items-center mb-1">
               <span className="text-[10px] font-bold text-primary truncate max-w-[150px]">{doc.source}</span>
               <span className="text-[9px] text-muted-foreground">Score: {doc.similarity_score}</span>
             </div>
             <p className="text-xs text-muted-foreground line-clamp-3 italic">"{doc.content}"</p>
           </button>
         ))
       ) : isChatLoading ? (
         <div className="flex items-center justify-center py-10 text-muted-foreground gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Retrieving sources...</p>
         </div>
       ) : (
         <div className="text-center text-muted-foreground">
          No context available.
         </div>
       )}
          </div>
        </div>
      </div>
    </div>

    {/* Source document modal */}
    {selectedSource && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setSelectedSource(null)}
        />
        <div className="relative w-full max-w-3xl bg-card border-2 border-border rounded-2xl shadow-3d p-5 max-h-[80vh] flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-primary truncate max-w-[60vw]">{selectedSource.source}</div>
              <div className="text-xs text-muted-foreground">
                Score: {selectedSource.similarity_score}
                {selectedSource.page != null ? ` • Page: ${selectedSource.page}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSource(null)}
              className="p-2 rounded-lg hover:bg-muted/20"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto custom-scrollbar">
            <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans">{selectedSource.content}</pre>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

// --- Data Sources View ---
const DataSourcesView = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  // Use a dictionary or array with IDs to track progress per file
  const [processingFiles, setProcessingFiles] = useState<{ id: string, file: File, progress: number }[]>([]);

  const [isDragging, setIsDragging] = useState(false);

  // Load files on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
        const fetched = await HeatGuardAPI.getFiles();
        setFiles(fetched);
    } catch (e) {
        console.error("Failed to fetch files", e);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      if (droppedFiles.length > 0) processFiles(droppedFiles);
  };

  const processFiles = async (uploads: File[]) => {
      // Create entries for new files
      const newProcessing = uploads.map(f => ({
          id: Math.random().toString(36).substr(2, 9),
          file: f,
          progress: 0
      }));

      setProcessingFiles(prev => [...prev, ...newProcessing]);

      // Upload sequentially to avoid overwhelming server if many big files
      for (const item of newProcessing) {
          try {
              await HeatGuardAPI.uploadFile(item.file, (percent) => {
                  setProcessingFiles(prev => prev.map(p =>
                      p.id === item.id ? { ...p, progress: percent } : p
                  ));
              });
          } catch (err) {
              console.error(`Upload failed for ${item.file.name}`, err);
              // Ensure we remove it or mark as error (removing for now to keep simple)
          }
           // Remove from processing list after done
          setProcessingFiles(prev => prev.filter(p => p.id !== item.id));
          // Refresh list immediately to show the new file
          fetchFiles();
      }
  };

  const handleDelete = async (filename: string) => {
      if (window.confirm(`Are you sure you want to delete ${filename}?`)) {
          try {
              await HeatGuardAPI.deleteFile(filename);
              fetchFiles();
          } catch (e) {
              console.error("Failed to delete file", e);
          }
      }
  };

  return (
  <div className="h-full flex flex-col gap-6">
    <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d flex-shrink-0">
  <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Database size={24} className="text-blue-500" /> Knowledge Base Management</h2>
      <p className="text-sm text-muted-foreground/80 mb-6">Manage the documents and datasets used by the RAG engine to generate protocols. Supports PDF (including scanned), Excel, and Image (OCR) uploads.</p>

      {/* Searchable/Upload Area */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border/50 hover:border-primary/50 hover:bg-muted/5'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={`p-4 rounded-full bg-primary/10 text-primary mb-4 transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
          <FileText size={32} className="text-primary" />
        </div>
        <h3 className="font-bold text-lg mb-1">Drag & Drop Files Here</h3>
        <p className="text-sm text-muted-foreground mb-4">or click to browse from your computer</p>
        <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg font-bold text-sm hover:brightness-110 transition-all">
          Select Files
        </button>
        <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => e.target.files && processFiles(Array.from(e.target.files))}
        />
      </div>
    </div>

    <div className="bg-card rounded-2xl border-2 border-border shadow-3d flex-1 overflow-hidden flex flex-col min-h-[400px]">
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/10">
        <h3 className="font-bold">Indexed Documents</h3>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-muted/20 rounded-lg"><Filter size={18} /></button>
        </div>
      </div>
      <div className="overflow-x-auto flex-1 p-0">
        <table className="w-full text-sm text-left min-w-[600px]">
          <thead className="bg-muted/5 text-muted-foreground font-medium uppercase text-xs">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Type</th>
              <th className="p-4">Size</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
             {/* Processing Files (Client Side) */}
             {processingFiles.map((item) => (
                <tr key={item.id} className="hover:bg-muted/5 group bg-muted/5">
                  <td className="p-4 font-medium flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                        <FileText size={16} />
                    </div>
                    {item.file.name}
                  </td>
                  <td className="p-4 text-muted-foreground">{item.file.type || 'FILE'}</td>
                  <td className="p-4 text-muted-foreground font-mono text-xs">{(item.file.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="p-4">
                      <div className="flex flex-col gap-1 w-24">
                          <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                             <span>Indexing...</span>
                             <span>{item.progress}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${item.progress}%` }}
                              />
                          </div>
                      </div>
                  </td>
                  <td className="p-4 text-right"></td>
                </tr>
             ))}

             {/* Persisted Files (Server Side) */}
             {files.map((file, i) => {
                const progressMatch = file.status?.match(/Processing Page (\d+)\/(\d+)/);
                const progress = progressMatch
                    ? Math.round((parseInt(progressMatch[1]) / parseInt(progressMatch[2])) * 100)
                    : null;

                return (
                <tr key={i} className="hover:bg-muted/5 group">
                  <td className="p-4 font-medium flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                        <FileText size={16} />
                    </div>
                    {file.filename}
                  </td>
                  <td className="p-4 text-muted-foreground">{file.content_type?.split('/')[1]?.toUpperCase() || 'FILE'}</td>
                  <td className="p-4 text-muted-foreground font-mono text-xs">{(file.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="p-4">
                      {progress !== null ? (
                          <div className="flex flex-col gap-1 w-32">
                              <div className="flex justify-between text-[10px] font-bold text-yellow-500">
                                 <span>Processing...</span>
                                 <span>{progress}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-yellow-500 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                  />
                              </div>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">{file.status}</span>
                          </div>
                      ) : (
                          <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                              (file.status || 'Indexed') === 'Indexed' ? 'bg-green-500/10 text-green-500' :
                              (file.status || 'Indexed') === 'Failed' ? 'bg-red-500/10 text-red-500' :
                              'bg-yellow-500/10 text-yellow-500'
                          }`}>
                              {file.status || 'Indexed'}
                          </span>
                      )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                        onClick={() => handleDelete(file.filename)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Delete File"
                    >
                        <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
                );
             })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// --- Reports View ---
type StoredReport = {
  id: string;
  createdAt: string;
  districtName: string;
  riskStatus: string;
  payload: any;
};

const REPORTS_STORAGE_KEY = 'heatguard_reports_v1';

const ReportsView: React.FC<{ analysisResult: AnalysisResponse | null }> = ({ analysisResult }) => {
  const [reports, setReports] = useState<StoredReport[]>(() => {
    try {
      const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredReport[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports));
  }, [reports]);

  const createDailyTopRiskReport = async () => {
    try {
      const rankingsData: any = await new Promise((resolve, reject) => {
        const es = new EventSource('http://localhost:8000/api/districts/rankings');
        const timeout = window.setTimeout(() => {
          es.close();
          reject(new Error('Timeout loading rankings'));
        }, 10000);

        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'result') {
              window.clearTimeout(timeout);
              es.close();
              resolve(payload.data);
            }
            if (payload?.type === 'error') {
              window.clearTimeout(timeout);
              es.close();
              reject(new Error(payload?.message || 'Rankings error'));
            }
            if (payload?.type === 'complete') {
              // ignore
            }
          } catch {
            // ignore
          }
        };

        es.onerror = () => {
          window.clearTimeout(timeout);
          es.close();
          reject(new Error('SSE connection failed'));
        };
      });

      const rankings = Array.isArray(rankingsData?.rankings) ? rankingsData.rankings : [];
      if (!rankings.length) {
        alert('No cached daily rankings found yet. Please wait for today\'s analysis to complete.');
        return;
      }

      const sorted = [...rankings].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
      const top = sorted[0];

      const reportPayload = {
        type: 'daily_top_risk_report',
        date: rankingsData?.date || new Date().toISOString().slice(0, 10),
        top_risk_district: top,
        total_districts: rankingsData?.total_districts ?? rankings.length,
        ranking_snapshot: sorted.slice(0, 25)
      };

      const report: StoredReport = {
        id: crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        districtName: top?.district_name || 'TopRisk',
        riskStatus: top?.risk_status || 'Unknown',
        payload: reportPayload
      };
      setReports(prev => [report, ...prev]);
    } catch (e) {
      console.error(e);
      alert('Could not generate daily report from cached DB rankings.');
    }
  };

  const downloadReportPDF = async (report: StoredReport) => {
    const safeDistrict = String(report.districtName || 'Report').replace(/[^a-z0-9_-]+/gi, '_');
    const dateStr = report.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);

    try {
      // Prefer a real "report" look by rendering a styled HTML report to an image via html2canvas,
      // then embedding that image into jsPDF with tight margins and clean page slicing.
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18; // tighter margins, less unwanted space
      const usableW = pageWidth - margin * 2;
      const usableH = pageHeight - margin * 2;

      const isDaily = report.payload?.type === 'daily_top_risk_report';
      const top = isDaily ? report.payload?.top_risk_district : null;
      const date = isDaily ? report.payload?.date : null;
      const totalDistricts = isDaily ? (report.payload?.total_districts ?? '—') : '—';
      const rankings = isDaily
        ? (Array.isArray(report.payload?.ranking_snapshot)
          ? report.payload.ranking_snapshot
          : Array.isArray(report.payload?.rankings)
            ? report.payload.rankings
            : [])
        : [];

      const statusCounts: Record<string, number> = (Array.isArray(rankings) ? rankings : []).reduce(
        (acc: Record<string, number>, r: any) => {
          const s = String(r?.risk_status ?? 'Unknown');
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const colorForStatus = (s: string) => {
        const v = String(s || '').toLowerCase();
        if (v === 'red') return '#EF4444';
        if (v === 'amber' || v === 'yellow') return '#F59E0B';
        if (v === 'green') return '#10B981';
        return '#64748B';
      };

      const fmtNum = (v: any, digits = 3) => (typeof v === 'number' ? v.toFixed(digits) : '—');
      const safe = (v: any) => String(v ?? '—');

      // Build an offscreen report DOM.
      const container = document.createElement('div');
      container.style.position = 'fixed';
  // Keep it offscreen but still renderable. Some browsers/extensions fail capturing
  // extremely negative offsets.
  container.style.left = '0';
  container.style.top = '0';
  container.style.transform = 'translateX(-120%)';
      container.style.width = '900px';
      container.style.background = '#ffffff';
      container.style.color = '#0f172a';
      container.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      container.style.padding = '24px';
      container.style.border = '1px solid #e5e7eb';
      container.style.borderRadius = '16px';
  container.style.zIndex = '-1';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'flex-start';
      header.style.gap = '16px';
      header.innerHTML = `
        <div>
          <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;">HeatGuard AI — Daily Risk Report</div>
          <div style="margin-top:6px;font-size:12px;color:#475569;">Generated: ${safe(new Date(report.createdAt).toLocaleString())}</div>
          <div style="margin-top:2px;font-size:12px;color:#475569;">Date: ${safe(date || dateStr)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#475569;">Top-risk district</div>
          <div style="font-size:16px;font-weight:800;">${safe(top?.district_name || report.districtName)}</div>
          <div style="margin-top:6px;display:inline-flex;align-items:center;gap:8px;">
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;background:${colorForStatus(top?.risk_status || report.riskStatus)}1A;color:${colorForStatus(top?.risk_status || report.riskStatus)};border:1px solid ${colorForStatus(top?.risk_status || report.riskStatus)}33;">${safe(top?.risk_status || report.riskStatus)}</span>
            <span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;font-size:11px;color:#334155;">score=${fmtNum(top?.risk_score, 3)}</span>
          </div>
        </div>
      `;

      const cards = document.createElement('div');
      cards.style.display = 'grid';
      cards.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
      cards.style.gap = '12px';
      cards.style.marginTop = '18px';

      const makeCard = (title: string, value: string, sub?: string) => {
        const el = document.createElement('div');
        el.style.border = '1px solid #e5e7eb';
        el.style.borderRadius = '14px';
        el.style.padding = '12px';
        el.style.background = '#ffffff';
        el.innerHTML = `
          <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">${title}</div>
          <div style="margin-top:6px;font-size:18px;font-weight:900;letter-spacing:-0.02em;">${value}</div>
          ${sub ? `<div style="margin-top:4px;font-size:11px;color:#475569;">${sub}</div>` : ''}
        `;
        return el;
      };

      cards.appendChild(makeCard('Total districts', safe(totalDistricts), 'from cached DB rankings'));
      cards.appendChild(makeCard('Temperature (°C)', fmtNum(top?.temperature_c, 2), 'top-risk district'));
      cards.appendChild(makeCard('Humidity (%)', fmtNum(top?.humidity, 1), 'top-risk district'));
      cards.appendChild(makeCard('Heat Index (°C)', fmtNum(top?.heat_index_c, 2), 'top-risk district'));

      const chartsWrap = document.createElement('div');
      chartsWrap.style.display = 'grid';
      chartsWrap.style.gridTemplateColumns = '360px 1fr';
      chartsWrap.style.gap = '14px';
      chartsWrap.style.marginTop = '14px';

      const pieCard = document.createElement('div');
      pieCard.style.border = '1px solid #e5e7eb';
      pieCard.style.borderRadius = '14px';
      pieCard.style.padding = '12px';
      pieCard.innerHTML = `
        <div style="font-size:12px;font-weight:900;">Risk Status Distribution</div>
        <div style="margin-top:10px;display:flex;gap:12px;align-items:center;">
          <canvas id="hg_pie" width="150" height="150" style="display:block;"></canvas>
          <div id="hg_legend" style="display:flex;flex-direction:column;gap:6px;"></div>
        </div>
      `;

      const insightsCard = document.createElement('div');
      insightsCard.style.border = '1px solid #e5e7eb';
      insightsCard.style.borderRadius = '14px';
      insightsCard.style.padding = '12px';
      insightsCard.innerHTML = `
        <div style="font-size:12px;font-weight:900;">Executive Summary</div>
        <div style="margin-top:8px;font-size:12px;color:#334155;line-height:1.5;">
          This report summarizes district heat-risk rankings from the cached daily analysis. It highlights the top-risk district and provides a full ranking table.
        </div>
        <div style="margin-top:10px;font-size:12px;color:#334155;line-height:1.5;">
          <b>Top risk:</b> ${safe(top?.district_name || report.districtName)} (${safe(top?.risk_status || report.riskStatus)}, score ${fmtNum(top?.risk_score, 3)}).
        </div>
      `;

      chartsWrap.appendChild(pieCard);
      chartsWrap.appendChild(insightsCard);

      const tableCard = document.createElement('div');
      tableCard.style.marginTop = '14px';
      tableCard.style.border = '1px solid #e5e7eb';
      tableCard.style.borderRadius = '14px';
      tableCard.style.overflow = 'hidden';
      tableCard.innerHTML = `
        <div style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
          <div>
            <div style="font-size:12px;font-weight:900;">District Risk Rankings</div>
            <div style="margin-top:2px;font-size:11px;color:#64748b;">Sorted by risk score (descending)</div>
          </div>
          <div style="font-size:11px;color:#475569;">Rows: ${Array.isArray(rankings) ? rankings.length : 0}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#ffffff;">
              <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-size:10px;">Rank</th>
              <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-size:10px;">District</th>
              <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-size:10px;">Status</th>
              <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;font-size:10px;">Score</th>
            </tr>
          </thead>
          <tbody id="hg_rank_rows"></tbody>
        </table>
      `;

      container.appendChild(header);
      container.appendChild(cards);
      container.appendChild(chartsWrap);
      container.appendChild(tableCard);
      document.body.appendChild(container);

      // Fill rankings rows
      const rowsEl = container.querySelector('#hg_rank_rows') as HTMLElement | null;
      const sortedRanks = Array.isArray(rankings)
        ? [...rankings].sort((a: any, b: any) => (b?.risk_score ?? 0) - (a?.risk_score ?? 0))
        : [];
      if (rowsEl) {
        rowsEl.innerHTML = sortedRanks
          .map((r: any, idx: number) => {
            const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            const st = safe(r?.risk_status);
            const c = colorForStatus(st);
            return `
              <tr style="background:${bg};">
                <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;">${idx + 1}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;font-weight:700;">${safe(r?.district_name)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;">
                  <span style="display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid ${c}33;background:${c}1A;color:${c};font-weight:800;font-size:10px;">${st}</span>
                </td>
                <td style="padding:8px 12px;border-bottom:1px solid #eef2f7;text-align:right;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;">${fmtNum(r?.risk_score, 3)}</td>
              </tr>
            `;
          })
          .join('');
      }

      // Draw the pie chart
      const pie = container.querySelector('#hg_pie') as HTMLCanvasElement | null;
      const legend = container.querySelector('#hg_legend') as HTMLElement | null;
  const distEntries: Array<[string, number]> = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const total = distEntries.reduce((s, [, v]) => s + v, 0);

      if (legend) {
        legend.innerHTML = distEntries
          .map(([k, v]) => {
            const c = colorForStatus(k);
            const pct = total ? Math.round(((v ?? 0) / total) * 100) : 0;
            return `
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:10px;height:10px;border-radius:3px;background:${c};display:inline-block;"></span>
                <span style="font-size:11px;color:#334155;"><b>${safe(k)}</b> — ${v} (${pct}%)</span>
              </div>
            `;
          })
          .join('');
      }

      if (pie && distEntries.length) {
        const ctx = pie.getContext('2d');
        if (ctx) {
          const cx = pie.width / 2;
          const cy = pie.height / 2;
          const r = Math.min(cx, cy) - 4;
          let start = -Math.PI / 2;
          distEntries.forEach(([k, v]) => {
            const frac = total ? (v ?? 0) / total : 0;
            const end = start + frac * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = colorForStatus(k);
            ctx.fill();
            start = end;
          });
          // hole for donut look
          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Render to canvas.
  const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const imgW = usableW;
      const imgH = (canvas.height * imgW) / canvas.width;

      // Slice across PDF pages to avoid awkward whitespace.
      let remaining = imgH;
      let yOffset = 0;
      let pageIndex = 0;

      while (remaining > 0) {
        if (pageIndex > 0) doc.addPage();
        const sliceH = Math.min(remaining, usableH);

        // Create a slice canvas for this page.
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.floor((sliceH * canvas.width) / imgW);
        const sctx = slice.getContext('2d');
        if (sctx) {
          sctx.fillStyle = '#ffffff';
          sctx.fillRect(0, 0, slice.width, slice.height);
          sctx.drawImage(
            canvas,
            0,
            Math.floor((yOffset * canvas.width) / imgW),
            canvas.width,
            slice.height,
            0,
            0,
            slice.width,
            slice.height
          );
        }

        const sliceData = slice.toDataURL('image/png');
        doc.addImage(sliceData, 'PNG', margin, margin, imgW, sliceH);

        remaining -= sliceH;
        yOffset += sliceH;
        pageIndex += 1;
      }

      document.body.removeChild(container);
      doc.save(`heatguard-report_${safeDistrict}_${dateStr}.pdf`);
    } catch (e) {
      console.error(e);
      // If the HTML->canvas approach fails, fall back to a simple jsPDF text PDF (never JSON).
      try {
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        doc.setFontSize(16);
        doc.text('HeatGuard AI — Daily Risk Report', 40, 50);
        doc.setFontSize(11);
        doc.text(`Generated: ${new Date(report.createdAt).toLocaleString()}`, 40, 75);
        doc.text(`District: ${String(report.districtName || '—')}`, 40, 95);
        doc.text(`Status: ${String(report.riskStatus || '—')}`, 40, 115);
        doc.text('Note: The detailed PDF layout failed to render on this device/browser.', 40, 145);
        doc.save(`heatguard-report_${safeDistrict}_${dateStr}.pdf`);
      } catch (e2) {
        console.error(e2);
      }
    }
  };

  const deleteReport = (id: string) => {
    if (!window.confirm('Delete this report?')) return;
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const clearAllReports = () => {
    if (!window.confirm('Clear all reports?')) return;
    setReports([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={24} className="text-chart-1" /> Generated Reports</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={createDailyTopRiskReport}
            className="px-4 py-2 rounded-xl font-bold shadow-3d-sm active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 w-full sm:w-auto justify-center bg-primary text-primary-foreground hover:opacity-90"
            title="Generate today's report from cached (DB) district rankings"
          >
            <Activity size={18} /> Generate Daily Report (PDF)
          </button>
          <button
            onClick={clearAllReports}
            className="px-4 py-2 rounded-xl font-bold border-2 border-border bg-card hover:bg-muted/10 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <Trash2 size={18} /> Clear
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-border rounded-xl">
          <div className="text-muted-foreground mb-2">No Reports Generated</div>
          <p className="text-xs text-muted-foreground/60">Run a district analysis, then click “New Report”. Reports are saved locally in your browser.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((r) => (
            <div key={r.id} className="bg-card border-2 border-border rounded-2xl shadow-3d p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">{r.districtName}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.riskStatus === 'Red' ? 'bg-red-500/10 text-red-500' : r.riskStatus === 'Amber' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  {r.riskStatus}
                </span>
              </div>

              <div className="mt-4 text-xs text-muted-foreground line-clamp-4">
                <span className="font-semibold">Summary:</span>{' '}
                {r.payload?.type === 'daily_top_risk_report'
                  ? (() => {
                      const top = r.payload?.top_risk_district;
                      const date = r.payload?.date;
                      const status = top?.risk_status ? `${top.risk_status}` : 'Unknown';
                      const score = typeof top?.risk_score === 'number' ? top.risk_score.toFixed(3) : '—';
                      return `Daily cached rankings${date ? ` (${date})` : ''}: top risk is ${top?.district_name || r.districtName} (${status}, score=${score}).`;
                    })()
                  : (String(r.payload?.prescriptive_advice || '').slice(0, 220) || '—')}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => downloadReportPDF(r)}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Download PDF
                </button>
                <button
                  onClick={() => deleteReport(r.id)}
                  className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Dashboard View (Main) ---

interface DashboardViewProps {
  onViewChange: (view: ViewType) => void;
  rankings: DistrictRanking[];
  rankingsLoading: boolean;
  simulationData: DistrictData;
  onSimulationChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onRunAnalysis: () => void;
  analysisResult: AnalysisResponse | null;
  loading: boolean;
  logs: string[];
}

const DashboardView: React.FC<DashboardViewProps> = ({
  onViewChange,
  rankings,
  rankingsLoading,
  simulationData,
  onSimulationChange,
  onRunAnalysis,
  analysisResult,
  loading,
  logs
}) => {
  const navigate = useNavigate();
  const [showLogs, setShowLogs] = useState(false); // State for Logs Modal
  const [trendData, setTrendData] = useState<any[]>([]); // New State for Chart Data

  const [refetchModalOpen, setRefetchModalOpen] = useState(false);
  const [refetchModalMessage, setRefetchModalMessage] = useState<string>('');
  const [refetchInProgress, setRefetchInProgress] = useState(false);

  const [rankingsFetchedOnce, setRankingsFetchedOnce] = useState<boolean>(() => {
    try {
      return localStorage.getItem('heatguard_rankings_fetched_once_v1') === '1';
    } catch {
      return false;
    }
  });

  // Extract batch processing info from logs
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : "";
  const batchInfo = rankingsLoading
      ? (latestLog.includes("Processing batch") ? latestLog.replace(">", "").trim() : "Processing...")
      : "Live Monitoring Active";

  const handleRefetchData = async () => {
    const already = rankingsFetchedOnce;
    const msg = already
      ? 'This will refetch district rankings again. It may take some time because there are many districts. You already fetched this data once in this browser. Continue?'
      : 'This will fetch district rankings. It may take some time because there are many districts. Continue?';
    setRefetchModalMessage(msg);
    setRefetchModalOpen(true);
  };

  const confirmRefetch = async () => {
    setRefetchInProgress(true);
    try {
      console.log('[Dashboard] Refetch requested.');
      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(`http://localhost:8000/api/districts/rankings?force=1&_ts=${Date.now()}`);
        const timeout = window.setTimeout(() => {
          es.close();
          reject(new Error('Timeout refetching rankings'));
        }, 20000);

        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'log') console.log('[Rankings SSE]', payload.message);
            if (payload?.type === 'error') {
              console.warn('[Rankings SSE] error', payload.message);
              window.clearTimeout(timeout);
              es.close();
              reject(new Error(payload?.message || 'Rankings error'));
            }
            if (payload?.type === 'result') {
              console.log('[Rankings SSE] result received');
              window.clearTimeout(timeout);
              es.close();
              resolve();
            }
            if (payload?.type === 'complete') {
              window.clearTimeout(timeout);
              es.close();
              resolve();
            }
          } catch {
            // ignore
          }
        };

        es.onerror = (err) => {
          window.clearTimeout(timeout);
          es.close();
          reject(err);
        };
      });

      setRankingsFetchedOnce(true);
      try {
        localStorage.setItem('heatguard_rankings_fetched_once_v1', '1');
      } catch {
        // ignore
      }

      setRefetchModalOpen(false);
    } catch (e) {
      console.error(e);
      setRefetchModalMessage('Failed to refetch rankings. Please ensure the backend is running and try again.');
    } finally {
      setRefetchInProgress(false);
    }
  };

  // Fetch trend data when rankings update
  useEffect(() => {
    const fetchTrend = async () => {
         const targetDistrict = rankings.length > 0 ? rankings[0].district_name : "Adilabad";
         try {
             // Retrieve real historical data from backend
             // Ask for enough history to reliably build the last-7-calendar-days window.
             const history = await HeatGuardAPI.getDistrictHistory(targetDistrict, 60);

             // Format for chart
             const chartDataRaw = (Array.isArray(history) ? history : [])
               .filter((h: any) => h?.date)
               .map((h: any) => ({
                 date: h.date,
                 max_temp: typeof h.max_temp === 'number' ? h.max_temp : Number(h.max_temp),
                 shortDate: new Date(h.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
               }))
               .filter((d: any) => d?.date && Number.isFinite(d?.max_temp));

             // Sort by date ascending
             chartDataRaw.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

             // Ensure we always show the last 7 calendar days.
             // Avoid null gaps in the chart (Recharts will skip nulls and you can end up with < 7 points).
             const byDay = new Map<string, { date: string; max_temp: number; shortDate: string }>();
             chartDataRaw.forEach((row: any) => {
               const dayKey = new Date(row.date).toISOString().slice(0, 10);
               byDay.set(dayKey, row);
             });

             const days: any[] = [];

             // Anchor the window to the latest date we actually have.
             // This avoids the common case where the backend is "ahead" or "behind" local time,
             // which can make the chart look like it has only 6 days.
             const latestKeyFromHistory = chartDataRaw.length > 0
               ? String(chartDataRaw[chartDataRaw.length - 1].date).slice(0, 10)
               : null;

             const anchor = latestKeyFromHistory ? new Date(latestKeyFromHistory) : new Date();
             if (!Number.isNaN(anchor.getTime())) {
               anchor.setHours(0, 0, 0, 0);
             }

             for (let i = 6; i >= 0; i--) {
               const d = new Date(anchor);
               d.setDate(anchor.getDate() - i);
               const key = d.toISOString().slice(0, 10);
               const row = byDay.get(key);

               // Carry-forward last known value so all 7 days plot.
               const prev = days.length > 0 ? days[days.length - 1] : null;
               const carried = typeof prev?.max_temp === 'number' && Number.isFinite(prev.max_temp) ? prev.max_temp : null;
               const firstKnown = chartDataRaw.find((x: any) => typeof x?.max_temp === 'number' && Number.isFinite(x.max_temp))?.max_temp ?? null;
               const fallback = carried ?? firstKnown;
               const value = typeof row?.max_temp === 'number' && Number.isFinite(row.max_temp) ? row.max_temp : fallback;

               days.push({
                 date: key,
                 shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                 max_temp: value
               });
             }

             // If we still don't have any numeric data, show empty rather than a flat zero/NaN line.
             if (!days.some((x) => typeof x?.max_temp === 'number' && Number.isFinite(x.max_temp))) {
               setTrendData([]);
               return;
             }

             setTrendData(days);
         } catch (e) {
             console.error("Failed to fetch trend data", e);
             setTrendData([]);
         }
    };

    if (rankings.length > 0) {
       fetchTrend();
    }
  }, [rankings]);

  return (
  <>

    <ConfirmModal
      open={refetchModalOpen}
      title="Refetch district rankings"
      message={refetchModalMessage}
      confirmText={refetchInProgress ? 'Refetching…' : 'Continue'}
      cancelText="Cancel"
      variant={rankingsFetchedOnce ? 'warning' : 'default'}
      isLoading={refetchInProgress}
      onCancel={() => {
        if (!refetchInProgress) setRefetchModalOpen(false);
      }}
      onConfirm={confirmRefetch}
    />


    {/* Log Console Modal */}
    {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-4xl bg-black border border-green-900 rounded-lg shadow-2xl overflow-hidden flex flex-col h-[600px]">
                <button
                    onClick={() => setShowLogs(false)}
                    className="absolute top-2 right-2 text-green-500 hover:text-white z-10 p-1"
                >
                    <X size={20} />
                </button>
                <LogConsole logs={logs} loading={rankingsLoading} />
            </div>
        </div>
    )}

    <div className="mb-8">
        {/* Header with Logs Button */}
        <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-4 w-full max-w-xl">
                <h2 className="text-xl font-bold flex items-center gap-2 shrink-0">
                    <AlertTriangle className="text-destructive" size={24} />
                    High Priority Alerts
                </h2>
                {rankingsLoading && (
                    <div className="flex-1 flex flex-col gap-1 justify-center">
                        <div className="flex justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            <span>Processing Real-time Data</span>
                            <span className="animate-pulse">{batchInfo.includes('batch') ? batchInfo.replace('Processing batch', '').replace('...', '') : 'Initializing...'}</span>
                        </div>
                    </div>
                )}
             </div>

             <div className="flex gap-2">
        <button
          onClick={handleRefetchData}
          className="text-sm font-bold bg-muted/10 hover:bg-muted/20 text-foreground px-3 py-2 rounded-lg border border-border transition-colors flex items-center gap-2"
          title={rankingsFetchedOnce ? 'Refetch rankings (already fetched once in this browser)' : 'Fetch rankings'}
        >
          <Activity size={16} />
          Refetch Data
        </button>
                <button
                    onClick={() => setShowLogs(true)}
                    className="text-sm font-bold bg-muted/10 hover:bg-muted/20 text-foreground px-3 py-2 rounded-lg border border-border transition-colors flex items-center gap-2"
                >
                    <ScrollText size={16} />
                    System Logs
                </button>
                 <button
                     onClick={() => onViewChange('rankings')}
                    className="text-sm font-bold text-primary hover:underline flex items-center gap-1 px-2"
                 >
                    View Full Rankings <ArrowUpRight size={14} />
                 </button>
             </div>
        </div>

        {/* Alerts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {rankingsLoading && rankings.length === 0 ? (
                 <div className="col-span-2 p-8 text-center text-muted-foreground bg-card rounded-xl border border-border border-dashed flex flex-col items-center justify-center gap-4">
                     <div className="w-full max-w-sm space-y-4">
                         <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                             <span>Initializing System</span>
                             <span className="text-primary animate-pulse">Running</span>
                         </div>
                         <div className="space-y-2">
                             <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                 <div className="h-full bg-primary animate-pulse w-full origin-left scale-x-[0.6]"></div>
                             </div>
                             <p className="text-xs text-muted-foreground font-mono text-center">
                                 {batchInfo.includes('batch') ? batchInfo : "Connecting to Satellite Feed..."}
                             </p>
                         </div>
                     </div>
                 </div>
             ) : (
                <>
                {rankings.filter(d => d.risk_score > 0.0).length === 0 ? (
                 <div className="col-span-2 p-6 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-700">
                     <Shield size={24} />
                     <div>
                         <h4 className="font-bold">System Nominal</h4>
                         <p className="text-sm">No critical heatwave alerts detected in monitored districts.</p>
                     </div>
                 </div>
                ) : (
                rankings
                .filter(d => d.risk_score > 0.0)
                .slice(0, 2)
                .map((district) => (
                    <div key={district.district_name} className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex items-start gap-4">
                        <div className="p-3 bg-background rounded-full border border-destructive/30 text-destructive mt-1">
                            <Thermometer size={24} />
                        </div>
                        <div>
                             <h4 className="font-bold text-lg text-foreground">{district.district_name} District</h4>
                             <div className="flex items-center gap-2 mt-1 mb-2">
                                <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Critical</span>
                                <span className="text-sm text-foreground font-medium">Heat hospitalization risk: {(district.risk_score * 100).toFixed(0)}%</span>
                             </div>
                             <p className="text-sm text-muted-foreground/90">
                                High probability of heatwave impact. {district.max_temp.toFixed(1)}°C detected.
                                {district.pct_outdoor_workers > 30 ? " Large outdoor workforce at risk." : ""}
                             </p>
                        </div>
                    </div>
                ))
               )}
               </>
             )}
        </div>
     </div>

     {/* Remaining Dashboard Content - Removing Mock Data References */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        title="Avg Temperature"
        loading={rankingsLoading}
        value={(rankings.reduce((acc, curr) => acc + curr.max_temp, 0) / (rankings.length || 1)).toFixed(1) + "°C"}
        change=""
        trend="neutral"
        isIncreaseBad={true}
        icon={<Thermometer size={24} />}
      />
      {/* Replaced other cards with derived data or generic placeholders */}
      <StatCard
        title="Avg LST"
        loading={rankingsLoading}
        value={(rankings.reduce((acc, curr) => acc + curr.lst, 0) / (rankings.length || 1)).toFixed(1) + "°C"}
        change=""
        trend="neutral"
        isIncreaseBad={true}
        icon={<Droplet size={24} />}
      />
      <StatCard
        title="High Risk Districts"
        loading={rankingsLoading}
        value={rankings.filter(r => r.risk_status === 'Red').length.toString()}
        change=""
        trend="neutral"
        isIncreaseBad={true}
        icon={<AlertTriangle size={24} />}
      />
      <StatCard
        title="Monitored Districts"
        loading={rankingsLoading}
        value={rankings.length.toString()}
        change="100%"
        trend="neutral"
        isIncreaseBad={false}
        icon={<Activity size={24} />}
      />
    </div>

    {/* Chart Section - Hiding if no data */}
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8">
      <div className="xl:col-span-8 bg-card text-card-foreground p-6 rounded-2xl border-2 border-border shadow-3d flex flex-col h-[400px]">
         <div className="flex justify-between items-center mb-6">
             <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="text-primary" size={20} />
                    7-Day Trend
                </h3>
                <p className="text-xs text-muted-foreground">
                    Historical Max Temp for {rankings.length > 0 ? rankings[0].district_name : "Selected District"}
                </p>
             </div>
             <div className="flex gap-2">
                 <span className="text-xs font-bold px-2 py-1 bg-primary/10 text-primary rounded-md">Max Temp</span>
             </div>
         </div>

         <div className="flex-1 w-full min-h-0">
             {trendData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                            dataKey="shortDate"
                            stroke="var(--muted-foreground)"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}°`}
                            domain={['dataMin - 1', 'dataMax + 1']}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                            itemStyle={{ color: 'var(--foreground)' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="max_temp"
                            stroke="var(--primary)"
                            fillOpacity={1}
                            fill="url(#colorTemp)"
                            strokeWidth={3}
                            connectNulls={true}
                            name="Max Temp (°C)"
                            dot={{ r: 4, strokeWidth: 2, fill: "var(--background)", stroke: "var(--primary)" }}
                            activeDot={{ r: 6 }}
                        />
                    </AreaChart>
                 </ResponsiveContainer>
             ) : (
                 <div className="flex items-center justify-center h-full text-muted-foreground">
                    {rankingsLoading ? "Loading historical data..." : "No trend data available."}
                 </div>
             )}
         </div>
      </div>

      {/* Map Quick View */}
       <div className="xl:col-span-4 bg-card text-card-foreground p-6 rounded-2xl border-2 border-border shadow-3d flex flex-col h-[400px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MapIcon className="text-primary" size={20} />
            Risk Overview
          </h2>
          <button onClick={() => onViewChange('map')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1 px-2">
            Full Map <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden relative border border-border/30 bg-[#1a2c38]">
          <IndiaMapUI simplified={true} rankings={rankings} />
        </div>
      </div>
    </div>
  </>
  );
};

// --- Dashboard ---
interface DashboardProps {
  rankings: DistrictRanking[];
  rankingsLoading: boolean;
  logs: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ rankings, rankingsLoading, logs }) => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigate = useNavigate(); // Hook for navigation

  // --- Simulation State (LEGACY - kept for backward compatibility) ---
  const [loading, setLoading] = useState(false);
  const [simulationData, setSimulationData] = useState<DistrictData>({
    district_name: 'Adilabad',
    max_temp: 45.0,
    lst: 46.5,
    humidity: 40,
    pct_children: 12,
    pct_outdoor_workers: 25,
    pct_vulnerable_social: 15,
    date: new Date().toISOString().split('T')[0]
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);

  // Restore last analysis result so reports/chat can keep working after route/view navigation.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('heatguard_last_analysis_v1');
      if (raw) setAnalysisResult(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const handleSimulationChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setSimulationData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      // 1. Seed data if needed (just in case it's first run)
      // await HeatGuardAPI.seedData();

      // 2. Run Analysis
      const result = await HeatGuardAPI.analyzeDistrict(simulationData);
      setAnalysisResult(result);
      try {
        localStorage.setItem('heatguard_last_analysis_v1', JSON.stringify(result));
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("Analysis Failed:", err);
      alert("Failed to run analysis. Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
    return () => clearTimeout(timer);
  }, [isSidebarCollapsed]);

  // Handle auto-collapsing sidebar on small screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(!isMobileMenuOpen);
    } else {
      setSidebarCollapsed(!isSidebarCollapsed);
    }
  };

  return (
    <div className="flex h-screen w-full bg-sidebar text-foreground font-sans selection:bg-primary/20 overflow-hidden">

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Responsive Drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 h-full bg-sidebar
          transition-transform duration-300 ease-in-out
          flex flex-col shadow-2xl md:shadow-none
          md:relative md:translate-x-0
          ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
          ${!isMobileMenuOpen && isSidebarCollapsed ? 'md:w-[70px]' : 'md:w-64'}
        `}
      >
        {/* Mobile Close Button */}
        <div className="absolute top-4 right-4 md:hidden text-sidebar-foreground/50 hover:text-sidebar-foreground cursor-pointer" onClick={() => setIsMobileMenuOpen(false)}>
          <X size={24} />
        </div>

        {/* Header & Logo */}
        <div className="h-20 flex items-center justify-between px-4 relative mt-2 md:mt-0">
          <Logo collapsed={isSidebarCollapsed && !isMobileMenuOpen} />
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden">

          <div className="space-y-6">
            <div>
              <div className={`px-3 text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider mb-2 transition-opacity duration-300 ${isSidebarCollapsed && !isMobileMenuOpen ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>Platform</div>
              <NavItem
                icon={<LayoutDashboard size={20} />}
                label="Dashboard"
                active={currentView === 'dashboard'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => { setCurrentView('dashboard'); setIsMobileMenuOpen(false); }}
              />
              <NavItem
                icon={<MapIcon size={20} />}
                label="Risk Map"
                active={currentView === 'map'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => { setCurrentView('map'); setIsMobileMenuOpen(false); }}
              />
               <NavItem
                icon={<Activity size={20} />}
                label="Full Rankings"
                active={currentView === 'rankings'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => {
                  setCurrentView('rankings');
                  setIsMobileMenuOpen(false);
                }}
              />
              <NavItem
                icon={<BrainCircuit size={20} />}
                label="RAG Engine"
                active={currentView === 'rag'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => { setCurrentView('rag'); setIsMobileMenuOpen(false); }}
              />
            </div>

            <div>
              <div className={`px-3 text-xs font-bold text-sidebar-foreground/70 uppercase tracking-wider mb-2 mt-4 transition-opacity duration-300 ${isSidebarCollapsed && !isMobileMenuOpen ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>Knowledge Base</div>
              <NavItem
                icon={<Briefcase size={20} />}
                label="Data Sources"
                active={currentView === 'datasources'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => { setCurrentView('datasources'); setIsMobileMenuOpen(false); }}
              />
              <NavItem
                icon={<FileText size={20} />}
                label="Reports"
                active={currentView === 'reports'}
                collapsed={isSidebarCollapsed && !isMobileMenuOpen}
                onClick={() => { setCurrentView('reports'); setIsMobileMenuOpen(false); }}
              />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-1 border-t border-sidebar-border mt-2">
          <NavItem icon={<Settings size={20} />} label="Settings" collapsed={isSidebarCollapsed && !isMobileMenuOpen} />
          <NavItem icon={<LifeBuoy size={20} />} label="Support" collapsed={isSidebarCollapsed && !isMobileMenuOpen} />
        </div>

        <div className="p-4 mx-2 mb-2 flex flex-col gap-2">
          <div className={`flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-sidebar-accent/10 transition-colors ${isSidebarCollapsed && !isMobileMenuOpen ? 'justify-center w-full' : ''}`}>
            <div className="w-9 h-9 flex-shrink-0 rounded-full bg-sidebar-border text-sidebar-foreground flex items-center justify-center shadow-sm">
              <User size={18} />
            </div>
            <div className={`flex-1 overflow-hidden transition-all duration-300 ${(isSidebarCollapsed && !isMobileMenuOpen) ? 'w-0 opacity-0 absolute' : 'w-auto opacity-100'}`}>
              <div className="text-sm font-medium text-sidebar-foreground truncate">HeatGuard Admin</div>
              <div className="text-xs text-sidebar-foreground/50 truncate">admin@heatguard.ai</div>
            </div>
            {(!isSidebarCollapsed || isMobileMenuOpen) && <Settings size={14} className="text-sidebar-foreground/50 flex-shrink-0" />}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 bg-background shadow-2xl relative w-full my-4 mr-4 ml-0 rounded-3xl h-[calc(100%-2rem)] flex flex-col ${currentView === 'map' ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-6'}`}>
        {/* Top Header */}
        <div className={`flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0 ${currentView === 'map' ? 'absolute top-4 left-4 right-4 z-10 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2 text-muted-foreground text-sm w-full md:w-auto pointer-events-auto">
            {/* Sidebar Toggle Button */}
            <button
              onClick={toggleSidebar}
              className="bg-card p-2 rounded-lg border-2 border-border shadow-sm text-foreground hover:bg-sidebar-accent/10 transition-colors flex-shrink-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {window.innerWidth < 768 ? <Menu size={20} /> : <PanelLeft size={20} className={isSidebarCollapsed ? 'rotate-180' : ''} />}
            </button>
            <span className="hidden md:inline">/</span>
            <span className="text-foreground font-medium capitalize truncate">{currentView.replace('rag', 'RAG Engine').replace('datasources', 'Data Sources')}</span>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end" />
        </div>

        {/* View Switcher */}
        {currentView === 'dashboard' && (
          <DashboardView
            onViewChange={setCurrentView}
            rankings={rankings}
            rankingsLoading={rankingsLoading}
            simulationData={simulationData}
            onSimulationChange={handleSimulationChange}
            onRunAnalysis={runAnalysis}
            analysisResult={analysisResult}
            loading={loading}
            logs={logs}
          />
        )}
        {currentView === 'map' && (
          <div className="flex-1 w-full min-h-[600px] relative">
            <IndiaMapUI rankings={rankings} />
          </div>
        )}
        {currentView === 'rag' && <RagEngineView />}
  {currentView === 'datasources' && <DataSourcesView />}
  {currentView === 'reports' && <ReportsView analysisResult={analysisResult} />}
        {currentView === 'rankings' && <RankingsView rankings={rankings} loading={rankingsLoading} />}
      </main>

    </div>
  );
};

export default Dashboard;
