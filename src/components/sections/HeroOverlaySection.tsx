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
        <span className="hero-overlay-kicker">London Shared Bike Rhythms</span>
        <h1 className="hero-overlay-heading">
          One network. Many temporal Londons.
        </h1>
        <p className="hero-overlay-subtitle">
          We begin in the morning, follow the peak, and watch time redraw the geography of London&apos;s bike-share system.
        </p>
        <div className="hero-stat">
          {stationCount.toLocaleString()} stations · {boroughCount} boroughs · {(annualTrips / 1_000_000).toFixed(1)}M trips
        </div>
        <div className="hero-overlay-note">Scroll to move from rhythm to geography, one recurring city at a time.</div>
        <div className="scroll-indicator">↓</div>
      </div>
    </div>
  );
}
