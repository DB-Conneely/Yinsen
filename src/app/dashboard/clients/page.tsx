import type { ReactElement } from "react";
import Link from "next/link";
import { operatorForPage } from "../../../lib/auth/page";
import { listClients } from "../../../lib/clients/service";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await operatorForPage();
  const query = await searchParams;
  const filters = {
    search: typeof query.search === "string" ? query.search.slice(0, 255) : "",
    include_deleted: query.include_deleted === "true" ? "true" : "false",
    page:
      typeof query.page === "string" && /^[1-9][0-9]{0,4}$/.test(query.page)
        ? query.page
        : "1",
    sort: query.sort === "newest" ? "newest" : "name",
  };
  const result = await listClients(filters);
  function pageUrl(page: number): string {
    return `/dashboard/clients?${new URLSearchParams({ ...filters, page: String(page) })}`;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Clients</h1>
          <p>Contact details, private notes and secure portal access.</p>
        </div>
        <Link href="/dashboard/clients/new" className="button">
          New client
        </Link>
      </div>
      <form method="get" className="card search-toolbar">
        <div>
          <label htmlFor="search">Search name, email or company</label>
          <input
            id="search"
            name="search"
            defaultValue={filters.search}
            maxLength={255}
          />
        </div>
        <div>
          <label htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={filters.sort}>
            <option value="name">Name</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            name="include_deleted"
            value="true"
            defaultChecked={filters.include_deleted === "true"}
          />
          Include archived clients
        </label>
        <button type="submit">Search</button>
      </form>
      <p role="status" className="list-meta">
        {result.total} clients · Page {result.page} of {result.pages}
      </p>
      {result.clients.length ? (
        <div className="table-wrap">
          <table className="client-table">
            <caption className="sr-only">Client directory</caption>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Company</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/dashboard/clients/${client.id}`}>
                      {client.name}
                    </Link>
                  </td>
                  <td>{client.company || "—"}</td>
                  <td>{client.email}</td>
                  <td>
                    <span className="status-badge">
                      {client.deletedAt ? "Archived" : "Active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="card empty-state">
          <span className="empty-symbol" aria-hidden="true">
            ◎
          </span>
          <h2>No clients found</h2>
          <p>Add your first client or change your search.</p>
          <Link href="/dashboard/clients/new" className="button">
            Create a client
          </Link>
        </section>
      )}
      <nav className="actions" aria-label="Client pages">
        {result.page > 1 && (
          <Link href={pageUrl(result.page - 1)}>Previous page</Link>
        )}
        {result.page < result.pages && (
          <Link href={pageUrl(result.page + 1)}>Next page</Link>
        )}
      </nav>
    </>
  );
}
