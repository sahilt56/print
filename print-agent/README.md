# Scan2Print - Local Print Agent

A standalone Node.js script that runs on the Cyber Cafe's Windows PC and bridges the web server to the physical printer.

## How It Works

```
Customer submits job → Web Server (Next.js) → Database (SQLite)
                                                      ↓
                                              Print Agent polls
                                                      ↓
                                          Downloads file to temp
                                                      ↓
                                           Sends to Windows printer
                                                      ↓
                                           Updates job status → Done
```

## Setup

### 1. Download the agent configuration

Sign in to the cafe admin dashboard, open **Settings**, and download `config.json`.
Place it in the same folder as `QrPrintAgent.exe`. The configuration contains the
cafe-specific agent key and must not be shared.

Keep `SumatraPDF-3.4.6-32.exe` in that same folder. It is included when the
agent is built and is required for silent printing.

### 2. Run the Agent

```bash
QrPrintAgent.exe
```

The agent will start polling the server every 5 seconds. When a paid job is found,
it securely downloads and prints PDF, JPG, and PNG files. Selected copies, page
range, colour mode, and A4 paper size are sent to the Windows printer.

## Requirements

- No Node.js installation is needed when using the provided `.exe`
- Keep the bundled `SumatraPDF-3.4.6-32.exe` beside `QrPrintAgent.exe`
- The **Next.js server must be accessible** from this machine (e.g., hosted online or on same local network)

## Logging

The agent will output status messages to the console. For production use, you can redirect output to a log file:

```bash
node index.js >> agent.log 2>&1
```
