import React, { useState, useRef, useEffect } from 'react';
import * as Tesseract from 'tesseract.js';

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
import { HeatGuardAPI, DistrictData, AnalysisResponse, DistrictRanking, RankingsResponse } from '../api';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui';
import { useNavigate } from 'react-router-dom';
import { LogConsole } from '../components/LogConsole';
import { RankingsView } from './RankingsPage';
import { Settings } from 'lucide-react'; // Added Settings import

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
      {React.cloneElement(icon as React.ReactElement, { size: 22, strokeWidth: 2 })}
    </div>
  ) : null;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-all duration-300 hover:border-primary/20 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity transform group-hover:scale-110 duration-700 pointer-events-none">
          {icon && React.cloneElement(icon as React.ReactElement, { size: 140 })}
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
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDistricts, setFilteredDistricts] = useState<DistrictRanking[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictRanking | null>(null);

  // 1. Fetch Base Map (India States)
  useEffect(() => {
    // Using a reliable source for India States GeoJSON
    // Alternative: https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States
    fetch("https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson") // TODO: Switch to full India map if needed, or stick to user context
      // Actually, let's use a full India map to be safe since the data seems national.
      // Replacing with valid India States GeoJSON URL
      .then(() => fetch("https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States"))
      .then(res => res.json())
      .then(data => {
        setGeoData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load map base:", err);
        // Fallback to plotting just points if map fails?
        // For now, let's just set loading false and try to render what we can
        setLoading(false);
      });
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

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

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
    // Color Scale based on Risk Score (0-1 range)
    const colorScale = (score: number) => {
        if (score > 0.75) return "#ef4444"; // High Risk
        if (score > 0.50) return "#f97316"; // Moderate Risk
        return "#10b981"; // Low Risk
    };

    // Plot valid points
    const validPoints = rankings.filter(d => d.lat && d.lon);

    // Fix: Add transparent background for zoom capturing
    if (!simplified) {
        g.append("rect")
            .attr("width", width * 10)
            .attr("height", height * 10)
            .attr("x", -width * 5)
            .attr("y", -height * 5)
            .attr("fill", "transparent")
            .style("pointer-events", "all");
    }

    // Add Wave/Pulse effect for high risk districts
    if (!simplified) {
        g.selectAll(".pulse")
            .data(validPoints.filter(d => d.risk_score > 0.75))
            .enter()
            .append("circle")
            .attr("cx", d => projection([d.lon, d.lat])?.[0] || 0)
            .attr("cy", d => projection([d.lon, d.lat])?.[1] || 0)
            .attr("r", 5)
            .attr("fill", "none")
            .attr("stroke", "#ef4444")
            .attr("stroke-width", 2)
            .attr("opacity", 0.6)
            .style("pointer-events", "none")
            .transition()
            .duration(2000)
            .ease(d3.easeCubicOut)
            .repeat(Infinity)
            .attr("r", 30)
            .attr("opacity", 0);
    }

    g.selectAll("circle.point")
      .data(validPoints)
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
          d3.select(this)
            .transition().duration(200)
            .attr("r", simplified ? 3 : 5)
            .attr("opacity", 0.8);
      })
      .on("click", (event, d) => {
          event.stopPropagation();
          setSelectedDistrict(d);
          // Optional: Zoom to clicked
      });

    // --- Configure Zoom ---
    if (!simplified) {
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 8]) // Min/Max zoom
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
                transformRef.current = event.transform;
            });

        svg.call(zoom);

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

      if (projection && zoom && district.lat && district.lon) {
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
  };

  return (
    <div className={`relative flex flex-col bg-[#1a2c38] overflow-hidden ${simplified ? 'w-full h-full' : 'w-full h-full border-2 border-border rounded-xl shadow-3d'}`}>

      {/* --- Search Bar Overlay --- */}
      {!simplified && (
        <div className="absolute top-4 left-4 z-20 w-80">
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
                                    <span className="text-[10px] text-slate-400">rank #{d.rank_id}</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold
                                    ${d.risk_score > 75 ? 'bg-red-500/20 text-red-400' :
                                      d.risk_score > 50 ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                                    {d.risk_score.toFixed(0)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Legend */}
             <div className="mt-4 bg-[#2a3b47]/80 backdrop-blur p-3 rounded-xl border border-slate-600 shadow-xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Heat Risk Index</div>
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-orange-500 to-red-500 mb-1"></div>
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>Safe</span>
                    <span>Caution</span>
                    <span>Danger</span>
                </div>
            </div>
        </div>
      )}

      {/* --- Selected District Details Card --- */}
      {selectedDistrict && !simplified && (
          <div className="absolute top-4 right-4 z-20 w-72 bg-[#2a3b47]/95 backdrop-blur border border-slate-600 rounded-xl shadow-2xl p-4 animate-in slide-in-from-right-10 duration-300">
               <div className="flex justify-between items-start mb-4">
                   <div>
                       <h3 className="font-bold text-lg text-white">{selectedDistrict.district_name}</h3>
                       <div className="text-xs text-slate-400">Lat: {selectedDistrict.lat.toFixed(2)}, Lon: {selectedDistrict.lon.toFixed(2)}</div>
                   </div>
                   <button
                       onClick={() => setSelectedDistrict(null)}
                       className="p-1 hover:bg-slate-600 rounded-full text-slate-400 hover:text-white transition-colors">
                       <X size={16}/>
                   </button>
               </div>

               <div className="space-y-3">
                   <div className="bg-slate-800/50 p-3 rounded-lg flex justify-between items-center">
                       <span className="text-sm text-slate-300">Risk Score</span>
                       <span className={`text-xl font-bold ${selectedDistrict.risk_score > 75 ? 'text-red-400' : 'text-emerald-400'}`}>
                           {selectedDistrict.risk_score.toFixed(1)}
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
                       <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">AI Recommendation</div>
                       <p className="text-xs text-slate-300 leading-relaxed">
                           {selectedDistrict.risk_score > 75
                            ? "Urgent: Activate district cooling centers. High probability of heat-stroke events."
                            : "Monitor local weather stations. standard advisory applies."}
                       </p>
                   </div>
               </div>
          </div>
      )}

      {/* --- Map Container --- */}
      <div className="flex-1 bg-[#1a2c38] relative flex items-center justify-center overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-primary animate-pulse font-bold text-xs">Loading Geospatial Data...</div>}
        <svg ref={svgRef} className={`w-full h-full block ${simplified ? '' : 'cursor-grab active:cursor-grabbing'}`} style={{background: '#1a2c38'}}></svg>
      </div>
    </div>
  );
};

