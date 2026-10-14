import type { Route } from "./+types/home";

export function loader({ request }: Route.LoaderArgs) {
  const target = new URL(request.url);
  target.pathname = "/nexo-prototipo.html";
  return Response.redirect(target, 302);
}

export default function Home() { return null; }
