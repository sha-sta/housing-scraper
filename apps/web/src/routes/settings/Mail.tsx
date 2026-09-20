import { useState } from "react";
import { Chip, PageHeader, Section, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { useSettings } from "../../lib/queries.ts";
import { composeLabel } from "../../lib/format.ts";
import { useToast } from "../../lib/toast.tsx";

export function Mail() {
  const settings = useSettings();
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  if (settings.isPending || !settings.data) return <Spinner label="Loading mail status" />;

  const { smtpConfigured, llmConfigured, composeVia } = settings.data;

  async function test() {
    setTesting(true);
    try {
      const outcome = await api.testSmtp();
      setResult(outcome);
      toast.push(
        outcome.ok
          ? { title: "SMTP works", body: "A test message left the server" }
          : { title: "SMTP failed", body: outcome.error ?? "No reason given", tone: "bad" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "The server did not answer";
      setResult({ ok: false, error: message });
      toast.push({ title: "SMTP failed", body: message, tone: "bad" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Mail"
        hint="By default the app hands you a prefilled message and you press send from your own mailbox."
      />

      <Section title="How drafts leave">
        <p className="text-[13.5px]">
          Drafts open with <span className="semi">{composeLabel(composeVia)}</span>. Change that
          under You.
        </p>
      </Section>

      <Section
        title="Letting the server send for you"
        hint="Optional. Fill SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in your .env file, then restart the server."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={smtpConfigured ? "moss" : "quiet"}>
            {smtpConfigured ? "SMTP is set" : "SMTP is not set"}
          </Chip>
          <button
            type="button"
            className="ctl med text-[13.5px]"
            disabled={!smtpConfigured || testing}
            onClick={() => void test()}
          >
            {testing ? "Testing" : "Send a test email"}
          </button>
        </div>
        {result ? (
          <p className={`text-[12.5px] ${result.ok ? "text-ink-2" : "text-brick"}`}>
            {result.ok ? "The server accepted the message." : result.error}
          </p>
        ) : null}
        {smtpConfigured ? null : (
          <p className="text-[12.5px] text-ink-2">
            Without SMTP the app still stages every draft. You press send from your own mailbox,
            which is what most people want because the landlord sees your school address.
          </p>
        )}
      </Section>

      <Section
        title="Personalised drafts"
        hint="With ANTHROPIC_API_KEY set, the server rewrites each draft using details from the listing. Without it, the template text is used as written."
      >
        <Chip tone={llmConfigured ? "moss" : "quiet"}>
          {llmConfigured ? "Claude is connected" : "Using templates only"}
        </Chip>
      </Section>
    </div>
  );
}
