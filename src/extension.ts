import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);
const REFRESH_INTERVAL_MS = 180000;
const CURSOR_USAGE_PINK = '#f778c6';
const CURSOR_SETTINGS_COMMAND = 'aiSettings.action.open';
const CURSOR_PLAN_USAGE_TAB = 'plan-usage';

let statusBarItem: vscode.StatusBarItem;
let usageBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

type Usage = {
  totalPercent: number;
  autoPercent: number;
  apiPercent: number;
  displayMessage?: string;
};

export function activate(context: vscode.ExtensionContext) {
  try {
    outputChannel = vscode.window.createOutputChannel('Cursor My Usage');
    outputChannel.appendLine('=== Extension Activated ===');

    usageBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    usageBarItem.command = 'cursorMyUsage.openPlanUsage';
    usageBarItem.color = CURSOR_USAGE_PINK;

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'cursorMyUsage.openPlanUsage';
    context.subscriptions.push(usageBarItem, statusBarItem);

    statusBarItem.text = `$(sync~spin) Cursor: Starting...`;
    statusBarItem.show();

    // Show a message so we know the extension is alive
    vscode.window.showInformationMessage('Cursor My Usage activated');

    context.subscriptions.push(
      vscode.commands.registerCommand('cursorMyUsage.refresh', () => {
        outputChannel.appendLine('Refresh command triggered');
        updateUsage(true);
      }),
      vscode.commands.registerCommand('cursorMyUsage.openPlanUsage', async () => {
        outputChannel.appendLine('Opening Cursor Plan & Usage settings');
        await vscode.commands.executeCommand(CURSOR_SETTINGS_COMMAND, CURSOR_PLAN_USAGE_TAB);
      })
    );

    updateUsage(true);

    // Auto refresh
    const interval = setInterval(() => updateUsage(false), REFRESH_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });

  } catch (err: any) {
    console.error('Activation error:', err);
    vscode.window.showErrorMessage('Cursor My Usage failed to start: ' + err.message);
  }
}

async function updateUsage(manual = false) {
  try {
    outputChannel.appendLine(`\n--- Update started (${manual ? 'manual' : 'auto'}) ---`);

    const token = await getAccessToken();
    if (!token) {
      outputChannel.appendLine('No token found');
      usageBarItem.hide();
      statusBarItem.text = `$(warning) Cursor: No token`;
      statusBarItem.show();
      return;
    }

    outputChannel.appendLine('Token found. Calling API...');

    const usage = await fetchUsage(token);
    if (usage) {
      const percent = Math.round(usage.totalPercent);
      const tooltip = [
        `Cursor usage: ${formatPercent(usage.totalPercent)}`,
        `Auto: ${formatPercent(usage.autoPercent)}`,
        `API: ${formatPercent(usage.apiPercent)}`,
        usage.displayMessage
      ].filter(Boolean).join('\n');
      usageBarItem.text = renderUsageBar(percent);
      usageBarItem.tooltip = tooltip;
      statusBarItem.text = `Cursor: ${percent}%`;
      statusBarItem.tooltip = tooltip;
      usageBarItem.show();
      statusBarItem.show();
      outputChannel.appendLine(`Success → ${percent}%`);
    } else {
      usageBarItem.hide();
      statusBarItem.text = `$(error) Cursor: API Error`;
      statusBarItem.show();
    }
  } catch (err: any) {
    outputChannel.appendLine('ERROR in updateUsage: ' + err.message);
    console.error(err);
    usageBarItem.hide();
    statusBarItem.text = `$(error) Cursor: Error`;
    statusBarItem.show();
  }
}

async function getAccessToken(): Promise<string | null> {
  const dbPath = path.join(process.env.HOME || '', 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  outputChannel.appendLine('DB Path: ' + dbPath);

  if (!fs.existsSync(dbPath)) {
    outputChannel.appendLine('Database file not found');
    return null;
  }

  // Try sqlite3 first (more reliable)
  try {
    const { stdout } = await execFileAsync('sqlite3', [
      dbPath,
      "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;"
    ]);
    const token = stdout.trim();
    if (token) {
      outputChannel.appendLine('Token retrieved via sqlite3');
      return token;
    }
  } catch (e: any) {
    outputChannel.appendLine('sqlite3 failed: ' + e.message);
  }

  return null;
}

async function fetchUsage(token: string) {
  try {
    const res = await fetch('https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      outputChannel.appendLine('API status: ' + res.status);
      return null;
    }

    const data: any = await res.json();
    const plan = data.planUsage || data.usage || {};

    return {
      totalPercent: toPercent(plan.totalPercentUsed ?? plan.percentUsed ?? plan.totalPercent),
      autoPercent: toPercent(plan.autoPercentUsed ?? plan.autoComposerPercent ?? plan.autoPercent),
      apiPercent: toPercent(plan.apiPercentUsed ?? plan.apiPercent),
      displayMessage: data.displayMessage
    };
  } catch (e: any) {
    outputChannel.appendLine('Fetch error: ' + e.message);
    return null;
  }
}

function toPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function renderUsageBar(percent: number): string {
  // Thirteen cells × eight fill levels gives 104 visual steps. Every whole
  // percentage therefore gets its own state without making the status item wide.
  const cellCount = 13;
  const partialCells = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filledEighths = Math.round((clampedPercent / 100) * cellCount * 8);
  const fullCells = Math.floor(filledEighths / 8);
  const partialEighths = filledEighths % 8;
  const partialCell = partialEighths > 0 ? partialCells[partialEighths] : '';
  const emptyCells = cellCount - fullCells - (partialEighths > 0 ? 1 : 0);

  return `${'█'.repeat(fullCells)}${partialCell}${'░'.repeat(emptyCells)}`;
}

export function deactivate() { }
