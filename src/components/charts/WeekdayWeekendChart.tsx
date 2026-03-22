import { useMemo } from "react";

type DaypartProfile = {
  hour: number;
  tripCount: number;
};

type Props = {
  weekdayProfile: DaypartProfile[];
  weekendProfile: DaypartProfile[];
  activeHour: number;
  activeProfileId: "weekdays" | "weekends";
  onBarClick: (profileId: "weekdays" | "weekends", hour: number) => void;
};

export function WeekdayWeekendChart({
  weekdayProfile,
  weekendProfile,
  activeHour,
  activeProfileId,
  onBarClick,
}: Props) {
  const chartData = useMemo(() => {
    const max = Math.max(
      ...weekdayProfile.map((p) => p.tripCount),
      ...weekendProfile.map((p) => p.tripCount),
      1
    );
    return { profiles: weekdayProfile, weekend: weekendProfile, max };
  }, [weekdayProfile, weekendProfile]);

  const peakWeekday = useMemo(() => {
    return chartData.profiles.reduce((a, b) =>
      a.tripCount > b.tripCount ? a : b
    );
  }, [chartData.profiles]);

  const peakWeekend = useMemo(() => {
    return chartData.weekend.reduce((a, b) =>
      a.tripCount > b.tripCount ? a : b
    );
  }, [chartData.weekend]);

  return (
    <div className="weekday-weekend-chart">
      <div className="chart-header">
        <h3 className="chart-title">Weekday vs Weekend: 24-hour trip volume</h3>
        <p className="chart-subtitle">Click a blue or pink bar to switch the OD map to that same hour</p>
      </div>

      <div className="chart-container">
        <div className="chart-bars">
          {chartData.profiles.map((weekday, idx) => {
            const weekend = chartData.weekend[idx];
            const weekdayHeight = (weekday.tripCount / chartData.max) * 100;
            const weekendHeight = (weekend.tripCount / chartData.max) * 100;
            const isWeekdayActive = activeProfileId === "weekdays" && activeHour === weekday.hour;
            const isWeekendActive = activeProfileId === "weekends" && activeHour === weekend.hour;
            const isHourActive = activeHour === weekday.hour && (activeProfileId === "weekdays" || activeProfileId === "weekends");

            return (
              <div key={idx} className={isHourActive ? "bar-group bar-group--active" : "bar-group"}>
                <button
                  type="button"
                  className={isWeekdayActive ? "bar bar--weekday bar--active" : "bar bar--weekday"}
                  style={{ height: `${weekdayHeight}%` }}
                  title={`Weekday ${weekday.hour}:00 (${weekday.tripCount.toLocaleString()})`}
                  aria-pressed={isWeekdayActive}
                  onClick={() => onBarClick("weekdays", weekday.hour)}
                />
                <button
                  type="button"
                  className={isWeekendActive ? "bar bar--weekend bar--active" : "bar bar--weekend"}
                  style={{ height: `${weekendHeight}%` }}
                  title={`Weekend ${weekend.hour}:00 (${weekend.tripCount.toLocaleString()})`}
                  aria-pressed={isWeekendActive}
                  onClick={() => onBarClick("weekends", weekend.hour)}
                />
              </div>
            );
          })}
        </div>

        <div className="chart-axis-x">
          {[0, 6, 12, 18, 23].map((h) => (
            <span key={h} className="axis-label">
              {h}:00
            </span>
          ))}
        </div>
      </div>

      <div className="chart-stats">
        <div className="stat-item">
          <span className="stat-label">Weekday peak</span>
          <span className="stat-value">{peakWeekday.hour}:00</span>
          <span className="stat-trips">{peakWeekday.tripCount.toLocaleString()} trips</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Weekend peak</span>
          <span className="stat-value">{peakWeekend.hour}:00</span>
          <span className="stat-trips">{peakWeekend.tripCount.toLocaleString()} trips</span>
        </div>
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-swatch legend-swatch--weekday" />
          <span className="legend-label">Weekday (blue)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch legend-swatch--weekend" />
          <span className="legend-label">Weekend (pink)</span>
        </div>
      </div>

      <p className="chart-compare-note">
        Current map selection: <strong>{activeProfileId === "weekdays" ? "Weekday" : "Weekend"}</strong> at <strong>{activeHour}:00</strong>. The other profile is retained as a faint OD comparison layer.
      </p>
    </div>
  );
}
