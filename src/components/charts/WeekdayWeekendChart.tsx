import { useMemo } from "react";

type DaypartProfile = {
  hour: number;
  tripCount: number;
};

type Props = {
  weekdayProfile: DaypartProfile[];
  weekendProfile: DaypartProfile[];
  weekdayDayCount: number;
  weekendDayCount: number;
  activeHour: number;
  activeProfileId: "weekdays" | "weekends";
  onBarClick: (profileId: "weekdays" | "weekends", hour: number) => void;
};

export function WeekdayWeekendChart({
  weekdayProfile,
  weekendProfile,
  weekdayDayCount,
  weekendDayCount,
  activeHour,
  activeProfileId,
  onBarClick,
}: Props) {
  const chartData = useMemo(() => {
    const weekdays = weekdayProfile.map((slice) => ({
      ...slice,
      averageDailyTrips: slice.tripCount / Math.max(weekdayDayCount, 1),
    }));
    const weekends = weekendProfile.map((slice) => ({
      ...slice,
      averageDailyTrips: slice.tripCount / Math.max(weekendDayCount, 1),
    }));
    const max = Math.max(
      ...weekdays.map((p) => p.averageDailyTrips),
      ...weekends.map((p) => p.averageDailyTrips),
      1
    );
    return { profiles: weekdays, weekend: weekends, max };
  }, [weekdayDayCount, weekdayProfile, weekendDayCount, weekendProfile]);

  const peakWeekday = useMemo(() => {
    return chartData.profiles.reduce((a, b) =>
      a.averageDailyTrips > b.averageDailyTrips ? a : b
    );
  }, [chartData.profiles]);

  const peakWeekend = useMemo(() => {
    return chartData.weekend.reduce((a, b) =>
      a.averageDailyTrips > b.averageDailyTrips ? a : b
    );
  }, [chartData.weekend]);

  return (
    <div className="weekday-weekend-chart">
      <div className="chart-header">
        <h3 className="chart-title">Weekday and weekend hourly rhythm</h3>
        <p className="chart-subtitle">Average trips per weekday or weekend day. Every hour is selectable.</p>
      </div>

      <div className="chart-container">
        <div className="chart-bars">
          {chartData.profiles.map((weekday, idx) => {
            const weekend = chartData.weekend[idx];
            const weekdayHeight = (weekday.averageDailyTrips / chartData.max) * 100;
            const weekendHeight = (weekend.averageDailyTrips / chartData.max) * 100;
            const isWeekdayActive = activeProfileId === "weekdays" && activeHour === weekday.hour;
            const isWeekendActive = activeProfileId === "weekends" && activeHour === weekend.hour;
            const isHourActive = activeHour === weekday.hour && (activeProfileId === "weekdays" || activeProfileId === "weekends");

            return (
              <div key={idx} className={isHourActive ? "bar-group bar-group--active" : "bar-group"}>
                <button
                  type="button"
                  className={isWeekdayActive ? "bar bar--weekday bar--active" : "bar bar--weekday"}
                  style={{ height: `${weekdayHeight}%` }}
                  title={`Weekday ${weekday.hour}:00 (${Math.round(weekday.averageDailyTrips).toLocaleString()} avg trips/day)`}
                  aria-pressed={isWeekdayActive}
                  onClick={() => onBarClick("weekdays", weekday.hour)}
                />
                <button
                  type="button"
                  className={isWeekendActive ? "bar bar--weekend bar--active" : "bar bar--weekend"}
                  style={{ height: `${weekendHeight}%` }}
                  title={`Weekend ${weekend.hour}:00 (${Math.round(weekend.averageDailyTrips).toLocaleString()} avg trips/day)`}
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
          <span className="stat-trips">{Math.round(peakWeekday.averageDailyTrips).toLocaleString()} avg/day</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Weekend peak</span>
          <span className="stat-value">{peakWeekend.hour}:00</span>
          <span className="stat-trips">{Math.round(peakWeekend.averageDailyTrips).toLocaleString()} avg/day</span>
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
        Current map selection: <strong>{activeProfileId === "weekdays" ? "Weekday" : "Weekend"}</strong> at <strong>{activeHour}:00</strong>. This comparison is normalized per profile day.
      </p>
    </div>
  );
}
