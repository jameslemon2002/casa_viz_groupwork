import type { RegimeRecord, RegimeSlice } from "../../types/regimes";

type RegimeMatrixProps = {
  regimes: RegimeRecord[];
  slices: RegimeSlice[];
  activeSliceKey?: string | null;
  onSliceSelect?: (profileId: "weekdays" | "weekends", hour: number) => void;
};

const regimeColors: Record<string, string> = {
  work_core: "#00c6ff",
  day_leisure: "#ff881d",
  night_social: "#c462ff",
  dawn_transition: "#60f0cf",
};

const profiles: Array<{ id: "weekdays" | "weekends"; label: string }> = [
  { id: "weekdays", label: "Weekdays" },
  { id: "weekends", label: "Weekends" },
];

function keyOf(profileId: string, hour: number) {
  return `${profileId}:${hour}`;
}

export function RegimeMatrix({ regimes, slices, activeSliceKey, onSliceSelect }: RegimeMatrixProps) {
  const sliceMap = new Map(slices.map((slice) => [keyOf(slice.profileId, slice.hour), slice]));
  const regimeMap = new Map(regimes.map((regime) => [regime.id, regime]));

  return (
    <div className="regime-matrix-panel">
      <div className="regime-matrix">
        <div className="regime-matrix-corner" />
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={`header-${hour}`} className="regime-matrix-hour">
            {String(hour).padStart(2, "0")}
          </div>
        ))}

        {profiles.map((profile) => (
          <div key={profile.id} style={{ display: "contents" }}>
            <div key={`${profile.id}-label`} className="regime-matrix-profile">
              {profile.label}
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const slice = sliceMap.get(keyOf(profile.id, hour));
              const regime = slice ? regimeMap.get(slice.regimeId) : null;
              const isActive = activeSliceKey === keyOf(profile.id, hour);

              return (
                <button
                  key={`${profile.id}-${hour}`}
                  type="button"
                  className={`regime-cell${isActive ? " regime-cell--active" : ""}${slice?.isRepresentative ? " regime-cell--representative" : ""}`}
                  style={{
                    backgroundColor: regime ? regimeColors[regime.id] : "rgba(255,255,255,0.06)",
                  }}
                  title={slice ? `${slice.label} - ${regime?.label ?? slice.regimeLabel}` : `${profile.label} ${hour}:00`}
                  onClick={() => onSliceSelect?.(profile.id, hour)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="regime-matrix-legend">
        {regimes.map((regime) => (
          <div key={regime.id} className="regime-matrix-legend-item">
            <span className="regime-matrix-legend-swatch" style={{ backgroundColor: regimeColors[regime.id] }} />
            <span>{regime.shortLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
