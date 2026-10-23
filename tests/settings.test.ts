import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoicePreview } from "../src/components/invoice-views";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getDb, getSql } from "../src/lib/db/client";
import { settings } from "../src/lib/db/schema";
import { completeSetup, isSetupComplete } from "../src/lib/setup/service";
import { loginOperator } from "../src/lib/auth/login";
import {
  createOperatorSession,
  validateOperatorSession,
} from "../src/lib/auth/session";
import {
  saveAccount,
  changePassword,
  listOperatorSessions,
  revokeOperatorSessions,
} from "../src/lib/auth/account";
import {
  getBranding,
  getOperatorSettings,
  saveSettings,
  removeLogo,
  settingsInput,
} from "../src/lib/settings";
import { readLogoUpload } from "../src/lib/storage/upload";
import { saveLogo, publicLogo } from "../src/lib/branding-logo";
import {
  appearanceSchema,
  appearanceStyle,
  defaultAppearance,
  palettes,
  themePalette,
  contrastRatio,
  appearanceGuidance,
} from "../src/lib/appearance";
import { brandedEmail, escapeHtml } from "../src/lib/email/branding";
import { saveClient } from "../src/lib/clients/service";
import {
  createInvoice,
  sendInvoice,
  saveInvoiceDefaults,
} from "../src/lib/invoices/service";
import { getInvoice } from "../src/lib/invoices/queries";
import {
  GET as readSettings,
  PATCH as writeSettings,
} from "../src/app/api/settings/route";
import { PATCH as writeAccount } from "../src/app/api/account/route";
import { POST as passwordPost } from "../src/app/api/account/password/route";
import {
  GET as readSessions,
  POST as revokeSessions,
} from "../src/app/api/account/sessions/route";
import {
  POST as logoPost,
  DELETE as logoDelete,
} from "../src/app/api/settings/logo/route";
import { GET as logoGet } from "../src/app/api/branding/logo/[id]/route";

