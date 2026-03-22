import { useMemo } from "react";

export type TimeSliderProps = {
  hour: number;
  onHourChange: (hour: number) => void;
  profileId: "all" | "weekdays" | "weekends";
  onProfileChange: (profileId: "all" | "weekdays" | "weekends") => void;
  tripCount: number;
  timeBucket: string;
  variant?: "sidebar" | "dock";
};

const profileOptions: Array<{ id: "all" | "weekdays" | "weekends"; label: string }> = [
  { id: "all", label: "All" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
];

export function TimeSlider({
  hour,
  onHourChange,
  profileId,
  onProfileChange,
  tripCount,
  timeBucket,
  variant = "sidebar",
}: TimeSliderProps) {
  const timeDisplay = useMemo(() => `${String(hour).padStart(2, "0")}:00`, [hour]);

  return (
    <div className={variant === "dock" ? "time-slider time-slider--dock" : "time-slider"}>
      {variant === "dock" && <p className="time-slider-kicker">Scrub the typical day</p>}
      <div className="time-slider-display">{timeDisplay}</div>

      <div className="time-slider-profiles" role="tablist" aria-label="Profile selector">
        {profileOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === profileId ? "time-slider-profile time-slider-profile--active" : "time-slider-profile"}
            onClick={() => onProfileChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <input
        type="range"
        min="0"
        max="23"
        value={hour}
        onChange={(event) => onHourChange(parseInt(event.currentTarget.value, 10))}
        className="time-slider-input"
        aria-label="Hour slider"
      />

      <div className="time-slider-labels">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>

      <div className="time-slider-meta">
        <div className="time-slider-daypart">{timeBucket}</div>
        <div className="time-slider-trips">{tripCount.toLocaleString()} trips</div>
      </div>
    </div>
  );
}
