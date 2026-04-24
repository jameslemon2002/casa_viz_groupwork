import { useEffect, useState } from "react";

type HeroOverlaySectionProps = {
  isVisible: boolean;
  annualTrips: number;
  stationCount: number;
  boroughCount: number;
};

export function HeroOverlaySection({
  isVisible,
  annualTrips,
  stationCount,
  boroughCount,
}: HeroOverlaySectionProps) {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;
      const fadeThreshold = 300;
      const newOpacity = Math.max(0, 1 - scrolled / fadeThreshold);
      setOpacity(newOpacity);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="hero-overlay" style={{ opacity }}>
      <div className="hero-overlay-inner">
        <span className="hero-overlay-kicker">London Bike Share Temporal Geography</span>
        <h1 className="hero-overlay-heading">
          How time shapes bike share use
        </h1>
        <p className="hero-overlay-subtitle">
          Seasonal, weekly and hourly rhythms reveal different geographies of London bike-share trips.
        </p>
        <div className="hero-stat">
          {stationCount.toLocaleString()} stations · {boroughCount} boroughs · {(annualTrips / 1_000_000).toFixed(1)}M trips
        </div>
        <div className="hero-overlay-note">Scroll from demand envelope to daily routine and street-level flow.</div>
        <div className="scroll-indicator">↓</div>
      </div>
    </div>
  );
}
