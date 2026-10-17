import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { clientForPage } from "../../../../lib/auth/client-page";
import { messageSummary } from "../../../../lib/messages/queries";
import { readConfiguration } from "../../../../lib/config";
import { MessageThread } from "../../../../components/message-thread";
import { ProjectLive } from "../../../../components/project-live";

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
      <MessageThread
        key={actor.id}
        conversation={{ kind: "client", id: actor.id }}
        actorId={actor.id}
        maxBytes={readConfiguration().storage.maxBytes}
      />
      <section className="card">
        <h2>Project chats</h2>
        {summary.conversations.some((item) => item.kind === "project") ? (
          <ul className="conversation-list">
            {summary.conversations
              .filter((item) => item.kind === "project")
              .map((item) => (
                <li key={item.id}>
                  <Link href={`/portal/projects/${item.id}#messages`}>
                    {item.name}
                  </Link>
                  {item.unread > 0 && (
                    <span className="unread-badge">{item.unread} unread</span>
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
    </ProjectLive>
  );
}
