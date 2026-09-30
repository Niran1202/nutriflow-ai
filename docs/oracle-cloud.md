# Deploying NutriFlow AI on Oracle Cloud

NutriFlow runs on a single **Oracle Cloud Always Free** Ampere VM. The server, the SQLite database and the Llama 3.2 model all live on that VM, so the AI is private (no hosted AI API) and nothing runs on your own PC. People use NutriFlow through the Windows desktop app or a browser.

```
                       ┌──────────────── Oracle Cloud VM (Ubuntu 24.04, Ampere A1) ───────────────┐
 Desktop app / browser │  Caddy :443  ──►  NutriFlow (Next.js) 127.0.0.1:3000  ──►  Ollama :11434  │
 ──── HTTPS ─────────► │  Let's Encrypt     SQLite  /opt/nutriflow/app/server-data   llama3.2:3b     │
                       └──────────────────────────────────────────────────────────────────────────┘
```

- **Caddy** is the only thing listening publicly (80/443). It gets and renews the HTTPS certificate automatically.
- **NutriFlow** listens on `127.0.0.1:3000` only and runs as the unprivileged `nutriflow` user under systemd (restarts on failure and on reboot).
- **Ollama** listens on `127.0.0.1:11434` only; it is never exposed.
- The public address defaults to `https://<ip-with-dashes>.sslip.io` — free, no domain to buy, and it never changes as long as the VM keeps its IP. You can use your own domain instead.

## 1. Create the VM (Oracle console)

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Pick your **home region** carefully — it can't be changed later.
2. **Compute → Instances → Create instance**
   - **Image:** Canonical Ubuntu 24.04
   - **Shape:** Ampere `VM.Standard.A1.Flex` — 4 OCPUs, 24 GB memory (the Always Free maximum)
   - **Networking:** default VCN, **Assign a public IPv4 address** on
   - **SSH keys:** upload your public key (see below)

   *"Out of host capacity"* is common for free Ampere shapes — try another availability domain, or try again later.
3. **Open the web ports:** instance → **Subnet** → **Security Lists** → **Default Security List** → **Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination ports `80,443`.
4. Note the instance's **Public IP address**.

Create the SSH key on your PC first if you don't have one:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/nutriflow_oracle -C nutriflow-oracle
# upload ~/.ssh/nutriflow_oracle.pub when creating the instance
```

## 2. Deploy

From the project root on your PC (Git Bash on Windows):

```bash
bash deploy/oracle/deploy.sh <public-ip>
```

This uploads the source (never your local database, `.env`, build outputs or the desktop app), then on the VM installs Node.js 22, Ollama with `llama3.2:3b`, Caddy, the firewall rules and the systemd service, builds NutriFlow and checks it answers over HTTPS. The first run takes 15–20 minutes, mostly the model download and build.

Options:

| Option | Effect |
|---|---|
| `--domain nutriflow.example.com` | Use your own domain (point its A record at the VM's IP first) |
| `--copy-data` | Upload `server-data/nutriflow.db` — only if the server has no database yet; live data is never overwritten |
| `NUTRIFLOW_SSH_KEY=…` / `NUTRIFLOW_SSH_USER=…` | Use a different key or login user (default `~/.ssh/nutriflow_oracle`, `ubuntu`) |

Re-run the same command to ship code changes. The server's data is kept, and pending database migrations are applied on restart.

## 3. Create dietitian logins

There is no sign-up page: only the owner creates dietitian accounts.

```bash
bash deploy/oracle/manage.sh <public-ip> dietitian --name "Full Name" --email someone@example.com
```

A strong password is generated and printed once — share it privately. Add `--password "…"` to choose it yourself. Running the command again for an existing email resets the password and signs that dietitian out on every device. Patients never need an account from you: their dietitian creates them in the app and gives them an invitation code.

## 4. Build the desktop app

```bash
cd desktop
npm install
npm run dist -- --server https://<ip-with-dashes>.sslip.io
```

The installer and portable exe land in `download/`. They contain only the server address — no accounts or data. See the main README for details.

## Day-to-day operations

```bash
bash deploy/oracle/manage.sh <ip> status     # NutriFlow / Caddy / Ollama health, disk usage
bash deploy/oracle/manage.sh <ip> logs       # follow the server log
bash deploy/oracle/manage.sh <ip> restart    # restart NutriFlow
bash deploy/oracle/manage.sh <ip> list       # dietitians and patient counts
bash deploy/oracle/manage.sh <ip> backup     # consistent snapshot → ./backups/
```

**Back up regularly.** `backup` uses SQLite's `VACUUM INTO`, so it's safe while the server is running. Backups contain patient data — store them privately (they're git-ignored).

## Performance

The Ampere VM has no GPU, so Llama 3.2 3B runs on 4 ARM cores: chat replies take roughly 15–25 s and meal parsing 8–12 s (a GTX 1650 does 5–9 s). Everything else in the app is unaffected, and if the model is unavailable the agents fall back to deterministic replies.

## Security notes

- Only ports 80/443 are open; the app and the model are bound to localhost.
- Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure` over HTTPS; Caddy adds HSTS.
- Login and invitation-code attempts are rate-limited per client IP (taken from Caddy's `X-Forwarded-For`, which clients can't forge through Caddy).
- The service runs as a dedicated user with systemd hardening (`ProtectSystem=strict`, `ProtectHome`, `NoNewPrivileges`).
- Keep the VM patched: `sudo apt update && sudo apt upgrade` from time to time.
- Oracle may reclaim Always Free instances that stay almost idle for 7 days. Regular use prevents this; upgrading the account to Pay As You Go (still free within the Always Free limits) removes the risk.
