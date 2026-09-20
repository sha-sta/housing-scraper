import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Shell } from "./components/Shell.tsx";
import { Empty, Spinner } from "./components/ui.tsx";
import { LiveProvider } from "./lib/live.tsx";
import { useSettings } from "./lib/queries.ts";
import { SelectionProvider } from "./lib/selection.tsx";
import { ToastProvider } from "./lib/toast.tsx";
import { Drafts } from "./routes/Drafts.tsx";
import { Feed } from "./routes/Feed.tsx";
import { ListingRoute } from "./routes/ListingRoute.tsx";
import { More } from "./routes/More.tsx";
import { Notifications } from "./routes/Notifications.tsx";
import { Pipeline } from "./routes/Pipeline.tsx";
import { Sources } from "./routes/Sources.tsx";
import { Wizard } from "./routes/Wizard.tsx";
import { Identity } from "./routes/settings/Identity.tsx";
import { Mail } from "./routes/settings/Mail.tsx";
import { Ntfy } from "./routes/settings/Ntfy.tsx";
import { ProfileEditor } from "./routes/settings/ProfileEditor.tsx";
import { Profiles } from "./routes/settings/Profiles.tsx";
import { Settings } from "./routes/settings/Settings.tsx";
import { Templates } from "./routes/settings/Templates.tsx";

// Leaflet and its stylesheet are a third of the bundle, and most sessions never open the map.
const MapRoute = lazy(async () => ({ default: (await import("./routes/MapRoute.tsx")).MapRoute }));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The event stream is what keeps this fresh, so polling would only add noise.
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      retry: 1,
    },
  },
});

/** Everything is behind first run until the server says the setup finished. */
function SetupGate({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const location = useLocation();

  if (settings.isPending) return <Spinner label="Starting up" />;

  if (settings.isError) {
    return (
      <Empty
        title="The server is not answering"
        next="Start it with pnpm --filter @housing/server start, then reload this page."
      />
    );
  }

  if (settings.data && !settings.data.setupComplete && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  if (settings.data?.setupComplete && location.pathname === "/setup") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function Routing() {
  return (
    <SetupGate>
      <Routes>
        <Route path="/setup" element={<Wizard />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Feed />} />
          <Route path="/listings/:id" element={<ListingRoute />} />
          <Route
            path="/map"
            element={
              <Suspense fallback={<Spinner label="Loading the map" />}>
                <MapRoute />
              </Suspense>
            }
          />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/more" element={<More />} />
          <Route path="/settings" element={<Settings />}>
            <Route index element={<Profiles />} />
            <Route path="profiles/:id" element={<ProfileEditor />} />
            <Route path="identity" element={<Identity />} />
            <Route path="ntfy" element={<Ntfy />} />
            <Route path="templates" element={<Templates />} />
            <Route path="mail" element={<Mail />} />
          </Route>
          <Route
            path="*"
            element={
              <Empty title="Nothing at that address" next="Use the tabs below to get back." />
            }
          />
        </Route>
      </Routes>
    </SetupGate>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <LiveProvider>
            <SelectionProvider>
              <Routing />
            </SelectionProvider>
          </LiveProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
