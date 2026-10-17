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

export default async function ClientDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  await operatorForPage();
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
      <h1>{client.name}</h1>
      {client.deletedAt && <p role="status">Archived · access revoked</p>}
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
      <ClientActions id={id} archived={Boolean(client.deletedAt)} />
      <section className="card">
        <h2>Active client sessions</h2>
        <p>
          Sessions expire 90 days after login. Revocation takes effect
          immediately.
        </p>
        {sessions.length ? (
          <ul>
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
      <section className="card">
        <h2>Client activity</h2>
        {activity.length ? (
          <ol>
            {activity.map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong> · {event.actorType} ·{" "}
                <time dateTime={new Date(event.createdAt).toISOString()}>
                  {new Date(event.createdAt).toLocaleString("en-GB", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
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
