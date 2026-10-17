import type { ReactElement } from "react";
import { operatorForPage } from "../../lib/auth/page";
import Link from "next/link";

export default async function Dashboard(): Promise<ReactElement> {
  const identity = await operatorForPage();
  return (
    <>
      <p className="eyebrow">Overview</p>
      <h1>Welcome, {identity.name}</h1>
      <p>Your portal is ready. You are signed in as its operator.</p>
      <section className="card">
        <h2>Operator account</h2>
        <p>{identity.email}</p>
        <p>
          <Link href="/">View your public portal</Link>
        </p>
      </section>
    </>
  );
}
