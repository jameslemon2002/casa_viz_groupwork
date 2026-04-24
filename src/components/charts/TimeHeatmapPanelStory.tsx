import type { ColorScheme } from "../maps/OdFlowMapCanvas";
import type { StoryProfileSummary } from "../../types/story";

type TimeHeatmapPanelStoryProps = {
  profile: StoryProfileSummary;
  colorScheme: ColorScheme;
  activeHour?: number;
  dayCount?: number;
  title?: string;
  onHourClick?: (hour: number) => void;
};

function getPrimaryColor(colorScheme: ColorScheme): string {
  switch (colorScheme) {
    case "warm": return "#ff8db8";
    case "purple": return "#a78bfa";
    case "cool":
    default:
      return "#68bdff";
  }
}

export function TimeHeatmapPanelStory({
  profile,
  colorScheme,
  activeHour,
  dayCount = 1,
  title = "Hourly trip volume",
  onHourClick,
}: TimeHeatmapPanelStoryProps) {
  const primaryColor = getPrimaryColor(colorScheme);
  const hourSlices = profile.hourSlices || [];

  if (hourSlices.length === 0) {
    return (
      <div className="evidence-panel">
        <p className="evidence-panel-title">{title}</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>No hourly data available</p>
      </div>
    );
  }

  // Find peak hour
  const normalizedSlices = hourSlices.map((slice) => ({
    ...slice,
    averageDailyTrips: slice.tripCount / Math.max(dayCount, 1),
  }));
  const maxSlice = normalizedSlices.reduce((max, curr) => (curr.averageDailyTrips > max.averageDailyTrips ? curr : max), normalizedSlices[0]);
  const maxValue = Math.max(...normalizedSlices.map((h) => h.averageDailyTrips), 1);

  return (
    <div className="evidence-panel evidence-panel--visible">
      <p className="evidence-panel-title">{title}</p>

      {/* 24-hour bar chart */}
      <div className="hourly-bars">
        {normalizedSlices.map((slice) => {
          const isActive = slice.hour === activeHour;
          const proportion = slice.averageDailyTrips / maxValue;
          return (
            <div
              key={slice.hour}
              className={`hourly-bar ${isActive ? "hourly-bar--active" : ""}`}
              style={{
                height: `${Math.max(8, proportion * 100)}%`,
                backgroundColor: isActive ? primaryColor : `rgba(${parseInt(primaryColor.slice(1, 3), 16)}, ${parseInt(primaryColor.slice(3, 5), 16)}, ${parseInt(primaryColor.slice(5, 7), 16)}, 0.5)`,
                cursor: "pointer",
              }}
              title={`${String(slice.hour).padStart(2, "0")}:00 - ${Math.round(slice.averageDailyTrips).toLocaleString()} avg trips/day`}
              onClick={() => onHourClick?.(slice.hour)}
            />
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="hourly-labels">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
          <div key={hour} className="hourly-label">
            {String(hour).padStart(2, "0")}
          </div>
        ))}
      </div>

      {/* Peak hour callout */}
      {maxSlice && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
          Peak: {String(maxSlice.hour).padStart(2, "0")}:00 ({Math.round(maxSlice.averageDailyTrips).toLocaleString()} avg trips/day)
        </div>
      )}
    </div>
  );
}
