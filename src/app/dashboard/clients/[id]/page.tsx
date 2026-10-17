import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { operatorForPage } from "../../../../lib/auth/page";
import {
  getClient,
  clientActivity,
  clientId,
} from "../../../../lib/clients/service";
import { listClientSessions } from "../../../../lib/auth/client";
import {
  ClientActions,
  RevokeSession,
} from "../../../../components/client-forms";
import { AppError } from "../../../../lib/errors";
import type { Metadata } from "next";
import { MessageThread } from "../../../../components/message-thread";
import { ProjectLive } from "../../../../components/project-live";
import { readConfiguration } from "../../../../lib/config";

export const metadata: Metadata = { title: "Client details" };

const activityLabels: Record<string, string> = {
  "client.created": "Client created",
  "client.updated": "Client details updated",
  "client.archived": "Client archived and access revoked",
  "client.restored": "Client restored",
  "client.link_created": "Login link generated",
  "client.logged_in": "Signed in to the portal",
  "client.session_revoked": "Session revoked",
  "client.email_requested": "Login email requested",
  "client.email_accepted": "Login email accepted by provider",
  "client.email_failed": "Login email failed — share a manual link",
};

export default async function ClientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const identity = await operatorForPage();
  const { id } = await params;
  if (!clientId.safeParse(id).success) notFound();
  const client = await getClient(id).catch((error: unknown) => {
    if (error instanceof AppError && error.statusCode === 404) notFound();
    throw error;
  });
  const [activity, sessions] = await Promise.all([
    clientActivity(id),
    listClientSessions(id),
  ]);
  return (
    <>
      <Link href="/dashboard/clients">All clients</Link>
      <div className="page-heading">
        <div>
          <h1>{client.name}</h1>
          <p>{client.company || client.email}</p>
        </div>
      </div>
      {client.deletedAt && <p role="status">Archived · access revoked</p>}
      <ClientActions id={id} archived={Boolean(client.deletedAt)} />
      <div className="detail-grid">
        <section className="card">
          <h2>Client information</h2>
          <dl>
            <dt>Email</dt>
            <dd>{client.email}</dd>
            <dt>Company</dt>
            <dd>{client.company || "—"}</dd>
            <dt>Phone</dt>
            <dd>{client.phone || "—"}</dd>
            <dt>Private notes</dt>
            <dd className="preserve-lines">{client.notes || "—"}</dd>
            {Object.entries(client.metadata).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card">
          <h2>Active client sessions</h2>
          <p>
            Sessions expire 90 days after login. Revocation takes effect
            immediately.
          </p>
          {sessions.length ? (
            <ul className="session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <p>
                    Created{" "}
                    {new Date(session.createdAt).toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                    <br />
                    Expires{" "}
                    {new Date(session.expiresAt).toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </p>
                  <RevokeSession clientId={id} sessionId={session.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p>No active sessions.</p>
          )}
        </section>
      </div>
      {!client.deletedAt && (
        <ProjectLive clientId={id}>
          <MessageThread
            conversation={{ kind: "client", id }}
            actorId={identity.id}
            maxBytes={readConfiguration().storage.maxBytes}
          />
        </ProjectLive>
      )}
      <section className="card">
        <h2>Client activity</h2>
        {activity.length ? (
          <ol className="activity-list">
            {activity.map((event) => (
              <li key={event.id}>
                <strong>
                  {activityLabels[event.eventType] ?? "Client activity"}
                </strong>
                <small>
                  {event.actorType === "operator" ? "Operator" : "Client"} ·{" "}
                  <time dateTime={new Date(event.createdAt).toISOString()}>
                    {new Date(event.createdAt).toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </time>
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p>No activity yet.</p>
        )}
      </section>
    </>
  );
}
