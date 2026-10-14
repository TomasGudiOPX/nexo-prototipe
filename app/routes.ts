import { index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/config", "routes/api.config.ts"),
  route("api/datasets", "routes/api.datasets.ts"),
  route("api/datasets/:datasetId/graph", "routes/api.graph.ts"),
  route("api/datasets/:datasetId/chat", "routes/api.chat.ts"),
];
