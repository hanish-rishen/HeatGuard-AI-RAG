import React, { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import {
  Bell,
  Search,
  Settings,
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
  X
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
import { HeatGuardAPI, DistrictData, AnalysisResponse } from './api';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from './ui';

// --- Types ---

type ViewType = 'dashboard' | 'map' | 'rag' | 'datasources' | 'reports';

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
  isIncreaseBad?: boolean; // For things like Temp/Hospitalizations, Up is Bad (Red)
  trend: 'up' | 'down' | 'neutral';
}

interface ActionProtocol {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'In Progress' | 'Completed';
}

// --- Mock Data ---

const CHART_DATA = [
  { day: 'Jun 2', value: 30, value2: 20 },
  { day: 'Jun 4', value: 45, value2: 35 },
  { day: 'Jun 6', value: 35, value2: 25 },
  { day: 'Jun 8', value: 55, value2: 40 },
  { day: 'Jun 10', value: 40, value2: 30 },
  { day: 'Jun 12', value: 60, value2: 45 },
  { day: 'Jun 14', value: 50, value2: 40 },
  { day: 'Jun 16', value: 70, value2: 55 },
  { day: 'Jun 18', value: 55, value2: 45 },
  { day: 'Jun 20', value: 65, value2: 50 },
  { day: 'Jun 22', value: 45, value2: 35 },
  { day: 'Jun 24', value: 75, value2: 60 },
  { day: 'Jun 26', value: 60, value2: 50 },
  { day: 'Jun 28', value: 80, value2: 65 },
  { day: 'Jun 30', value: 55, value2: 45 }
];

const ACTION_PROTOCOLS: ActionProtocol[] = [
  { id: '1', title: 'Activate Cooling Centers', description: 'Open cooling centers in Sector 4 & 5 due to forecasted temp > 45°C.', priority: 'High', status: 'In Progress' },
  { id: '2', title: 'SMS Alert Broadcast', description: 'Send hydration reminders to registered elderly citizens.', priority: 'High', status: 'Pending' },
  { id: '3', title: 'Power Grid Optimization', description: 'Reroute power to residential zones to prevent outages.', priority: 'Medium', status: 'Completed' }
];

const UPLOADED_DOCS = [
  { id: 1, name: 'Heatwave_Response_2024.pdf', size: '2.4 MB', date: 'Just now', type: 'PDF' },
  { id: 2, name: 'Hospital_Capacity_Guidelines.docx', size: '1.1 MB', date: '2 hrs ago', type: 'DOCX' },
  { id: 3, name: 'Historical_Temp_Data_Gujarat.csv', size: '14.5 MB', date: 'Yesterday', type: 'CSV' },
  { id: 4, name: 'Emergency_Contact_List_v2.xlsx', size: '0.8 MB', date: 'Yesterday', type: 'XLSX' }
];

const REPORTS = [
  { id: 101, title: 'Weekly Vulnerability Assessment', date: 'June 28, 2024', author: 'AI System', status: 'Ready' },
  { id: 102, title: 'Sector 4 Grid Load Analysis', date: 'June 27, 2024', author: 'Grid Monitor', status: 'Ready' },
  { id: 103, title: 'Monthly Hospitalization Forecast', date: 'June 25, 2024', author: 'Prediction Model', status: 'Processing' },
];

const RAG_CHAT_HISTORY = [
  { id: 1, role: 'ai', content: 'I have analyzed the uploaded documents (Heatwave_Response_2024.pdf, Hospital_Capacity_Guidelines.docx). You can ask me about specific protocols, risk thresholds, or resource allocation strategies.' },
  { id: 2, role: 'user', content: 'What are the mandatory actions when temperature exceeds 45 degrees in residential sectors?' },
  { id: 3, role: 'ai', content: 'According to the *Heatwave_Response_2024.pdf*, if the temperature exceeds 45°C in residential zones, the following "Level 3 - Critical" actions are mandatory:\n\n1.  **Immediate Activation of Cooling Centers**: All community halls with AC must remain open 24/7.\n2.  **Water Distribution**: Deploy mobile water tankers to high-density areas every 4 hours.\n3.  **Work Suspension**: Outdoor labor must be suspended between 12:00 PM and 4:00 PM.' }
];

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

const StatCard: React.FC<StatCardProps> = ({ title, value, change, trend, isIncreaseBad }) => {
  let trendColor = '';
  let TrendIcon = TrendingUp;
  let trendText = '';

  if (trend === 'up') {
    TrendIcon = TrendingUp;
    trendColor = isIncreaseBad ? 'text-destructive' : 'text-green-500';
    trendText = 'Increasing';
  } else if (trend === 'down') {
    TrendIcon = TrendingDown;
    trendColor = isIncreaseBad ? 'text-green-500' : 'text-destructive';
    trendText = 'Decreasing';
  } else {
    trendColor = 'text-gray-500';
    trendText = 'Stable';
  }

  return (
    <div className="bg-card text-card-foreground p-6 rounded-2xl border-2 border-border shadow-3d hover:translate-y-[-4px] hover:shadow-3d-hover transition-all duration-300">
      <h3 className="text-muted-foreground font-bold text-xs uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="text-4xl font-extrabold tracking-tight text-foreground">
          {value}
        </div>
        <div className={`flex items-center gap-1 mb-1.5 text-xs font-bold ${trendColor} bg-card-foreground/5 px-2 py-1 rounded-md border border-border/50`}>
          <TrendIcon size={14} />
          <span>{trendText}</span>
          <span>{change}</span>
        </div>
      </div>
      <div className="mt-4 h-1 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${trendColor.replace('text-', 'bg-')}`} style={{ width: '65%' }}></div>
      </div>
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

const SimulationPanel: React.FC<SimulationPanelProps> = ({ data, onChange, onRun, loading }) => (
  <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d mb-8">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Activity className="text-primary" size={20} />
          Live Risk Simulator
        </h2>
        <p className="text-sm text-muted-foreground/80">Input real-time data to generate AI-driven risk assessments.</p>
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

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">District Name</label>
        <Select
          value={data.district_name}
          onChange={(val) => onChange({ target: { name: 'district_name', value: val } } as any)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select District" value={data.district_name} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Adilabad">Adilabad</SelectItem>
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
        <label className="text-xs font-bold text-muted-foreground uppercase">% Children</label>
        <input
          type="number"
          name="pct_children"
          value={data.pct_children}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">% Outdoor Workers</label>
        <input
          type="number"
          name="pct_outdoor_workers"
          value={data.pct_outdoor_workers}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-muted-foreground uppercase">% Vulnerable Social</label>
        <input
          type="number"
          name="pct_vulnerable_social"
          value={data.pct_vulnerable_social}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

// --- D3.js India Map Component ---
interface IndiaMapUIProps {
  simplified?: boolean;
}

const IndiaMapUI: React.FC<IndiaMapUIProps> = ({ simplified = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const renderMap = async () => {
      try {
        const width = containerRef.current?.clientWidth || 600;
        const height = containerRef.current?.clientHeight || 700;

        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
          .attr("width", width)
          .attr("height", height)
          .attr("viewBox", `0 0 ${width} ${height}`);

        const response = await fetch("https://raw.githubusercontent.com/geohacker/india/master/state/india_telengana.geojson");
        if (!response.ok) throw new Error("Failed to load map data");

        const data = await response.json();

        const projection = d3.geoMercator()
          .center([82, 23])
          .scale(width * 1.2)
          .translate([width / 2, height / 2]);

        const pathGenerator = d3.geoPath().projection(projection);

        const g = svg.append("g");

        g.selectAll("path")
          .data(data.features)
          .enter()
          .append("path")
          .attr("d", pathGenerator as any)
          .attr("fill", "var(--card)")
          .attr("stroke", "var(--primary)")
          .attr("stroke-width", simplified ? 0.3 : 0.5)
          .attr("class", "hover:fill-primary/20 transition-colors duration-300 cursor-pointer")
          .append("title")
          .text((d: any) => d.properties.NAME_1 || "Region");

        const riskZones = [
          { name: "Gujarat (Critical)", coords: [71.1924, 22.2587], risk: "critical", radius: simplified ? 20 : 40 },
          { name: "Rajasthan (Critical)", coords: [74.2179, 27.0238], risk: "critical", radius: simplified ? 25 : 50 },
          { name: "Odisha (Severe)", coords: [85.0985, 20.9517], risk: "severe", radius: simplified ? 18 : 35 },
          { name: "Telangana (Moderate)", coords: [79.0193, 18.1124], risk: "moderate", radius: simplified ? 15 : 30 }
        ];

        const defs = svg.append("defs");
        const filter = defs.append("filter").attr("id", "glow");
        filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        g.selectAll("circle")
          .data(riskZones)
          .enter()
          .append("circle")
          .attr("cx", (d) => projection(d.coords as [number, number])?.[0] || 0)
          .attr("cy", (d) => projection(d.coords as [number, number])?.[1] || 0)
          .attr("r", (d) => d.radius)
          .attr("fill", (d) => {
            if (d.risk === 'critical') return "var(--destructive)";
            if (d.risk === 'severe') return "orange";
            return "var(--chart-1)";
          })
          .attr("opacity", 0.4)
          .style("filter", "url(#glow)")
          .append("title")
          .text((d) => d.name);

        setLoading(false);
      } catch (err) {
        console.error("Error loading map:", err);
        setError("Failed to load map data.");
        setLoading(false);
      }
    };

    renderMap();
    const handleResize = () => renderMap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [simplified]);

  return (
    <div
      className={`relative w-full h-full bg-card overflow-hidden flex flex-col ${simplified ? '' : 'rounded-2xl border-2 border-border shadow-3d'}`}
      ref={containerRef}
    >
      {!simplified && (
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap justify-between items-start gap-4 pointer-events-none">
          <div className="bg-card/90 backdrop-blur-sm p-2 rounded-xl border border-border shadow-lg pointer-events-auto flex items-center gap-2">
            <Search size={18} className="text-muted-foreground ml-2" />
            <input className="bg-transparent border-none focus:outline-none text-sm w-48 text-foreground" placeholder="Search region or city..." />
          </div>

          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="bg-card/90 backdrop-blur-sm p-2 rounded-xl border border-border shadow-lg hover:bg-card cursor-pointer hover:scale-105 transition-transform" title="Layers">
              <Layers size={20} className="text-foreground" />
            </div>
            <div className="bg-card/90 backdrop-blur-sm p-2 rounded-xl border border-border shadow-lg hover:bg-card cursor-pointer hover:scale-105 transition-transform" title="Locate Me">
              <Locate size={20} className="text-foreground" />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 bg-background relative flex items-center justify-center overflow-hidden">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-primary animate-pulse font-bold text-xs">Loading Satellite Data...</div>}
        {error && <div className="absolute inset-0 flex items-center justify-center text-destructive font-bold text-xs">{error}</div>}
        <svg ref={svgRef} className={`w-full h-full ${simplified ? '' : 'cursor-grab active:cursor-grabbing'}`}></svg>

        {!simplified && (
          <div className="absolute bottom-6 right-6 bg-card/90 backdrop-blur-sm p-4 rounded-xl border border-border shadow-3d-sm pointer-events-none">
            <h4 className="text-xs font-bold uppercase mb-2">Heat Risk Index</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-destructive animate-pulse"></span> Critical ({'>'}45°C)
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span> Severe (40-45°C)
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-chart-1"></span> Moderate ({'<'}40°C)
              </div>
            </div>
          </div>
        )}

        {!simplified && (
          <div className="absolute bottom-6 left-6 right-48">
            <div className="bg-card/90 backdrop-blur-sm p-3 rounded-xl border border-border shadow-3d-sm flex items-center gap-4">
              <div className="bg-primary/20 p-2 rounded-lg text-primary cursor-pointer pointer-events-auto">
                <Calendar size={18} />
              </div>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden relative group cursor-pointer pointer-events-auto">
                <div className="absolute top-0 left-0 h-full w-1/3 bg-primary"></div>
                <div className="absolute top-1/2 left-1/3 w-3 h-3 bg-white rounded-full -translate-y-1/2 shadow-sm scale-0 group-hover:scale-100 transition-transform"></div>
              </div>
              <span className="text-xs font-mono">June 2024</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- RAG Engine View ---
const RagEngineView = () => {
  const [messages, setMessages] = useState(RAG_CHAT_HISTORY);
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
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'ai',
        content: 'Retrieving relevant context from "Emergency_Contact_List_v2.xlsx"... \n\nBased on the analysis, the primary contact for Sector 4 electricity board is Mr. Rajesh Kumar (+91 98765 43210).'
      }]);
    }, 1000);
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

          <div className="space-y-4">
            <div className="relative pl-4 border-l-2 border-primary/30 pb-4">
              <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-primary"></div>
              <div className="text-xs font-bold text-primary mb-1">Query Analysis</div>
              <div className="text-xs text-muted-foreground/80">Identified keywords: "temperature", "45 degrees", "residential", "actions".</div>
            </div>
            <div className="relative pl-4 border-l-2 border-primary/30 pb-4">
              <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-primary"></div>
              <div className="text-xs font-bold text-primary mb-1">Retrieval</div>
              <div className="text-xs text-muted-foreground/80">Fetching chunks from 'Heatwave_Response_2024.pdf' (Similarity: 0.92).</div>
            </div>
            <div className="relative pl-4 border-l-2 border-primary/30">
              <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <div className="text-xs font-bold text-primary mb-1">Synthesis</div>
              <div className="text-xs text-muted-foreground/80">Formulating response based on Section 3.2: Critical Response Protocols.</div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border-2 border-border shadow-3d p-4">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
            <Database size={16} /> Source Context
          </h3>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-muted/10 border border-border rounded-lg p-3 text-xs hover:bg-muted/20 transition-colors cursor-pointer group">
                <div className="font-bold mb-1 flex items-center gap-2 text-secondary">
                  <FileText size={12} /> Heatwave_Response.pdf
                </div>
                <p className="line-clamp-2 text-muted-foreground/80 group-hover:text-foreground">
                  ...immediate activation of cooling centers in residential zones is mandatory when daily max temperature exceeds...
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Data Sources View ---
const DataSourcesView = () => (
  <div className="h-full flex flex-col gap-6">
    <div className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d flex-shrink-0">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Database size={24} className="text-secondary" /> Knowledge Base Management</h2>
      <p className="text-sm text-muted-foreground/80 mb-6">Manage the documents and datasets used by the RAG engine to generate protocols.</p>
      <UploadArea />
    </div>

    <div className="bg-card rounded-2xl border-2 border-border shadow-3d flex-1 overflow-hidden flex flex-col">
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
              <th className="p-4">Date Uploaded</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {UPLOADED_DOCS.map((doc) => (
              <tr key={doc.id} className="hover:bg-muted/5 transition-colors">
                <td className="p-4 font-medium flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{doc.type}</div>
                  {doc.name}
                </td>
                <td className="p-4 text-muted-foreground">{doc.type}</td>
                <td className="p-4 text-muted-foreground">{doc.size}</td>
                <td className="p-4 text-muted-foreground">{doc.date}</td>
                <td className="p-4 text-right">
                  <button className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

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
      {REPORTS.map((report) => (
        <div key={report.id} className="bg-card p-6 rounded-2xl border-2 border-border shadow-3d hover:shadow-3d-hover hover:translate-y-[-4px] transition-all group cursor-pointer">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-chart-1/10 text-chart-1 rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
            <span className={`px-2 py-1 rounded-md text-xs font-bold ${report.status === 'Ready' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'}`}>
              {report.status}
            </span>
          </div>
          <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">{report.title}</h3>
          <div className="text-sm text-muted-foreground/80 space-y-1 mb-6">
            <p>Generated: {report.date}</p>
            <p>Author: {report.author}</p>
          </div>
          <button className="w-full border border-border py-2 rounded-lg font-medium text-sm hover:bg-muted/10 flex items-center justify-center gap-2">
            <Download size={16} /> Download PDF
          </button>
        </div>
      ))}
    </div>
  </div>
);

// --- Dashboard View (Main) ---

interface DashboardViewProps {
  onViewChange: (view: ViewType) => void;
  simulationData: DistrictData;
  onSimulationChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onRunAnalysis: () => void;
  analysisResult: AnalysisResponse | null;
  loading: boolean;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  onViewChange,
  simulationData,
  onSimulationChange,
  onRunAnalysis,
  analysisResult,
  loading
}) => (
  <>
    <SimulationPanel
      data={simulationData}
      onChange={onSimulationChange}
      onRun={onRunAnalysis}
      loading={loading}
    />

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <StatCard
        title="Avg Temperature"
        value={analysisResult ? `${simulationData.max_temp}°C` : "42.5°C"}
        change={analysisResult ? "Simulated" : "+2.5%"}
        trend="up"
        isIncreaseBad={true}
      />
      <StatCard
        title="Heat Index (HI)"
        value={analysisResult ? `${analysisResult.heat_index}°C` : "--"}
        change={analysisResult ? "Dangerous" : ""}
        trend="up"
        isIncreaseBad={true}
      />
      <StatCard
        title="Risk Status"
        value={analysisResult ? analysisResult.risk_status : "N/A"}
        change={analysisResult ? analysisResult.distance_from_safe_zone || "" : ""}
        trend="up"
        isIncreaseBad={true}
      />
      <StatCard
        title="Predicted Hospitalizations"
        value={analysisResult ? analysisResult.predicted_hospitalization_load.toFixed(0) : "1,245"}
        change="+15.2%"
        trend="up"
        isIncreaseBad={true}
      />
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-8">
      {/* Chart Section */}
      <div className="xl:col-span-8 bg-card text-card-foreground p-6 rounded-2xl border-2 border-border shadow-3d flex flex-col h-[400px]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="text-primary" size={20} />
              Hospitalization Risk Forecast
            </h2>
            <p className="text-sm text-muted-foreground/80">AI projection based on current heatwave patterns & RAG data.</p>
          </div>
          <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50">
            <button className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors">7 Days</button>
            <button className="px-3 py-1.5 text-xs font-medium bg-chart-2 text-primary-foreground shadow-sm rounded-lg">30 Days</button>
          </div>
        </div>
        <div className="flex-1 w-full min-w-0 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={CHART_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorValue2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} dy={10} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  borderColor: 'var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '4px 4px 0px 0px rgba(0,0,0,0.3)',
                  color: 'var(--card-foreground)'
                }}
                itemStyle={{ color: 'var(--foreground)' }}
              />
              <Area type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              <Area type="monotone" dataKey="value2" stroke="var(--chart-2)" strokeWidth={3} fillOpacity={1} fill="url(#colorValue2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Map Quick View */}
      <div className="xl:col-span-4 bg-card text-card-foreground p-6 rounded-2xl border-2 border-border shadow-3d flex flex-col h-[400px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MapIcon className="text-primary" size={20} />
            Risk Overview
          </h2>
          <button onClick={() => onViewChange('map')} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Full Map <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden relative border border-border/30 bg-[#1a2c38]">
          <IndiaMapUI simplified={true} />

          <div className="absolute bottom-4 left-4 right-4 space-y-2 pointer-events-none">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl backdrop-blur-sm shadow-sm">
              <div className="text-xs font-bold text-destructive mb-1 flex items-center gap-2">
                <AlertTriangle size={12} /> CRITICAL
              </div>
              <div className="text-xs">Temp {'>'} 45°C in Sector 4.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Action Protocols */}
    {analysisResult && (
      <div className="bg-card rounded-2xl border-2 border-border shadow-3d overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BrainCircuit className="text-chart-3" size={22} />
              Prescriptive Advice ({analysisResult.risk_status})
            </h2>
            <p className="text-sm text-muted-foreground/80">{analysisResult.risk_level_description}</p>
          </div>
          <button onClick={() => onViewChange('rag')} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl shadow-3d-sm active:translate-y-[1px] active:shadow-none transition-all w-full sm:w-auto justify-center">
            <Zap size={16} /> View RAG Insights
          </button>
        </div>
        <div className="p-6 whitespace-pre-line text-sm leading-relaxed">
          {analysisResult.prescriptive_advice}
        </div>
        <div className="p-4 bg-muted/5 border-t border-border">
          <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Sources:</h4>
          {analysisResult.source_documents.map((doc, idx) => (
            <div key={idx} className="text-xs text-muted-foreground/80 mb-1">• {doc.source} (Similarity: {doc.similarity_score})</div>
          ))}
        </div>
      </div>
    )}
  </>
);

const App: React.FC = () => {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Simulation State ---
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
              <div className={`px-3 py-2 text-sm text-sidebar-foreground/80 cursor-pointer hover:text-sidebar-foreground flex items-center gap-2 ${isSidebarCollapsed && !isMobileMenuOpen ? 'justify-center w-full' : ''}`}>
                <MoreVertical size={16} />
                {(!isSidebarCollapsed || isMobileMenuOpen) && "More"}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-1">
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
      <main className="flex-1 bg-background shadow-2xl p-4 md:p-6 overflow-y-auto relative scroll-smooth w-full my-4 mr-4 ml-0 rounded-3xl h-[calc(100%-2rem)]">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm w-full md:w-auto">
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
                className="bg-card border-2 border-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 shadow-3d-sm w-full md:w-64 placeholder:text-muted-foreground/60"
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
            simulationData={simulationData}
            onSimulationChange={handleSimulationChange}
            onRunAnalysis={runAnalysis}
            analysisResult={analysisResult}
            loading={loading}
          />
        )}
        {currentView === 'map' && <IndiaMapUI />}
        {currentView === 'rag' && <RagEngineView />}
        {currentView === 'datasources' && <DataSourcesView />}
        {currentView === 'reports' && <ReportsView />}

      </main>

    </div>
  );
};

export default App;