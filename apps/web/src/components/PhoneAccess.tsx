import { QrCode } from "./QrCode.tsx";
import { Chip } from "./ui.tsx";
import { IconCheck, IconExternal, IconRefresh } from "./icons.tsx";
import { useCopy } from "../lib/clipboard.ts";
import { useNetwork, useSettings, useUpdateSettings } from "../lib/queries.ts";
import { useToast } from "../lib/toast.tsx";

const DOWNLOAD = "https://tailscale.com/download";

/** Falls back to the app's own port so the restore button never writes a guess. */
function localUrl(dashboardUrl: string): string {
  try {
    const port = new URL(dashboardUrl).port || "4747";
    return `http://localhost:${port}`;
  } catch {
    return "http://localhost:4747";
  }
}

function Address({
  url,
  label,
  action,
}: {
  url: string;
  label: string;
  action?: React.ReactNode;
}) {
  const { copied, copy } = useCopy();
  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
      <div className="min-w-0 flex-1">
        <p className="med text-[13px]">{label}</p>
        <p className="num mt-1 break-all text-[14px]" data-testid="phone-address">
          {url}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {action}
          <button
            type="button"
            className="ctl med text-[13.5px]"
            onClick={() => void copy("url", url)}
          >
            {copied === "url" ? "Copied" : "Copy the address"}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <QrCode value={url} label={`Open ${url} on your phone`} />
        <p className="max-w-[160px] text-center text-[11.5px] text-ink-2">
          Point your phone camera at this to open the dashboard.
        </p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="num semi mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12.5px]"
      >
        {n}
      </span>
      <span className="min-w-0 text-[13.5px]">{children}</span>
    </li>
  );
}

/**
 * The reader may never have heard of Tailscale, so this card explains it as a free app
 * that puts a computer and a phone on the same private network. Pushes already work
 * without it; this only makes the dashboard itself openable from a phone.
 */
export function PhoneAccess() {
  const network = useNetwork();
  const settings = useSettings();
  const update = useUpdateSettings();
  const toast = useToast();

  const info = network.data;
  const dashboardUrl = settings.data?.dashboardUrl ?? "";
  const tailscaleUrl = info?.tailscale.url ?? null;
  const inUse = tailscaleUrl !== null && dashboardUrl === tailscaleUrl;

  function point(url: string, title: string) {
    update.mutate(
      { dashboardUrl: url },
      {
        onSuccess: () => toast.push({ title }),
        onError: (error) => toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
      },
    );
  }

  return (
    <section
      className="border-t border-rule px-4 py-5 first:border-t-0 lg:px-6"
      data-testid="phone-access"
    >
      <h2 className="wide text-[15px]">Open on your phone</h2>
      <p className="mt-1 max-w-[62ch] text-[13px] text-ink-2">
        Pushes already reach your phone and their links already work. This step is optional. It
        makes the whole dashboard open on your phone too, so you can read a listing and send the
        email from anywhere.
      </p>

      {network.isPending ? (
        <p className="mt-3 text-[13px] text-ink-2">Checking this computer</p>
      ) : null}

      {network.isError ? (
        <p className="mt-3 text-[13px] text-ink-2">
          The server could not report its address. Pushes still work.
        </p>
      ) : null}

      {info && tailscaleUrl ? (
        <div data-testid="phone-access-ready">
          {inUse ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip tone="moss">
                <IconCheck className="h-3.5 w-3.5" />
                Pushes open this address
              </Chip>
              <button
                type="button"
                className="med min-h-[44px] px-2 text-[13px] text-ink-2 hover:text-ink"
                disabled={update.isPending}
                onClick={() => point(localUrl(dashboardUrl), "Pushes open this computer again")}
                data-testid="phone-access-revert"
              >
                Go back to this computer only
              </button>
            </div>
          ) : null}

          <Address
            url={tailscaleUrl}
            label="Your dashboard address"
            action={
              inUse ? null : (
                <button
                  type="button"
                  className="ctl-primary semi px-4 text-[13.5px]"
                  disabled={update.isPending}
                  onClick={() => point(tailscaleUrl, "Pushes now open this address")}
                  data-testid="phone-access-use"
                >
                  {update.isPending ? "Saving" : "Use this address in pushes"}
                </button>
              )
            }
          />

          {info.tailscale.listening ? null : (
            <p className="mt-2 text-[12.5px] text-ink-2">
              The server found this address but is not answering on it yet. It retries every half
              minute, so give it a moment and check again.
            </p>
          )}
        </div>
      ) : null}

      {info && !tailscaleUrl && info.dashboardUrlIsLocal ? (
        <div data-testid="phone-access-setup">
          <p className="mt-3 max-w-[62ch] text-[13px]">
            Right now the dashboard only opens on this computer. Tailscale is a free app that puts
            your computer and your phone on the same private network, so your phone can reach it.
            Three steps, about two minutes.
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            <Step n={1}>
              Install Tailscale on this computer and open it.
            </Step>
            <Step n={2}>Install Tailscale on your phone from the App Store or Play Store.</Step>
            <Step n={3}>
              Sign in on both with the same account. Any account works, and it is free for one
              person.
            </Step>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="ctl-primary semi flex items-center gap-1.5 px-4 text-[13.5px]"
              href={DOWNLOAD}
              target="_blank"
              rel="noreferrer noopener"
            >
              <IconExternal className="h-4 w-4" />
              Get Tailscale
            </a>
            <button
              type="button"
              className="ctl med flex items-center gap-1.5 text-[13.5px]"
              disabled={network.isFetching}
              onClick={() => void network.refetch()}
              data-testid="phone-access-recheck"
            >
              <IconRefresh className="h-4 w-4" />
              {network.isFetching ? "Checking" : "Check again"}
            </button>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-2">
            Once both are signed in, come back and tap Check again.
          </p>
        </div>
      ) : null}

      {info && !tailscaleUrl && !info.dashboardUrlIsLocal ? (
        <div data-testid="phone-access-remote">
          <Address url={dashboardUrl} label="Your dashboard address" />
        </div>
      ) : null}
    </section>
  );
}
