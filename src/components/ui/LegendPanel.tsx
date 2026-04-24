import type { ViewMode, ColorScheme } from "../maps/OdFlowMapCanvas";
import type { StoryStationMetric } from "../../types/story";

type LegendPanelProps = {
  viewMode: ViewMode;
  stationMetric: StoryStationMetric;
  colorScheme: ColorScheme;
};

export function LegendPanel({
  viewMode,
  stationMetric,
  colorScheme,
}: LegendPanelProps) {
  const getPrimaryColor = (colorScheme: ColorScheme): string => {
    switch (colorScheme) {
      case "warm":
        return "#ff8db8";
      case "purple":
        return "#a78bfa";
      case "cool":
      default:
        return "#68bdff";
    }
  };

  const primaryColor = getPrimaryColor(colorScheme);

  if (viewMode === "routes") {
    return (
      <div className="legend-panel">
        <p className="legend-title">Inferred Street Flow</p>
        <div className="legend-item">
          <span className="legend-label">Road width and color = average trips per profile day</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Shortest-route inference from aggregated OD pairs, not GPS traces</span>
        </div>
        <div className="legend-scale" style={{ background: "linear-gradient(90deg, rgb(82, 120, 118), rgb(221, 196, 132))" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Lower &rarr; higher inferred flow</span>
      </div>
    );
  }

  if (viewMode === "flows") {
    return (
      <div className="legend-panel">
        <p className="legend-title">Flow Field</p>
        <div className="legend-item">
          <span className="legend-label">Brightness and overlap reveal recurring movement</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Particles show motion, not exact individual trips</span>
        </div>
        <div className="legend-scale" style={{ background: "linear-gradient(90deg, rgb(255, 240, 220), rgb(80, 180, 255))" }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Softer flow → brighter flow</span>
      </div>
    );
  }

  if (viewMode === "stations") {
    const metricLabel = {
      capacity: "Station capacity (docks)",
      annualTrips: "Annual trips",
      weekdayAMTrips: "Weekday selected-hour trips",
      weekendMiddayTrips: "Weekend selected-hour trips",
      lowStressScore: "Low-stress score (%)",
      deficitClass: "Demand-support mismatch",
    }[stationMetric] || "Station metric";

    // For trip-based metrics, show heatmap legend
    if (stationMetric === "weekdayAMTrips" || stationMetric === "annualTrips" || stationMetric === "weekendMiddayTrips") {
      return (
        <div className="legend-panel">
          <p className="legend-title">Station Activity</p>
          <div className="legend-item">
            <span className="legend-label">Size & color = {metricLabel}</span>
          </div>
          <div className="legend-item">
            <span className="legend-label">Position = real-world location</span>
          </div>
          <div className="legend-scale" style={{ background: "linear-gradient(90deg, rgb(30, 60, 140), rgb(70, 160, 220), rgb(255, 220, 160), rgb(255, 255, 220))" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Low &rarr; High</span>
        </div>
      );
    }

    return (
      <div className="legend-panel">
        <p className="legend-title">Station Layer</p>
        <div className="legend-item">
          <span className="legend-label">Size = {metricLabel}</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Position = real-world location</span>
        </div>
        <div className="legend-scale" style={{ background: `linear-gradient(90deg, #2a4a6a, ${primaryColor})` }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Low &rarr; High</span>
      </div>
    );
  }

  if (viewMode === "infrastructure") {
    // Simplified: only show 2 meaningful categories
    return (
      <div className="legend-panel">
        <p className="legend-title">Demand vs Safety</p>
        <div className="legend-item">
          <span className="legend-swatch" style={{ backgroundColor: "rgb(255, 60, 80)" }} />
          <span className="legend-label">High demand, no protected lanes (52 stations)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ backgroundColor: "rgb(60, 230, 120)" }} />
          <span className="legend-label">High demand, safe access (86 stations)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ backgroundColor: "rgb(120, 150, 180)" }} />
          <span className="legend-label">Low demand (faded)</span>
        </div>
      </div>
    );
  }

  if (viewMode === "hotspots") {
    return (
      <div className="legend-panel">
        <p className="legend-title">Spatial Shift</p>
        <div className="legend-item">
          <span className="legend-label">Contours mark recurring centers of activity</span>
        </div>
        <div className="legend-item">
          <span className="legend-label">Glow shows where activity spreads outward</span>
        </div>
        <div className="legend-scale" style={{ background: `linear-gradient(90deg, #2a4a6a, ${primaryColor})` }} />
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Low &rarr; High</span>
      </div>
    );
  }

  return null;
}
