import { Navigate, Route, Routes } from "react-router-dom";
import { MapReviewPage } from "./pages/MapReviewPage";
import { OdFlowPage } from "./pages/OdFlowPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapReviewPage />} />
      <Route path="/map-review" element={<MapReviewPage />} />
      <Route path="/od-flow" element={<OdFlowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
