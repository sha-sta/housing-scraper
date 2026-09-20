import { useEffect, useRef, useState } from "react";
import type { Template } from "@housing/shared";
import { Empty, Labeled, PageHeader, Spinner } from "../../components/ui.tsx";
import { IconPlus } from "../../components/icons.tsx";
import { useTemplateMutations, useTemplates } from "../../lib/queries.ts";
import { useToast } from "../../lib/toast.tsx";

/** The placeholder list is the one documented on TemplateSchema in the shared contract. */
const VARIABLES: { group: string; names: string[] }[] = [
  {
    group: "The listing",
    names: [
      "listing.title",
      "listing.address",
      "listing.price",
      "listing.beds",
      "listing.url",
      "listing.availableDate",
    ],
  },
  { group: "The landlord", names: ["contact.name", "contact.company"] },
  {
    group: "You",
    names: ["me.fullName", "me.email", "me.phone", "me.school", "me.blurb"],
  },
  { group: "The search", names: ["group.size", "profile.moveIn", "profile.name"] },
];

const BLANK: Omit<Template, "id"> = {
  name: "",
  subject: "Interested in {{listing.address}}",
  body:
    "Hello {{contact.name}},\n\nI saw your listing at {{listing.address}} for {{listing.price}} a month. {{me.blurb}}\n\nIs it still available, and could we see it this week?\n\n{{me.fullName}}\n{{me.school}}\n{{me.phone}}\n",
};

export function Templates() {
  const templates = useTemplates();
  const { save, remove } = useTemplateMutations();
  const toast = useToast();
  const items = templates.data ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Template, "id">>(BLANK);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingId === null) return;
    const found = items.find((item) => item.id === editingId);
    if (found) setDraft({ name: found.name, subject: found.subject, body: found.body });
  }, [editingId, items]);

  function insert(name: string) {
    const field = bodyRef.current;
    const token = `{{${name}}}`;
    if (!field) {
      setDraft((previous) => ({ ...previous, body: `${previous.body}${token}` }));
      return;
    }
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const next = `${draft.body.slice(0, start)}${token}${draft.body.slice(end)}`;
    setDraft((previous) => ({ ...previous, body: next }));
    window.requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Templates"
        hint="The starting text for every draft. Placeholders in double braces are filled from the listing and from you."
        actions={
          <button
            type="button"
            className="ctl-primary semi flex items-center gap-1.5 px-4 text-[13.5px]"
            onClick={() => {
              setEditingId("new");
              setDraft(BLANK);
            }}
          >
            <IconPlus className="h-4 w-4" />
            New template
          </button>
        }
      />

      {templates.isPending ? <Spinner label="Loading templates" /> : null}

      {!templates.isPending && items.length === 0 && editingId === null ? (
        <Empty
          title="No templates yet"
          next="Write one so every draft opens with your own words instead of a blank message."
          action={
            <button
              type="button"
              className="ctl-primary med px-4 text-[14px]"
              onClick={() => {
                setEditingId("new");
                setDraft(BLANK);
              }}
            >
              Write a template
            </button>
          }
        />
      ) : null}

      <ul className="row-stack border-t border-rule">
        {items.map((template) => (
          <li key={template.id} className="bg-surface">
            <button
              type="button"
              aria-expanded={editingId === template.id}
              className="block w-full px-4 py-3 text-left lg:px-6"
              onClick={() => setEditingId(editingId === template.id ? null : template.id)}
            >
              <span className="semi block text-[14.5px]">{template.name}</span>
              <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                {template.subject}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {editingId !== null ? (
        <form
          className="border-t border-rule px-4 py-5 lg:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.name.trim() === "") {
              toast.push({ title: "Name the template", tone: "bad" });
              return;
            }
            save.mutate(
              { id: editingId === "new" ? null : editingId, write: draft },
              {
                onSuccess: (template) => {
                  toast.push({ title: "Saved", body: template.name });
                  setEditingId(template.id);
                },
                onError: (error) =>
                  toast.push({ title: "Not saved", body: error.message, tone: "bad" }),
              },
            );
          }}
        >
          <h2 className="wide text-[15px]">
            {editingId === "new" ? "New template" : "Edit template"}
          </h2>

          <div className="mt-3 flex flex-col gap-3">
            <Labeled label="Name">
              {(props) => (
                <input
                  {...props}
                  className="field text-[14px]"
                  value={draft.name}
                  placeholder="First contact"
                  onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <Labeled label="Subject">
              {(props) => (
                <input
                  {...props}
                  className="field text-[14px]"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.currentTarget.value })}
                />
              )}
            </Labeled>
            <label className="flex flex-col gap-1.5">
              <span className="med text-[13px]">Message</span>
              <textarea
                ref={bodyRef}
                className="field text-[14px]"
                rows={12}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.currentTarget.value })}
              />
            </label>

            <div>
              <h3 className="med text-[13px]">Placeholders</h3>
              <p className="mt-1 text-[12.5px] text-ink-2">
                Tap one to drop it where the cursor is.
              </p>
              <div className="mt-2 flex flex-col gap-2.5">
                {VARIABLES.map((set) => (
                  <div key={set.group}>
                    <p className="text-[12px] text-ink-3">{set.group}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {set.names.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => insert(name)}
                          className="min-h-[32px] rounded-full border border-rule px-2.5 text-[12px] text-ink-2 hover:border-moss hover:text-ink"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="ctl-primary semi px-4 text-[13.5px]"
                disabled={save.isPending}
              >
                {save.isPending ? "Saving" : "Save template"}
              </button>
              <button
                type="button"
                className="ctl med text-[13.5px]"
                onClick={() => setEditingId(null)}
              >
                Close
              </button>
              {editingId === "new" ? null : (
                <button
                  type="button"
                  className="med ml-auto min-h-[44px] px-2 text-[13.5px] text-ink-2 hover:text-brick"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(editingId, {
                      onSuccess: () => {
                        toast.push({ title: "Template deleted" });
                        setEditingId(null);
                      },
                    })
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
