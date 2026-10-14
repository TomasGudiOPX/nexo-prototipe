import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { LinksFunction } from "react-router";
import stylesHref from "./styles/nexo.css?url";
import motionHref from "./styles/brain-motion.css?url";
import projectsHref from "./styles/projects.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: stylesHref }, { rel: "stylesheet", href: motionHref }, { rel: "stylesheet", href: projectsHref }];

export function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

export default function App() { return <Outlet />; }