const account = {
  name: "Remote Operator",
  email: "operator@example.test",
  password: "remote-proof-password-12!",
  brandName: "Remote Studio",
  brandColour: "#315e9e",
  defaultCurrency: "EUR",
  welcomeText: "A private place for our work together.",
};
const origin = process.env.APP_ORIGIN ?? "http://localhost:3093";
let actor: { id: string; role: "operator" }, token: string;
let original: typeof settings.$inferSelect, originalHash: string;
function request(
  body: unknown,
  session = token,
  method = "PATCH",
  inputOrigin = origin,
): Request {
  return new Request(origin + "/api/settings", {
    method,
    headers: {
      origin: inputOrigin,
      "content-type": "application/json",
      cookie: `pylon_session=${session}`,
    },
    ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
}
function logoRequest(
  bytes: Uint8Array = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  name = "logo.png",
  type = "image/png",
  id = randomUUID(),
): Request {
  const body = new FormData();
  body.set("requestId", id);
  body.set("file", new Blob([new Uint8Array(bytes)], { type }), name);
  return new Request(origin + "/api/settings/logo", {
    method: "POST",
    headers: { origin, cookie: `pylon_session=${token}` },
    body,
  });
}
beforeAll(async () => {
  if (!(await isSetupComplete())) await completeSetup(account);
  const login = await loginOperator({
    email: account.email,
    password: account.password,
  });
  actor = login.user;
  token = login.session.token;
  const rows = await getDb().select().from(settings);
  if (!rows[0]) throw new TypeError("Missing setup");
  original = rows[0];
  const credentials = await getSql()<
    { hash: string }[]
  >`select password_hash as hash from operator`;
  originalHash = credentials[0]?.hash ?? "";
});
afterAll(async () => {
  if (original) await getDb().update(settings).set(original);
  if (originalHash)
    await getSql()`update operator set name=${account.name},email=${account.email},password_hash=${originalHash}`;
  await getSql().end();
});

describe("consumed installation settings", () => {
  it("defaults consent off, persists only protected sections, excludes operational facts publicly", async () => {
    expect(original.allowAutomaticUpdates).toBe(false);
    expect(original.finish).toBe("layered");
    expect((await readSettings(request({}, "", "GET"))).status).toBe(401);
    expect(
      (
        await writeSettings(
          request(
            { section: "updates", allowAutomaticUpdates: true },
            token,
            "PATCH",
            "https://foreign.test",
          ),
        )
      ).status,
    ).toBe(403);
    for (const input of [
      { section: "updates", allowAutomaticUpdates: "yes" },
      { section: "updates", allowAutomaticUpdates: true, invoiceNextNumber: 1 },
      {
        section: "appearance",
        ...defaultAppearance,
        typography: "unvalidated",
      },
    ])
      expect((await writeSettings(request(input))).status).toBe(400);
    await expect(
      getOperatorSettings({ id: actor.id, role: "client" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      saveSettings(
        { section: "updates", allowAutomaticUpdates: true },
        { ...actor, role: "client" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    for (const value of [true, true, false]) {
      expect(
        (
          await writeSettings(
            request({ section: "updates", allowAutomaticUpdates: value }),
          )
        ).status,
      ).toBe(200);
      expect((await getOperatorSettings(actor)).allowAutomaticUpdates).toBe(
        value,
      );
    }
    const publicValue = await getBranding();
    expect(publicValue).not.toHaveProperty("allowAutomaticUpdates");
    expect(publicValue).not.toHaveProperty("invoiceNextNumber");
    expect(
      settingsInput.safeParse({
        section: "branding",
        brandName: "Name",
        brandColour: "#ffffff",
        contactEmail: "",
        contactPhone: "",
        businessAddress: "",
        website: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("keeps concurrent numbering and issued identity while future defaults and contact change", async () => {
    const client = await saveClient(
      {
        name: "Settings client",
        email: `settings-${randomUUID()}@example.test`,
      },
      actor,
    );
    await saveInvoiceDefaults(
      {
        invoicePrefix: "S43",
        invoiceNextNumber: 1,
        paymentInstructions: "Original instructions",
      },
      actor,
    );
    const create = (): ReturnType<typeof createInvoice> =>
      createInvoice(
        {
          requestId: randomUUID(),
          clientId: client.id,
          currency: "EUR",
          lineItems: [
            { description: "Design", quantity: "1", unitPrice: 12000 },
          ],
        },
        actor,
      );
    const first = await create(),
      sent = await sendInvoice(
        first.id,
        { expectedRevision: first.revision },
        actor,
      );
    const changed = {
      section: "branding",
      brandName: "Updated Studio",
      brandColour: "#aabbcc",
      contactEmail: "hello@example.test",
      contactPhone: "+44 123",
      businessAddress: "Studio 4\nLondon",
      website: "https://example.test",
    };
    const results = await Promise.all([
      saveSettings(changed, actor),
      create(),
      create(),
      saveSettings(
        {
          section: "portal",
          welcomeText: "Welcome to our new portal.",
          defaultCurrency: "JPY",
        },
        actor,
      ),
    ]);
    expect(results).toHaveLength(4);
    const numbers = await getSql()<
      { number: string }[]
    >`select invoice_number as number from invoices where prefix='S43'`;
    expect(new Set(numbers.map((row) => row.number)).size).toBe(3);
    const saved = await getInvoice(first.id, actor);
    expect(saved).toEqual(sent);
    expect(saved.currency).toBe("EUR");
    const html = renderToStaticMarkup(InvoicePreview({ invoice: saved }));
    expect(html).toContain(`--brand-colour:${sent.brandColour}`);
    expect(html).toContain(palettes.warm.surface);
    expect((await getBranding())?.defaultCurrency).toBe("JPY");
    const next = await create(),
      nextSent = await sendInvoice(
        next.id,
        { expectedRevision: next.revision },
        actor,
      );
    expect(nextSent.issuerName).toBe("Updated Studio");
    expect(nextSent.issuerEmail).toBe("hello@example.test");
    expect(nextSent.issuerDetails).toMatchObject({
      businessAddress: "Studio 4\nLondon",
      finish: original.finish,
    });
    await expect(
      saveInvoiceDefaults(
        { invoicePrefix: "S43", invoiceNextNumber: 2, paymentInstructions: "" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "NUMBER_REUSE" });
  });

  it("publishes validated logos only, retains historical bytes and handles retry without resurrecting replaced assets", async () => {
    const id = randomUUID(),
      input = logoRequest(undefined, undefined, undefined, id);
    const upload = await readLogoUpload(input);
    try {
      await saveLogo(upload, actor);
      await saveLogo(upload, actor);
    } finally {
      await upload.cleanup();
    }
    const response = await logoGet(input, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
    );
    await removeLogo(actor);
    expect((await getBranding())?.logoId).toBeNull();
    expect((await publicLogo(id)).status).toBe(200);
    expect(
      (await logoGet(input, { params: Promise.resolve({ id: randomUUID() }) }))
        .status,
    ).toBe(404);
    await expect(publicLogo("../messages/private")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await logoPost(logoRequest(Buffer.from("not png")))).status).toBe(
      400,
    );
    expect(
      (
        await logoPost(
          logoRequest(Buffer.from("<svg></svg>"), "logo.svg", "image/svg+xml"),
        )
      ).status,
    ).toBe(400);
    const huge = Buffer.alloc(1024 * 1024 + 1);
    Buffer.from("89504e470d0a1a0a", "hex").copy(huge);
    expect((await logoPost(logoRequest(huge))).status).toBe(413);
    expect((await logoDelete(request({}, token, "DELETE"))).status).toBe(200);
  });
});

async function waitForLock(fragment: string, minimum = 1): Promise<void> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const rows =
      await getSql()`select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and position(${fragment} in query)>0 and pid<>pg_backend_pid()`;
    if (rows.length >= minimum) return;
  }
  throw new TypeError(
    `Owned ${fragment} query did not reach the operator lock`,
  );
}

async function queuedLoginRace(
  action: () => Promise<unknown>,
  expectedSessions = 0,
  staleAction?: () => Promise<unknown>,
): Promise<void> {
  const holder = postgres(process.env.MIGRATION_DATABASE_URL ?? "", { max: 1 });
  let release: () => void = () => undefined,
    acquired: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transaction = holder.begin(async (sql) => {
    await sql`select id from operator for update`;
    acquired();
    await held;
  });
  await ready;
  let writer: Promise<unknown> | undefined,
    login: ReturnType<typeof loginOperator> | undefined,
    stale: Promise<unknown> | undefined;
  try {
    writer = action();
    await waitForLock('password_hash as "passwordHash"');
    login = loginOperator({ email: account.email, password: account.password });
    const settled = login.then(
      () => ({ accepted: true }),
      () => ({ accepted: false }),
    );
    await waitForLock("password_hash,auth_generation");
    if (staleAction) {
      stale = staleAction().then(
        () => ({ accepted: true }),
        () => ({ accepted: false }),
      );
      await waitForLock('password_hash as "passwordHash"', 2);
    }
    release();
    await transaction;
    await writer;
    expect(await settled).toEqual({ accepted: false });
    if (stale) expect(await stale).toEqual({ accepted: false });
    expect(
      Number(
        (await getSql()`select count(*) as n from operator_sessions`)[0]?.n,
      ),
    ).toBe(expectedSessions);
  } finally {
    release();
    await transaction;
    await Promise.allSettled([writer, login, stale]);
    await holder.end();
  }
}

describe("operator account and consumed login concurrency", () => {
  it("protects profile/password/session adapters and exposes only session metadata", async () => {
    expect(
      (
        await writeAccount(
          request(
            {
              name: "Name",
              email: account.email,
              currentPassword: account.password,
            },
            "",
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await passwordPost(
          request(
            {
              currentPassword: account.password,
              newPassword: "different-123",
              confirmPassword: "mismatch-123",
            },
            token,
            "POST",
          ),
        )
      ).status,
    ).toBe(400);
    await saveAccount(
      {
        name: "Updated Operator",
        email: account.email.toUpperCase(),
        currentPassword: account.password,
      },
      token,
    );
    expect((await validateOperatorSession(token))?.name).toBe(
      "Updated Operator",
    );
    const previous = await listOperatorSessions(token),
      second = await createOperatorSession(actor.id),
      list = await listOperatorSessions(token);
    expect(list.some((item) => item.current)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(second.token);
    expect(JSON.stringify(list)).not.toContain("token_hash");
    expect((await readSessions(request({}, token, "GET"))).status).toBe(200);
    const other = list.find(
      (item) => !previous.some((old) => old.id === item.id),
    );
    if (!other) throw new TypeError("Missing second session");
    expect(
      (
        await revokeSessions(
          request({ scope: "one", id: other.id }, token, "POST"),
        )
      ).status,
    ).toBe(200);
    expect(await validateOperatorSession(second.token)).toBeNull();
  });
  it("preserves credentials and live sessions on wrong password or a failed session insert", async () => {
    const input = {
      currentPassword: account.password,
      newPassword: "rollback-passphrase-43!",
      confirmPassword: "rollback-passphrase-43!",
    };
    const before =
      await getSql()`select password_hash,auth_generation from operator`;
    const clientSessions =
      await getSql()`select * from client_sessions order by token_hash`;
    await expect(
      changePassword(
        { ...input, currentPassword: "incorrect-passphrase-43!" },
        token,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const admin = postgres(process.env.MIGRATION_DATABASE_URL ?? "", {
      max: 1,
    });
    try {
      await admin.unsafe(
        "create function test_fail_rotation() returns trigger language plpgsql as $$begin raise exception 'synthetic insertion failure'; end$$",
      );
      await admin.unsafe(
        "create trigger test_fail_rotation before insert on operator_sessions for each row execute function test_fail_rotation()",
      );
      const response = await passwordPost(request(input, token, "POST"));
      expect(response.status).toBe(503);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(
        await getSql()`select password_hash,auth_generation from operator`,
      ).toEqual(before);
      expect((await validateOperatorSession(token))?.id).toBe(actor.id);
      expect(
        await getSql()`select * from client_sessions order by token_hash`,
      ).toEqual(clientSessions);
    } finally {
      await admin.unsafe(
        "drop trigger if exists test_fail_rotation on operator_sessions",
      );
      await admin.unsafe("drop function if exists test_fail_rotation()");
      await admin.end();
    }
  });
  it("rejects an old-hash login queued after password change and revokes real old tokens", async () => {
    const newPassword = "changed-unique-passphrase-12!";
    const other = await createOperatorSession(actor.id);
    let renewed = "";
    try {
      await queuedLoginRace(
        async () => {
          const response = await passwordPost(
            request(
              {
                currentPassword: account.password,
                newPassword,
                confirmPassword: newPassword,
              },
              token,
              "POST",
            ),
          );
          expect(response.status).toBe(200);
          const body: unknown = await response.json();
          expect(body).toMatchObject({ data: { saved: true }, error: null });
          expect(JSON.stringify(body)).not.toMatch(/token|session|password/i);
          const cookie = response.headers.get("set-cookie") ?? "";
          expect(cookie).toContain("HttpOnly; SameSite=Lax");
          expect(cookie).not.toContain("Domain=");
          renewed = cookie.split(";")[0]?.slice("pylon_session=".length) ?? "";
          expect(renewed).toMatch(/^[0-9a-f]{64}$/);
        },
        1,
        () =>
          changePassword(
            {
              currentPassword: account.password,
              newPassword: "stale-change-passphrase-43!",
              confirmPassword: "stale-change-passphrase-43!",
            },
            token,
          ),
      );
      expect(await validateOperatorSession(token)).toBeNull();
      expect(await validateOperatorSession(other.token)).toBeNull();
      expect((await validateOperatorSession(renewed))?.id).toBe(actor.id);
      await expect(
        changePassword(
          {
            currentPassword: account.password,
            newPassword,
            confirmPassword: newPassword,
          },
          token,
        ),
      ).rejects.toMatchObject({ statusCode: 401 });
      const stored = await getSql()`select token_hash from operator_sessions`;
      expect(stored).toHaveLength(1);
      expect(JSON.stringify(stored)).not.toContain(renewed);
      await expect(
        loginOperator({ email: account.email, password: account.password }),
      ).rejects.toMatchObject({ statusCode: 401 });
      const current = await loginOperator({
        email: account.email,
        password: newPassword,
      });
      expect(current.session.token).toHaveLength(64);
    } finally {
      await getSql()`update operator set password_hash=${originalHash}`;
      token = (await createOperatorSession(actor.id)).token;
    }
  });
  it("rejects an in-flight old-generation login after revoke-all even when its password is unchanged", async () => {
    await queuedLoginRace(() =>
      revokeOperatorSessions(
        { scope: "all", currentPassword: account.password },
        token,
      ),
    );
    expect(await validateOperatorSession(token)).toBeNull();
    expect(
      (
        await loginOperator({
          email: account.email,
          password: account.password,
        })
      ).user.id,
    ).toBe(actor.id);
    token = (await createOperatorSession(actor.id)).token;
  });
});

describe("bounded accessible appearance and email output", () => {
  it("validates all saved choices and consumes typography, density, corners and both palettes", async () => {
    for (const appearance of [
      defaultAppearance,
      {
        ...defaultAppearance,
        typography: "modern",
        density: "compact",
        corners: "square",
        lightPalette: "cool",
        darkPalette: "midnight",
        lightBackground: palettes.cool.canvas,
        lightSurface: palettes.cool.surface,
        darkBackground: palettes.midnight.canvas,
        darkSurface: palettes.midnight.surface,
      },
    ]) {
      const parsed = appearanceSchema.parse(appearance);
      await saveSettings({ section: "appearance", ...parsed }, actor);
      expect(await getBranding()).toMatchObject(parsed);
      const css = appearanceStyle(parsed);
      expect(JSON.stringify(css)).toContain(
        palettes[parsed.lightPalette].surface,
      );
      expect(JSON.stringify(css)).toContain(
        palettes[parsed.darkPalette].surface,
      );
      const html = brandedEmail(
        "Brand <x>",
        "<p>Real content</p>",
        {
          ...parsed,
          logoId: randomUUID(),
          businessAddress: "Address & more",
          contactPhone: "123",
          website: "https://example.test",
        },
        "hello@example.test",
      );
      expect(html).toContain("Brand &lt;x&gt;");
      expect(html).toContain("/api/branding/logo/");
      expect(html).toContain("Address &amp; more");
      expect(html).toContain(palettes[parsed.darkPalette].surface);
    }
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
    expect(brandedEmail("Legacy", "<p>Content</p>", null)).toContain("Legacy");
    for (const palette of Object.values(palettes)) {
      const luminance = (hex: string): number => {
        const channels = [1, 3, 5]
          .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((value) =>
            value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
          );
        return (
          (channels[0] ?? 0) * 0.2126 +
          (channels[1] ?? 0) * 0.7152 +
          (channels[2] ?? 0) * 0.0722
        );
      };
      for (const text of [palette.text, palette.muted])
        for (const surface of [
          palette.surface,
          palette.canvas,
          palette.surfaceMuted,
        ]) {
          const a = luminance(text),
            b = luminance(surface);
          expect(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          ).toBeGreaterThanOrEqual(4.5);
        }
    }
  });
  it("accepts all valid surface pairs with advisory guidance and rejects invalid syntax without saving", async () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(
      appearanceSchema.parse({
        ...defaultAppearance,
        brandName: "Operator-only form source",
        allowAutomaticUpdates: true,
      }),
    ).toEqual(defaultAppearance);
    const mixed = {
      ...defaultAppearance,
      lightBackground: "#000000",
      lightSurface: "#ffffff",
    };
    expect(appearanceGuidance(mixed)).toEqual([
      expect.stringContaining("Light background and light surface"),
    ]);
    expect(
      (
        await writeSettings(
          request({
            section: "appearance",
            ...mixed,
          }),
        )
      ).status,
    ).toBe(200);
    expect(await getBranding()).toMatchObject(mixed);
    const before = await getBranding();
    expect(
      (
        await writeSettings(
          request({ section: "appearance", ...mixed, lightSurface: "#12345z" }),
        )
      ).status,
    ).toBe(400);
    expect(await getBranding()).toEqual(before);
    expect(appearanceGuidance(defaultAppearance)).toEqual([]);
    for (const [background, surface] of [
      ["#e9dfd0", "#fff4e5"],
      ["#17251f", "#243c32"],
      ["#ffffff", "#aaaaaa"],
      ["#222222", "#444444"],
      ["#ffe080", "#e0f0ff"],
    ]) {
      const custom = appearanceSchema.parse({
        ...defaultAppearance,
        lightBackground: background,
        lightSurface: surface,
        darkBackground: background,
        darkSurface: surface,
      });
      for (const brand of [
        "#000000",
        "#ffffff",
        "#ffff00",
        "#365b54",
        "#ff0000",
        "#7400b3",
      ])
        for (const mode of ["light", "dark"] as const) {
          const output = themePalette(custom, mode, brand);
          expect(output.canvas).toBe(background);
          expect(output.surface).toBe(surface);
          expect(output.colorScheme).toBe(
            contrastRatio("#ffffff", output.canvas) >= 4.5 &&
              contrastRatio("#ffffff", output.surface) >= 4.5
              ? "dark"
              : "light",
          );
          for (const foreground of [
            output.text,
            output.muted,
            output.accentInk,
            output.danger,
            output.positive,
          ])
            for (const bg of [
              output.canvas,
              output.surface,
              output.surfaceMuted,
              output.accentSoft,
              output.dangerSurface,
              output.positiveSurface,
            ])
              expect(contrastRatio(foreground, bg)).toBeGreaterThanOrEqual(4.5);
          for (const bg of [output.canvas, output.surface, output.surfaceMuted])
            expect(contrastRatio(output.border, bg)).toBeGreaterThanOrEqual(3);
          expect(output.brandFill).toBe(brand);
          expect(
            contrastRatio(output.actionInk, output.brandFill),
          ).toBeGreaterThanOrEqual(4.5);
          expect(JSON.stringify(appearanceStyle(custom, brand))).toContain(
            background,
          );
        }
    }
  });
});
