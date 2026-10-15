import { redirect } from "react-router";

export function loader({ request }: { request: Request }) {
  // One canonical URL keeps refresh/back and shared links in the original shell.
  return redirect(`/nexo-prototipo.html${new URL(request.url).search}`);
}
