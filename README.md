# My Cursor Usage

See your current Cursor plan usage without leaving your editor. My Cursor Usage adds a compact percentage and progress bar to the Cursor status bar, refreshes automatically, and opens **Cursor Settings → Plan & Usage** when clicked.

## Features

- Shows total Cursor plan usage as a percentage and compact progress bar.
- Shows Auto + Composer and API usage in the status bar tooltip.
- Refreshes every three minutes.
- Supports manual refresh with **Cursor Usage: Refresh** in the Command Palette.
- Opens **Cursor Settings → Plan & Usage** when the usage indicator is clicked.
- Requires no extension-specific account setup or API key.

## How it works

The extension reads the existing Cursor access token from Cursor's local macOS state database using `sqlite3`. It uses that token only to request the current usage period from Cursor's `DashboardService` API, then renders the returned percentages in the status bar.

The token is not stored, logged, or sent anywhere other than Cursor's API. This extension includes no analytics or telemetry.

## Requirements

- Cursor on macOS.
- An authenticated Cursor session.
- The `sqlite3` command-line tool, included with standard macOS installations.

Windows and Linux are not currently supported because the Cursor state database path is macOS-specific.

## Usage

After installation, reload Cursor. The usage indicator appears on the right side of the status bar.

- Hover to see total, Auto + Composer, and API usage.
- Click the progress bar or percentage to open **Plan & Usage**.
- Run **Cursor Usage: Refresh** from the Command Palette to refresh immediately.

## Privacy

My Cursor Usage accesses:

- Cursor's local state database, solely to read the active access token.
- `https://api2.cursor.sh`, solely to fetch current plan usage.

No usage data or credentials are sent to the extension author or any third party.

## License

Released under the MIT License. See the bundled `LICENSE` file.