// --- RAG Engine View ---
const RagEngineView = () => {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, newMsg]);
    setInput('');

    // Placeholder response - Real backend integration needed
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        content: 'System: Real RAG backend connection required to process this query.'
      }]);
    }, 500);
  };

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6">
      <div className="flex-1 bg-card rounded-2xl border-2 border-border shadow-3d flex flex-col overflow-hidden min-h-[500px]">
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
              <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-sm whitespace-pre-line shadow-sm ${msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-tr-none font-medium'
                : 'bg-card border border-border rounded-tl-none font-medium'
                }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-sidebar-border flex-shrink-0 flex items-center justify-center text-sidebar-foreground mt-1">
                  <User size={16} />
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="relative flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question..."
              className="w-full bg-muted/30 border-2 border-border rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-primary transition-colors text-foreground placeholder:text-muted-foreground/60"
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

      <div className="w-full xl:w-80 flex flex-col gap-6">
        <div className="bg-card rounded-2xl border-2 border-border shadow-3d p-4 flex-1">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <BrainCircuit size={16} /> Reasoning Process
          </h3>

          <div className="space-y-4 text-center py-10 text-muted-foreground">
             <p className="text-sm">Waiting for Analysis Data...</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border-2 border-border shadow-3d p-4">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <Database size={16} /> Source Context
          </h3>
          <div className="space-y-3 pt-4 text-center text-muted-foreground text-sm">
             No context available.
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Data Sources View ---
const DataSourcesView = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
      // Add files to state with 'Processing' status
      const newFiles = uploads.map(f => ({
          name: f.name,
          size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
          type: f.type,
          status: 'Processing',
          progress: 0,
          date: new Date().toLocaleDateString()
      }));

      setFiles(prev => [...newFiles, ...prev]);

      // Process each file
      for (let i = 0; i < uploads.length; i++) {
          const file = uploads[i];
          const isImage = file.type.startsWith('image/');

          if (isImage) {
               // OCR Logic for Images
               try {
                   await Tesseract.recognize(
                      file,
                      'eng',
                      {
                          logger: m => {
                              if (m.status === 'recognizing text') {
                                  setFiles(prev => prev.map(f => f.name === file.name ? { ...f, progress: Math.floor(m.progress * 100) } : f));
                              }
                          }
                      }
                   );
                   // Success
                   setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'Indexed', progress: 100 } : f));
               } catch (err) {
                   console.error("OCR Failed", err);
                   setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'Failed (OCR Error)', progress: 0 } : f));
               }
          } else {
              // Simulate Upload for other files
              let p = 0;
              const interval = setInterval(() => {
                  p += 10;
                  if (p > 100) {
                      clearInterval(interval);
                      setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'Indexed', progress: 100 } : f));
                  } else {
                      setFiles(prev => prev.map(f => f.name === file.name ? { ...f, progress: p } : f));
                  }
              }, 200);
          }
      }
  };

  return (
  <div className="h-full flex flex-col gap-6">
    <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d flex-shrink-0">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Database size={24} className="text-secondary" /> Knowledge Base Management</h2>
      <p className="text-sm text-muted-foreground/80 mb-6">Manage the documents and datasets used by the RAG engine to generate protocols. Supports PDF, Excel, and Image (OCR) uploads.</p>

      {/* Searchable/Upload Area */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer
            ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border/50 hover:border-primary/50 hover:bg-muted/5'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={`p-4 rounded-full bg-secondary/10 text-secondary mb-4 transition-transform duration-300 ${isDragging ? 'scale-110' : ''}`}>
          <UploadCloud size={32} className="text-secondary" />
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
             {files.map((file, i) => (
                <tr key={i} className="hover:bg-muted/5 group">
                  <td className="p-4 font-medium flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg text-muted-foreground">
                        <FileText size={16} />
                    </div>
                    {file.name}
                  </td>
                  <td className="p-4 text-muted-foreground">{file.type.split('/')[1]?.toUpperCase() || 'FILE'}</td>
                  <td className="p-4 text-muted-foreground font-mono text-xs">{file.size}</td>
                  <td className="p-4">
                      {file.status === 'Processing' ? (
                          <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${file.progress}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-primary">{file.progress}%</span>
                          </div>
                      ) : (
                          <span className={`text-xs px-2 py-1 rounded-full font-bold ${file.status === 'Indexed' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                              {file.status}
                          </span>
                      )}
                  </td>
                  <td className="p-4 text-right">
                    <button
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                    >
                        <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
             ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  );
};

// --- Reports View ---
const ReportsView = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><FileText size={24} className="text-chart-1" /> Generated Reports</h2>
      <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-bold shadow-3d-sm active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 w-full sm:w-auto justify-center">
        <PlusCircle size={18} /> New Report
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
       <div className="col-span-full p-12 text-center border-2 border-dashed border-border rounded-xl">
           <div className="text-muted-foreground mb-2">No Reports Generated</div>
           <p className="text-xs text-muted-foreground/60">Connect to reporting service to view data.</p>
       </div>
    </div>
  </div>
);

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

  // Extract batch processing info from logs
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : "";
  const batchInfo = rankingsLoading
      ? (latestLog.includes("Processing batch") ? latestLog.replace(">", "").trim() : "Processing...")
      : "Live Monitoring Active";

  // Fetch trend data when rankings update
  useEffect(() => {
    const fetchTrend = async () => {
         const targetDistrict = rankings.length > 0 ? rankings[0].district_name : "Adilabad";
         try {
             // Retrieve real historical data from backend
             const history = await HeatGuardAPI.getDistrictHistory(targetDistrict);

             // Format for chart
             const chartData = history.map(h => ({
                 date: h.date, // Assuming backend returns date field in ranking object
                 max_temp: h.max_temp,
                 shortDate: new Date(h.date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
             }));

             // Sort by date ascending
             chartData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

             setTrendData(chartData);
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
                <LogConsole logs={logs} />
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
                                <span className="text-sm text-foreground font-medium">Risk Score: {(district.risk_score * 100).toFixed(0)}%</span>
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

          <button
            className={`
              w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-3d-sm active:translate-y-[2px] active:shadow-none mb-8 flex items-center justify-center gap-2 transition-all
              ${isSidebarCollapsed && !isMobileMenuOpen ? 'py-3 px-0 rounded-full aspect-square' : 'py-3 px-4'}
            `}
            title="New Simulation"
          >
            <PlusCircle size={20} />
            {(!isSidebarCollapsed || isMobileMenuOpen) && <span>New Simulation</span>}
          </button>

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

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="relative w-full md:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search..."
                className="bg-card border-2 border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
            <button className="p-2 bg-card border-2 border-border rounded-xl shadow-3d-sm hover:translate-y-[-1px] transition-all relative hover:shadow-3d-hover flex-shrink-0">
              <Bell size={20} />
              <span className="absolute top-1 right-2 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
          </div>
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
        {currentView === 'map' && <div className="flex-1 w-full h-full relative"><IndiaMapUI rankings={rankings} /></div>}
        {currentView === 'rag' && <RagEngineView />}
        {currentView === 'datasources' && <DataSourcesView />}
        {currentView === 'reports' && <ReportsView />}
        {currentView === 'rankings' && <RankingsView rankings={rankings} />}
      </main>

    </div>
  );
};

export default Dashboard;
