# Operate and recover Yinsen

Use the same [installation package](INSTALL.md) for each independently owned
installation. Run one application process. These commands operate Docker on the
installation host; they never give Docker, SSH, migration or secret-manager access
to the web application. The Linux/Abyss recipe uses Node22.21.1, Docker Compose
2.24.4+, PostgreSQL16, `flock` and user-scoped `systemd-creds` (257+;259 exercised).
No scheduler, central service or automatic enrollment is installed.

## Bind one private installation

Use an installation-specific private directory outside a disposable checkout.
Choose a unique Compose project (`yinsen_…`), origin, loopback app/DB ports,
database and three separate DB passwords in the installation environment from
[INSTALL.md](INSTALL.md). Preserve that database/upload volume and its original
provider stores. Put checkpoints on a separate backed-up filesystem with enough
space for a full database and all retained file bytes. A checkpoint on the same
disk protects replacement failures, not disk loss.

The selected programmatic secret manager is systemd's encrypted user credential
store. Bootstrap it as the same dedicated OS user that will run operations:

```sh
mkdir -p /private/yinsen-personal
chmod 700 /private/yinsen-personal
systemd-creds encrypt --user --name=yinsen-installation /private/installation.env /private/yinsen-personal/installation.cred
chmod 600 /private/yinsen-personal/installation.cred
```

Replace example paths with your own private paths. Keep the bootstrap environment
in your existing secure recovery custody. The credential is bound to this user
and machine; it is not a portable backup of the machine key. Keep a separately
secured portable copy of the original secret values for host-loss recovery.
Do not use null-key credentials. Do not put infrastructure secrets in GitHub
repository variables, images, browser state, screenshots or public logs.

Create owner-only `installation.json` in that directory:

```json
{
  "format": 1,
  "project": "yinsen_personal",
  "credentialFile": "installation.cred",
  "stateDirectory": "state",
  "backupDirectory": "checkpoints"
}
```

Relative paths resolve against this JSON. Its `project` must match the encrypted
environment's `COMPOSE_PROJECT_NAME`. JSON/credential files require0600 and
state/checkpoint directories0700. The same programmatic retrieval supplies each
operation's exact environment through a0600 file in the user's private runtime
directory. It is removed on normal exit. No secret values are printed. Inherited
Compose configuration variables cannot redirect the target.

From the trusted source checkout (Node dependencies installed):

```sh
npm run installation -- status /private/yinsen-personal/installation.json
```

Status verifies the actual serving image, health identity and installed inputs.
After replacement, state stores the selected image references without changing
your private secrets. Always use this same state directory for manual and CI
calls; native `flock` serializes every operation. A competing invocation exits
nonzero. Do not replace/move the lock file while a command runs. Keep the private
state directory and its completed/interrupted journals with the installation.

## Consistent database and file backup

Stop external database clients and all other writers before starting. The command
stops the application, checks for remaining DB clients, dumps the complete
database, copies the entire local upload volume (including retained orphan/logo
bytes) and downloads every DB-referenced private S3 object. All branding assets,
message attachments and deliverable versions are included, regardless of current
release state or current logo. Unrelated objects in a shared bucket are not part
of this installation and are neither listed nor modified.

```sh
npm run installation -- backup /private/yinsen-personal/installation.json
```

A completed checkpoint contains `database.dump`, `files`, encrypted installation
configuration and `snapshot.json` with the full byte inventory, SHA256 checksums
and exact prior artifacts. Missing/changed files fail the operation; no incomplete
snapshot is called successful. The app resumes with the original image. Do not
browse the app during capture: even authenticated reads refresh sessions.
Backups contain private business data and live authentication material. Keep them
private and copy them into your secured off-host backup custody. Retain original
failed attempts, checkpoints, volumes and provider objects.

## Rehearse an isolated recovery

Prepare a second encrypted installation JSON with a different project, database,
three passwords, ports, origin, local uploads and recovery destination. Set
`STORAGE_DRIVER=local`; omit all S3, Resend and Stripe values. Start no app there.
Keep recovered data private: restored sessions and login links remain sensitive.

```sh
npm run installation -- restore-copy /private/yinsen-rehearsal/installation.json /private/yinsen-personal/checkpoints/COMPLETE-CHECKPOINT
```

