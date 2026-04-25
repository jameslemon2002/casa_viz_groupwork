import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--max-old-space-size=8192", "scripts/clean/build_route_flows.mjs"], {
  stdio: "inherit",
    env: {
      ...process.env,
      ROUTE_INCLUDE_EDGE_CONTRIBUTORS: "1",
      ROUTE_WRITE_ROUTE_DETAILS: "1",
      ROUTE_WRITE_OD_ROUTE_LENS: "1",
      ROUTE_DETAIL_ONLY: "1",
      ROUTE_DETAIL_MAX_CONTRIBUTORS: process.env.ROUTE_DETAIL_MAX_CONTRIBUTORS ?? "5",
      ROUTE_DETAIL_MAX_EDGES: process.env.ROUTE_DETAIL_MAX_EDGES ?? "600",
      ROUTE_OD_LENS_SIMPLIFY_M: process.env.ROUTE_OD_LENS_SIMPLIFY_M ?? "12",
    },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Route detail build terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 0;
});
