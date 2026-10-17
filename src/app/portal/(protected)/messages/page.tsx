import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { clientForPage } from "../../../../lib/auth/client-page";
import { messageSummary } from "../../../../lib/messages/queries";
import { readConfiguration } from "../../../../lib/config";
import { MessageThread } from "../../../../components/message-thread";
import { ProjectLive } from "../../../../components/project-live";
import { getBranding } from "../../../../lib/settings";

export const metadata: Metadata = { title: "Messages" };
export default async function MessagesPage(): Promise<ReactElement> {
  const actor = await clientForPage();
  const summary = await messageSummary(actor);
  return (
    <ProjectLive>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Keep in touch</p>
          <h1>Messages</h1>
          <p>
            General conversation with your operator and chats for your shared
            projects.
          </p>
        </div>
      </div>
      <div className="conversation-workspace">
        <div className="conversation-primary">
          <MessageThread
            key={actor.id}
            conversation={{ kind: "client", id: actor.id }}
            actorId={actor.id}
            defaultCurrency={(await getBranding())?.defaultCurrency ?? "GBP"}
            maxBytes={readConfiguration().storage.maxBytes}
          />
        </div>
        <aside className="workspace-context" aria-label="Project conversations">
          <section className="card context-card">
            <h2>Project chats</h2>
            <p className="field-help">
              Keep project-specific conversations with their shared work.
            </p>
            {summary.conversations.some((item) => item.kind === "project") ? (
              <ul className="conversation-list">
                {summary.conversations
                  .filter((item) => item.kind === "project")
                  .map((item) => (
                    <li key={item.id}>
                      <Link href={`/portal/projects/${item.id}#messages`}>
                        <span>{item.name}</span>
                        <span aria-hidden="true">↗</span>
                      </Link>
                      {item.unread > 0 && (
                        <span className="unread-badge">
                          {item.unread} unread
                        </span>
                      )}
                      <p>
                        {item.lastBody
                          ? item.lastBody.slice(0, 140)
                          : item.lastAt
                            ? "Attachment"
                            : "No messages yet."}
                      </p>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No project chats yet.</p>
            )}
          </section>
        </aside>
      </div>
    </ProjectLive>
  );
}