The command verifies checksums before restoration, creates the isolated database,
restores its schema/data/least-privilege grants and complete local files, then
starts the exact prior runtime. Recovered S3 references keep their keys/history
but use the checkpoint's local bytes, so this copy never writes original R2 keys.
Original storage and installation remain untouched. Check real operator/client
login, messages/proposals/projects/milestones, invoice history, version release
and relock states, branding and authorized downloads against original SHA256.
An existing app target is refused. Do not use this command as a data merge.

On host loss, recreate Docker/DB roles and supply separately secured portable
configuration, then follow this isolated restore procedure with the retained
matching images. Encrypted credentials alone do not recover their lost host key.
The recovered local installation can run without external providers. Moving it
back to a new private R2 bucket requires a separately verified file migration;
changing environment values does not move files.

## Opt-in qualified update

In **Settings**, the operator may save **Allow automatic updates**. Default is
off. Saving starts nothing. Each explicit command reads its current value using
ordinary runtime DB credentials, then reads it again immediately before starting
disruption. Off, missing or unreadable permission leaves the current app serving.
Turning off prevents later starts; it cannot cancel an already-started attempt.

```sh
npm run installation -- update /private/yinsen-personal/installation.json /private/approved/artifacts.json /private/approved/qualification.json
```

For published artifacts, use the approved `release.json` and matching
`release-qualification.json` instead. Trust release metadata only from your chosen
release authority. A checksum receipt binds files; it is not a digital signature.
The command verifies receipt/immutable images/embedded identity, pulls pinned
registry artifacts before disruption, validates that the installed migration
ledger is an unchanged exact prefix, then rechecks permission. Invalid metadata,
older releases, reused sequences and rewritten migrations are refused. An exact
duplicate does not migrate or replace anything. Sequences belong to one stable
release authority; see [INSTALL.md](INSTALL.md).

After eligibility, the command journals its start, stops writes, makes a complete
recoverable checkpoint, explicitly runs the approved tools' migrate/status,
replaces the app, and checks actual container image, served release identity,
database schema and installed public-page smoke. Operators must also check the
important authenticated business journeys/downloads after replacement. Update
success never implies compatibility with hypothetical future releases.

A checkpoint/migration/readiness failure returns nonzero and attempts recovery of
the previous database/files/image. A failure before a complete checkpoint restarts
the original app. Same-target recovery preserves remote objects and requires the
original immutable R2 objects/configuration to remain available. Complete
independent file recovery is the isolated local-copy procedure above.

```sh
npm run installation -- recover /private/yinsen-personal/installation.json
```

Use this after correcting the cause of an interrupted/failed recovery. Pending
journals block new updates/backups. Retained journals identify prior images and
checkpoint. If power/process loss occurred during migration, restore the complete
checkpoint; never blindly run the old image against a changed ledger. Restoring
an earlier checkpoint discards later database writes, so keep the app stopped and
preserve an additional recovery copy before manual repair. No volume deletion or
automatic schema downgrade is part of this procedure. Forward repair needs a
reviewed compatible migration; future schema rollback is not promised.

## User-controlled workflow and troubleshooting

`.github/workflows/update-installation.yml` is an explicit dispatch for one
pre-enrolled target. The owner supplies a dedicated trusted `yinsen-target`
self-hosted Linux runner under the credential's OS user and protects the
`installation` environment with required review. Set its nonsecret
`YINSEN_INSTALLATION` variable to the private target JSON path. The job downloads
the chosen release+receipt and calls this exact target-local command; it receives
no infrastructure secret from the web process. Do not enroll untrusted PR jobs
on that runner. The source qualification workflow remains unprivileged.

Live GitHub/CD execution, publication, production provisioning/deployment and
business-site integration remain **UNVERIFIED**, reserved for separately
authorized Phase5.5. No job was triggered during local qualification.

Use `docker logs <exact-owned-app-container>` and the corresponding PostgreSQL
logs privately. Check origin/loopback routing, configured schema and retained
operation journal before retrying. An unavailable/missing provider file must be
recovered, not bypassed by changing release flags. DB password strings do not
rotate existing roles. A partially configured optional provider refuses startup.
Never share raw environment output, cookies, magic links or backup contents in a
support report. See [SUPPORT.md](SUPPORT.md).
