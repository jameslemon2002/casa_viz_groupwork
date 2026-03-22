import type { BoroughInfraMetricRecord } from "../../types/story";
import type { ColorScheme } from "../maps/OdFlowMapCanvas";

type BoroughBarPanelStoryProps = {
  boroughs: BoroughInfraMetricRecord[];
  metric: "tripIntensity" | "deficitIndex" | "lowStressDensity";
  limit?: number;
  colorScheme: ColorScheme;
  title?: string;
};

export function BoroughBarPanelStory({
  boroughs,
  metric,
  limit = 8,
  colorScheme,
  title = "Borough comparison",
}: BoroughBarPanelStoryProps) {
  const sorted = [...boroughs].sort((a, b) => {
    const aVal = a[metric] as number;
    const bVal = b[metric] as number;
    return bVal - aVal;
  });

  const displayed = sorted.slice(0, limit);
  const maxValue = Math.max(...displayed.map((b) => b[metric] as number), 1);

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

  const getMetricSubtitle = (m: string): string => {
    switch (m) {
      case "tripIntensity":
        return "Annual trips per dock";
      case "deficitIndex":
        return "Infrastructure gap (high demand, low support)";
      case "lowStressDensity":
        return "Protected lanes (km/km²)";
      default:
        return "";
    }
  };

  const formatValue = (value: number, m: string): string => {
    if (m === "lowStressDensity") return value.toFixed(2) + " km/km²";
    if (m === "deficitIndex") return (value * 100).toFixed(0) + "%";
    // Format trip intensity as K
    if (value >= 1000) return (value / 1000).toFixed(1) + "K";
    return value.toFixed(0);
  };

  return (
    <div className="evidence-panel evidence-panel--visible">
      <p className="evidence-panel-title">{title}</p>
      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", margin: "0 0 0.75rem" }}>
        {getMetricSubtitle(metric)}
      </p>

      <div className="borough-bar-list">
        {displayed.map((borough) => {
          const val = borough[metric] as number;
          const pct = (val / maxValue) * 100;
          return (
            <div key={borough.boroughName} className="borough-bar-row">
              <div className="borough-bar-label">{borough.boroughName}</div>
              <div className="borough-bar-track">
                <div
                  className="borough-bar-fill"
                  style={{ width: `${pct}%`, backgroundColor: primaryColor }}
                />
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", minWidth: "70px", textAlign: "right" }}>
                {formatValue(val, metric)}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > limit && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.75rem" }}>
          + {sorted.length - limit} other boroughs
        </p>
      )}
    </div>
  );
}
