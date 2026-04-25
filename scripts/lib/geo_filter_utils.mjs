function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(point, polygonCoordinates) {
  const [outerRing, ...holes] = polygonCoordinates;
  if (!outerRing || !pointInRing(point, outerRing)) return false;
  return !holes.some((ring) => pointInRing(point, ring));
}

export function pointInPolygon(point, geometry) {
  if (!point || !geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygonCoordinates(point, geometry.coordinates ?? []);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates ?? []).some((polygon) => pointInPolygonCoordinates(point, polygon));
  }
  return false;
}

function collectCoordinatePairs(value, output = []) {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push([value[0], value[1]]);
    return output;
  }
  for (const item of value) collectCoordinatePairs(item, output);
  return output;
}

export function featureRepresentativePoint(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  const points = collectCoordinatePairs(geometry.coordinates);
  if (points.length === 0) return null;
  const total = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [Number((total[0] / points.length).toFixed(6)), Number((total[1] / points.length).toFixed(6))];
}

export function filterFeaturesToBoroughs(features, boroughFeatures, activeBoroughCodes) {
  const activeBoroughs = boroughFeatures.filter((feature) => activeBoroughCodes.has(feature?.properties?.gss_code));
  return features.filter((feature) => {
    const point = featureRepresentativePoint(feature);
    if (!point) return false;
    return activeBoroughs.some((borough) => pointInPolygon(point, borough.geometry));
  });
}
