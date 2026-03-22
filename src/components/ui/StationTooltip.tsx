import type React from "react";
import type { StationInfraMetricRecord } from "../../types/story";

type StationTooltipProps = {
  station: StationInfraMetricRecord | null;
  position: { x: number; y: number } | null;
  visible: boolean;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function getDeficitBadgeClass(deficitClass: string): string {
  if (deficitClass === "demand-infrastructure-mismatch") return "deficit-badge--high-demand-low-support";
  if (deficitClass === "high-flow-high-support") return "deficit-badge--high-demand-some-support";
  if (deficitClass === "low-flow-high-support") return "deficit-badge--low-flow-high-support";
  return "deficit-badge--low-flow-high-support";
}

export function StationTooltip({ station, position, visible }: StationTooltipProps) {
  if (!visible || !station || !position) return null;

  const style: React.CSSProperties = {
    position: "fixed",
    left: `${position.x}px`,
    top: `${position.y - 12}px`,
    pointerEvents: "none",
  };

  return (
    <div className="station-tooltip" style={style}>
      <div className="tooltip-stat">
        <span className="tooltip-label">Station</span>
        <span className="tooltip-value">{station.name}</span>
      </div>
      <div className="tooltip-stat">
        <span className="tooltip-label">Capacity</span>
        <span className="tooltip-value">{station.capacity} docks</span>
      </div>
      <div className="tooltip-stat">
        <span className="tooltip-label">Annual trips</span>
        <span className="tooltip-value">{formatNumber(station.annualTrips)}</span>
      </div>
      <div className="tooltip-stat">
        <span className="tooltip-label">Low-stress score</span>
        <span className="tooltip-value">{station.lowStressScore.toFixed(0)}%</span>
      </div>
      <div className="tooltip-stat">
        <span className={getDeficitBadgeClass(station.deficitClass)}>
          {station.deficitClass === "low-flow-high-support" && "Low demand"}
          {station.deficitClass === "high-flow-high-support" && "Well supported"}
          {station.deficitClass === "demand-infrastructure-mismatch" && "High mismatch"}
        </span>
      </div>
    </div>
  );
}
