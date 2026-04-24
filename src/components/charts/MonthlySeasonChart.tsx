import type { TemporalAnnotations, TemporalMonth, TemporalSeason } from "../../types/routeFlows";

type MonthlySeasonChartProps = {
  months: TemporalMonth[];
  seasons: TemporalSeason[];
  annotations: TemporalAnnotations;
};

function formatTrips(value: number) {
  return Math.round(value).toLocaleString();
}

export function MonthlySeasonChart({ months, seasons, annotations }: MonthlySeasonChartProps) {
  const maxMonth = Math.max(...months.map((month) => month.averageDailyTrips), 1);
  const maxSeason = Math.max(...seasons.map((season) => season.averageDailyTrips), 1);

  if (months.length === 0) {
    return (
      <div className="evidence-panel evidence-panel--visible">
        <p className="evidence-panel-title">Month and season rhythm</p>
        <p className="chart-subtitle">Monthly trip aggregates have not been generated.</p>
      </div>
    );
  }

  return (
    <div className="evidence-panel evidence-panel--visible monthly-season-chart">
      <div className="chart-header">
        <p className="evidence-panel-title">Month and season rhythm</p>
        <p className="chart-subtitle">Average trips per calendar day, derived from the 2025 TfL archive.</p>
      </div>

      <div className="monthly-bars" aria-label="Monthly average daily trips">
        {months.map((month) => {
          const isPeak = annotations.monthPeak?.monthKey === month.monthKey;
          const isTrough = annotations.monthTrough?.monthKey === month.monthKey;
          return (
            <div key={month.monthKey} className="monthly-bar-group">
              <div className="monthly-bar-track">
                <div
                  className={isPeak || isTrough ? "monthly-bar monthly-bar--annotated" : "monthly-bar"}
                  style={{ height: `${Math.max(6, (month.averageDailyTrips / maxMonth) * 100)}%` }}
                  title={`${month.label}: ${formatTrips(month.averageDailyTrips)} average trips per day`}
                />
              </div>
              <span className="monthly-bar-label">{month.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>

      <div className="season-pills" aria-label="Season average daily trips">
        {seasons.map((season) => (
          <div key={season.season} className="season-pill">
            <span>{season.label}</span>
            <strong>{formatTrips(season.averageDailyTrips)}</strong>
            <i style={{ width: `${Math.max(8, (season.averageDailyTrips / maxSeason) * 100)}%` }} />
          </div>
        ))}
      </div>

      <p className="chart-compare-note">
        Peak month: <strong>{annotations.monthPeak?.label ?? "n/a"}</strong>. Lower point:{" "}
        <strong>{annotations.monthTrough?.label ?? "n/a"}</strong>. The seasonal view sets the demand envelope before
        the street-level hour map.
      </p>
    </div>
  );
}
