import React from 'react';
import { Activity, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DistrictRanking } from '../api';

interface RankingsPageProps {
  rankings: DistrictRanking[];
  loading: boolean;
}

export const RankingsView: React.FC<{ rankings: DistrictRanking[]; loading: boolean }> = ({ rankings, loading }) => {
    if (loading) {
        return <div className="p-8 text-center">Loading rankings data...</div>;
    }

    return (
        <div className="bg-card rounded-2xl border-2 border-border shadow-3d overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-border bg-muted/10 shrink-0">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Activity className="text-primary" size={28} />
                    Full District Risk Rankings
                </h2>
                <p className="text-sm text-muted-foreground/80 mt-1">
                    Real-time analysis of all monitored districts | Sorted by heat hospitalization risk
                </p>

                {/* Legend */}
                <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                        <span className="w-3 h-3 rounded bg-red-500"></span> Critical ({'>'}80%)
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                        <span className="w-3 h-3 rounded bg-orange-400"></span> Severe (50-80%)
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                         <span className="w-3 h-3 rounded bg-green-500"></span> Stable ({'<'}50%)
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full relative">
                    <thead className="bg-card border-b border-border sticky top-0 z-20 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">Rank</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">District</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">Heat + Disease-Amplified Risk</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">Population Demographics</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">LST <span className="text-[10px] lowercase">(°C)</span></th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider bg-card">Air Temp <span className="text-[10px] lowercase">(°C)</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rankings.map((district, index) => {
                            const riskColorClass =
                              district.risk_status === 'Red' ? 'text-red-500 bg-red-500/10' :
                              district.risk_status === 'Amber' ? 'text-orange-500 bg-orange-500/10' :
                              'text-green-500 bg-green-500/10';

                            // Color code the rank based on risk score (just an example, or index)
                            // User asked to "color code the ranking numbers"
                            const rankColor = index < 5 ? "text-red-500" : index < 15 ? "text-orange-500" : "text-green-500";

                            return (
                              <tr key={district.district_name} className="hover:bg-muted/5 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className={`text-2xl font-bold ${rankColor}`}>#{index + 1}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="font-medium text-lg text-foreground">{district.district_name}</div>
                                  {district.state && (
                                    <div className="text-[11px] text-muted-foreground">{district.state}</div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase">Heat hospitalization Risk</div>
                                  <div className="text-lg font-bold text-foreground">
                                    {(district.risk_score * 100).toFixed(1)}%
                                  </div>
                                  <div className="h-1.5 w-24 bg-muted/50 rounded-full overflow-hidden mt-1">
                                    <div
                                      className={`h-full rounded-full ${district.risk_score > 0.8 ? 'bg-red-500' : (district.risk_score > 0.5 ? 'bg-orange-400' : 'bg-green-500')}`}
                                      style={{ width: `${district.risk_score * 100}%` }}
                                    ></div>
                                  </div>
                                  <div className="mt-3 text-xs font-semibold text-muted-foreground uppercase">Disease-amplified heat risk</div>
                                  <div className="text-base font-bold text-foreground">
                                    {typeof district.mortality_risk_score === 'number'
                                      ? `${(district.mortality_risk_score * 100).toFixed(1)}%`
                                      : '—'}
                                  </div>
                                  {typeof district.mortality_risk_score === 'number' && (
                                    <div className="h-1.5 w-24 bg-muted/50 rounded-full overflow-hidden mt-1">
                                      <div
                                        className={`h-full rounded-full ${district.mortality_risk_score > 0.8 ? 'bg-red-500' : (district.mortality_risk_score > 0.5 ? 'bg-orange-400' : 'bg-green-500')}`}
                                        style={{ width: `${district.mortality_risk_score * 100}%` }}
                                      ></div>
                                    </div>
                                  )}
                                  <div className="text-[11px] text-muted-foreground mt-1 max-w-[180px] whitespace-normal">
                                    {district.mortality_risk_reason || 'Disease indicators drive the uplift.'}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="space-y-1 text-xs">
                                     <div className="flex justify-between gap-3 text-muted-foreground">
                                        <span>Outdoor Workers:</span>
                                        <span className="font-bold text-foreground">{district.pct_outdoor_workers.toFixed(1)}%</span>
                                     </div>
                                     <div className="flex justify-between gap-3 text-muted-foreground">
                                        <span>Children:</span>
                                        <span className="font-bold text-foreground">{district.pct_children.toFixed(1)}%</span>
                                     </div>
                                     <div className="flex justify-between gap-3 text-muted-foreground">
                                        <span>Vulnerable:</span>
                                        <span className="font-bold text-foreground">{district.pct_vulnerable_social.toFixed(1)}%</span>
                                     </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground bg-muted/5">
                                  {district.lst.toFixed(1)}°C
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                                  {district.max_temp.toFixed(1)}°C
                                </td>
                              </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const RankingsPage: React.FC<RankingsPageProps> = (props) => {
    return (
        <div className="container mx-auto p-6 h-screen flex flex-col">
             <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors shrink-0">
                <ArrowLeft size={18} />
                Back to Dashboard
            </Link>
            <div className="flex-1 min-h-0">
                <RankingsView {...props} />
            </div>
        </div>
    );
};
