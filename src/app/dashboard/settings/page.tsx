import type { ReactElement } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { operatorForPage } from "../../../lib/auth/page";
import { SESSION_COOKIE } from "../../../lib/auth/session";
import { listOperatorSessions } from "../../../lib/auth/account";
import { getOperatorSettings } from "../../../lib/settings";
import { getSql } from "../../../lib/db/client";
import {
  BrandingSettings,
  AppearanceSettings,
  LogoSettings,
} from "../../../components/settings-branding";
import {
  AccountSettings,
  PasswordSettings,
  OperatorSessionSettings,
  ClientSessionSettings,
} from "../../../components/settings-account";
import { InvoiceDefaults } from "../../../components/invoice-actions";
import {
  PortalSettings,
  UpdateSettings,
} from "../../../components/settings-general";

export default async function SettingsPage(): Promise<ReactElement> {
  const identity = await operatorForPage(),
    settings = await getOperatorSettings(identity);
  const sessions = await listOperatorSessions(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  const clients = await getSql()<
    { id: string; name: string; email: string }[]
  >`select id,name,email from clients where deleted_at is null order by name,id`;
  return (
    <div className="settings-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Make it yours</p>
          <h1>Settings</h1>
          <p>
            Your brand, your portal, your account. Save each section
            independently.
          </p>
        </div>
        <Link href="/" className="button secondary">
          View public portal ↗
        </Link>
      </header>
      <nav className="settings-nav" aria-label="Settings sections">
        <a href="#branding">Branding</a>
        <a href="#appearance">Appearance</a>
        <a href="#portal">Portal & invoicing</a>
        <a href="#account">Account & security</a>
        <a href="#updates">Updates</a>
      </nav>
      <section id="branding" className="card settings-section">
        <div className="settings-section-heading">
          <span className="section-number">01</span>
          <div>
            <h2>Brand & business</h2>
            <p>A familiar identity for every client interaction.</p>
          </div>
        </div>
        <BrandingSettings settings={settings} />
        <div className="settings-divider">
          <h3>Logo</h3>
          <LogoSettings logoId={settings.logoId} />
        </div>
      </section>
      <section id="appearance" className="card settings-section">
        <div className="settings-section-heading">
          <span className="section-number">02</span>
          <div>
            <h2>Installation appearance</h2>
            <p>A considered palette and type treatment across your portal.</p>
          </div>
        </div>
        <AppearanceSettings settings={settings} />
      </section>
      <section id="portal" className="card settings-section">
        <div className="settings-section-heading">
          <span className="section-number">03</span>
          <div>
            <h2>Portal & invoicing</h2>
            <p>Welcome clients and set the defaults for new work.</p>
          </div>
        </div>
        <PortalSettings settings={settings} />
        <InvoiceDefaults
          prefix={settings.invoicePrefix}
          next={settings.invoiceNextNumber}
          instructions={settings.paymentInstructions}
        />
      </section>
      <section id="account" className="card settings-section">
        <div className="settings-section-heading">
          <span className="section-number">04</span>
          <div>
            <h2>Account & security</h2>
            <p>Protect your operator account and manage signed-in browsers.</p>
          </div>
        </div>
        <AccountSettings identity={identity} />
        <details className="settings-divider">
          <summary>Change password</summary>
          <PasswordSettings />
        </details>
        <div className="settings-divider">
          <h3>Operator sessions</h3>
          <OperatorSessionSettings sessions={sessions} />
        </div>
        <details className="settings-divider">
          <summary>Client sessions</summary>
          <ClientSessionSettings clients={clients} />
        </details>
      </section>
      <section id="updates" className="card settings-section">
        <div className="settings-section-heading">
          <span className="section-number">05</span>
          <div>
            <h2>Update permission</h2>
            <p>
              Choose whether this installation may receive automatic updates.
            </p>
          </div>
        </div>
        <UpdateSettings enabled={settings.allowAutomaticUpdates} />
      </section>
      <p className="settings-footnote">
        Integration credentials stay on your server.{" "}
        <Link href="/operator-guide">Read the configuration guide</Link> for
        providers and restart requirements.
      </p>
    </div>
  );
}
