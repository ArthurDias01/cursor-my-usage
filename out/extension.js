"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const vscode = __importStar(require("vscode"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const REFRESH_INTERVAL_MS = 180000;
const CURSOR_USAGE_PINK = '#f778c6';
const CURSOR_SETTINGS_COMMAND = 'aiSettings.action.open';
const CURSOR_PLAN_USAGE_TAB = 'plan-usage';
let statusBarItem;
let usageBarItem;
let outputChannel;
function activate(context) {
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
        context.subscriptions.push(vscode.commands.registerCommand('cursorMyUsage.refresh', () => {
            outputChannel.appendLine('Refresh command triggered');
            updateUsage(true);
        }), vscode.commands.registerCommand('cursorMyUsage.openPlanUsage', async () => {
            outputChannel.appendLine('Opening Cursor Plan & Usage settings');
            await vscode.commands.executeCommand(CURSOR_SETTINGS_COMMAND, CURSOR_PLAN_USAGE_TAB);
        }));
        updateUsage(true);
        // Auto refresh
        const interval = setInterval(() => updateUsage(false), REFRESH_INTERVAL_MS);
        context.subscriptions.push({ dispose: () => clearInterval(interval) });
    }
    catch (err) {
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
        }
        else {
            usageBarItem.hide();
            statusBarItem.text = `$(error) Cursor: API Error`;
            statusBarItem.show();
        }
    }
    catch (err) {
        outputChannel.appendLine('ERROR in updateUsage: ' + err.message);
        console.error(err);
        usageBarItem.hide();
        statusBarItem.text = `$(error) Cursor: Error`;
        statusBarItem.show();
    }
}
async function getAccessToken() {
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
    }
    catch (e) {
        outputChannel.appendLine('sqlite3 failed: ' + e.message);
    }
    return null;
}
async function fetchUsage(token) {
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
        const data = await res.json();
        const plan = data.planUsage || data.usage || {};
        return {
            totalPercent: toPercent(plan.totalPercentUsed ?? plan.percentUsed ?? plan.totalPercent),
            autoPercent: toPercent(plan.autoPercentUsed ?? plan.autoComposerPercent ?? plan.autoPercent),
            apiPercent: toPercent(plan.apiPercentUsed ?? plan.apiPercent),
            displayMessage: data.displayMessage
        };
    }
    catch (e) {
        outputChannel.appendLine('Fetch error: ' + e.message);
        return null;
    }
}
function toPercent(value) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}
function formatPercent(value) {
    return `${Math.round(value)}%`;
}
function renderUsageBar(percent) {
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
function deactivate() { }
//# sourceMappingURL=extension.js.map