import { Navigate, Route, Routes } from "react-router-dom";
import { OdFlowPage } from "./pages/OdFlowPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<OdFlowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
