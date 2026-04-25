const coordinatePrecision = 5;
const earthRadiusM = 6371008.8;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function roundCoordinate(coord, precision = coordinatePrecision) {
  return [
    Number(coord[0].toFixed(precision)),
    Number(coord[1].toFixed(precision)),
  ];
}

function coordinateKey(coord, precision = coordinatePrecision) {
  return `${coord[0].toFixed(precision)},${coord[1].toFixed(precision)}`;
}

function edgeCoordinates(edge) {
  return edge?.coords ?? edge?.coordinates ?? null;
}

function sharesCoordinate(edge, coord) {
  const coords = edgeCoordinates(edge);
  if (!coords) return false;
  const key = coordinateKey(coord);
  return coordinateKey(coords[0]) === key || coordinateKey(coords[1]) === key;
}

function distanceMeters(a, b, meanLat) {
  const cosLat = Math.cos(toRadians(meanLat));
  const ax = earthRadiusM * toRadians(a[0]) * cosLat;
  const ay = earthRadiusM * toRadians(a[1]);
  const bx = earthRadiusM * toRadians(b[0]) * cosLat;
  const by = earthRadiusM * toRadians(b[1]);
  return Math.hypot(ax - bx, ay - by);
}

function orientFirstEdge(firstCoords, nextEdge) {
  if (!nextEdge) return firstCoords;
  const [start, end] = firstCoords;
  if (sharesCoordinate(nextEdge, start) && !sharesCoordinate(nextEdge, end)) {
    return [end, start];
  }
  return firstCoords;
}

function appendOrientedEdge(path, coords) {
  const [start, end] = coords;
  const last = path.at(-1);
  if (!last) {
    path.push(start, end);
    return;
  }

  const lastKey = coordinateKey(last);
  const startKey = coordinateKey(start);
  const endKey = coordinateKey(end);
  if (lastKey === startKey) {
    path.push(end);
    return;
  }
  if (lastKey === endKey) {
    path.push(start);
    return;
  }

  const meanLat = (last[1] + start[1] + end[1]) / 3;
  const startDistance = distanceMeters(last, start, meanLat);
  const endDistance = distanceMeters(last, end, meanLat);
  if (startDistance <= endDistance) {
    path.push(start, end);
  } else {
    path.push(end, start);
  }
}

export function buildOrderedRouteCoordinates(edgeIds, graphEdges) {
  const path = [];
  const retainedEdges = edgeIds
    .map((edgeId) => graphEdges.get(edgeId))
    .filter(Boolean);

  retainedEdges.forEach((edge, index) => {
    const coords = edgeCoordinates(edge);
    if (!coords) return;
    const rounded = [roundCoordinate(coords[0]), roundCoordinate(coords[1])];
    if (index === 0) {
      const oriented = orientFirstEdge(rounded, retainedEdges[index + 1]);
      path.push(oriented[0], oriented[1]);
      return;
    }
    appendOrientedEdge(path, rounded);
  });

  return path.filter((coord, index) => {
    if (index === 0) return true;
    return coordinateKey(coord) !== coordinateKey(path[index - 1]);
  });
}

function toLocalXY(coord, meanLat) {
  return [
    earthRadiusM * toRadians(coord[0]) * Math.cos(toRadians(meanLat)),
    earthRadiusM * toRadians(coord[1]),
  ];
}

function pointLineDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denominator = dx * dx + dy * dy;
  if (denominator === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denominator));
  const projected = [start[0] + t * dx, start[1] + t * dy];
  return Math.hypot(point[0] - projected[0], point[1] - projected[1]);
}

function simplifyDouglasPeucker(points, toleranceM) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points.at(-1);

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= toleranceM) return [start, end];

  const left = simplifyDouglasPeucker(points.slice(0, maxIndex + 1), toleranceM);
  const right = simplifyDouglasPeucker(points.slice(maxIndex), toleranceM);
  return left.slice(0, -1).concat(right);
}

export function simplifyRouteCoordinates(coordinates, toleranceM = 12, precision = coordinatePrecision) {
  if (coordinates.length <= 2 || toleranceM <= 0) {
    return coordinates
      .map((coord) => roundCoordinate(coord, precision))
      .filter((coord, index, arr) => index === 0 || coordinateKey(coord, precision) !== coordinateKey(arr[index - 1], precision));
  }

  const meanLat = coordinates.reduce((sum, coord) => sum + coord[1], 0) / coordinates.length;
  const projected = coordinates.map((coord) => ({
    coord,
    xy: toLocalXY(coord, meanLat),
  }));
  const simplifiedProjected = simplifyDouglasPeucker(projected.map((point) => point.xy), toleranceM);
  const simplified = simplifiedProjected.map((xy) => {
    const match = projected.find((point) => point.xy[0] === xy[0] && point.xy[1] === xy[1]);
    return roundCoordinate(match?.coord ?? coordinates[0], precision);
  });

  return simplified.filter((coord, index) => {
    if (index === 0) return true;
    return coordinateKey(coord, precision) !== coordinateKey(simplified[index - 1], precision);
  });
}

export function buildOdRouteId(profileId, hour, rank) {
  return `${profileId}_${String(hour).padStart(2, "0")}_od_${String(rank).padStart(4, "0")}`;
}
