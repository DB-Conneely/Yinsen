import type { ReactElement } from "react";
import Link from "next/link";
import { operatorForPage } from "../../../lib/auth/page";
import { listClients } from "../../../lib/clients/service";

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
      <div className="actions">
        <h1>Clients</h1>
        <Link href="/dashboard/clients/new" className="button">
          New client
        </Link>
      </div>
      <form method="get" className="card">
        <label htmlFor="search">Search name, email or company</label>
        <input
          id="search"
          name="search"
          defaultValue={filters.search}
          maxLength={255}
        />
        <label htmlFor="sort">Sort</label>
        <select id="sort" name="sort" defaultValue={filters.sort}>
          <option value="name">Name</option>
          <option value="newest">Newest first</option>
        </select>
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
      <p role="status">
        {result.total} clients · Page {result.page} of {result.pages}
      </p>
      {result.clients.length ? (
        <ul className="client-list">
          {result.clients.map((client) => (
            <li className="card" key={client.id}>
              <h2>
                <Link href={`/dashboard/clients/${client.id}`}>
                  {client.name}
                </Link>
              </h2>
              <p>
                {client.company || "No company"}
                <br />
                {client.email}
              </p>
              {client.deletedAt && <strong>Archived</strong>}
            </li>
          ))}
        </ul>
      ) : (
        <section className="card">
          <h2>No clients found</h2>
          <p>Add your first client or change your search.</p>
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
