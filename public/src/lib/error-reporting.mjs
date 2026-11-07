// Installs on import (console.error wrapper, global error handlers, bug-report
// widget), so this must be the first module the entry point imports.
/* ------------------------------------------------------------------ *
 * Error logging & bug reports.
 *
 * There's no backend/database for this static site, so error reports are
 * POSTed to the /log-error function, which just writes them to Netlify's
 * function logs — that's the only "delivery" needed. Errors are also kept
 * in a capped localStorage ring buffer so a user-submitted report can
 * include what happened earlier in the session, not just the error at
 * report time. console.error is wrapped (instead of editing every call
 * site) so every existing and future console.error call is captured for
 * free, on top of truly uncaught exceptions and unhandled rejections.
 * ------------------------------------------------------------------ */
const ERROR_LOG_KEY = 'stockZ_errorLog';
const ERROR_LOG_MAX_ENTRIES = 25;

function getStorageValue(key, fallback = null) {
    try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        return fallback;
    }
}

function setStorageValue(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

function readErrorLog() {
    try {
        const parsed = JSON.parse(getStorageValue(ERROR_LOG_KEY, '[]'));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

export function recordError(level, message, extra = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: String(message).slice(0, 2000),
        page: location.pathname,
        ...extra,
    };

    const log = readErrorLog();
    log.push(entry);
    while (log.length > ERROR_LOG_MAX_ENTRIES) log.shift();
    setStorageValue(ERROR_LOG_KEY, JSON.stringify(log));

    sendErrorReport(entry);
}

function sendErrorReport(entry) {
    try {
        const payload = JSON.stringify({ ...entry, userAgent: navigator.userAgent });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/log-error', new Blob([payload], { type: 'application/json' }));
        } else {
            fetch('/log-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
        }
    } catch (error) {
        // Reporting must never itself throw or block the app.
    }
}

const nativeConsoleError = console.error.bind(console);
console.error = function (...args) {
    nativeConsoleError(...args);
    try {
        const message = args.map((arg) => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'string') return arg;
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' ');
        recordError('console.error', message);
    } catch (error) {
        // Never let logging itself break the app.
    }
};

window.addEventListener('error', function (event) {
    recordError('uncaught-exception', event.message, {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error && event.error.stack ? String(event.error.stack).slice(0, 4000) : undefined,
    });
});

window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    recordError('unhandled-rejection', reason instanceof Error ? reason.message : String(reason), {
        stack: reason instanceof Error && reason.stack ? String(reason.stack).slice(0, 4000) : undefined,
    });
});

// User-facing "Report a Problem" modal, wired up to the nav-bug-report
// button(s) that sit next to the logout button in the navbar. That markup
// only exists on pages a logged-in user reaches (main/tickerInfo/watchlist),
// so the whole feature is naturally absent from the login page instead of
// needing an auth-state check here.
function initBugReportWidget() {
    const triggers = document.querySelectorAll('.nav-bug-report');
    if (triggers.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'hidden modal-overlay';
    overlay.innerHTML = `
        <div class="modal-panel">
            <div class="flex justify-between items-center">
                <h2 class="modal-title">Report a Problem</h2>
                <button type="button" data-bug-report-close class="chip chip-icon flex-shrink-0 text-body" aria-label="Close">&times;</button>
            </div>
            <p class="modal-text">Tell me what happened — recent technical details from your session will be included automatically so I can look into it.</p>
            <textarea data-bug-report-description rows="4" maxlength="1000" placeholder="What were you doing when something went wrong? (optional)" class="field resize-none"></textarea>
            <div data-bug-report-status class="text-small hidden"></div>
            <div class="flex justify-end gap-2">
                <button type="button" data-bug-report-cancel class="chip">Cancel</button>
                <button type="button" data-bug-report-send class="btn">Send Report</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const descriptionEl = overlay.querySelector('[data-bug-report-description]');
    const statusEl = overlay.querySelector('[data-bug-report-status]');
    const sendBtn = overlay.querySelector('[data-bug-report-send]');

    const closeModal = () => {
        overlay.classList.add('hidden');
        descriptionEl.value = '';
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
    };

    triggers.forEach((trigger) => trigger.addEventListener('click', () => overlay.classList.remove('hidden')));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
    overlay.querySelector('[data-bug-report-close]').addEventListener('click', closeModal);
    overlay.querySelector('[data-bug-report-cancel]').addEventListener('click', closeModal);

    sendBtn.addEventListener('click', async () => {
        const description = descriptionEl.value.trim();
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending…';

        try {
            const response = await fetch('/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level: 'user-report',
                    message: description || '(no description provided)',
                    description,
                    page: location.pathname,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    recentErrors: readErrorLog().slice(-10),
                }),
            });
            if (!response.ok) throw new Error(`Report failed with status ${response.status}`);
            statusEl.textContent = 'Thanks — your report was sent.';
            statusEl.className = 'text-small text-lime';
            setTimeout(closeModal, 1500);
        } catch (error) {
            statusEl.textContent = "Couldn't send automatically — please email gamehunter5879@gmail.com directly.";
            statusEl.className = 'text-small text-ember';
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Report';
            statusEl.classList.remove('hidden');
        }
    });
}
initBugReportWidget();
