// background/fpt_engine.js - FunPay Tools 3.0
// MV3-safe persistent polling engine with multiple redundancy layers.
//
// ROOT CAUSE THIS FIXES:
// The old code scheduled the autoresponder with chrome.alarms { periodInMinutes: 0.25 }.
// In Manifest V3 the minimum alarm period is 1 minute - Chrome silently rounds 0.25 up to 1,
// on a worker that is killed after ~30s idle. That is why "autoresponder works 1 in 3-4".
//
// RELIABILITY LAYERS (defence in depth - if one fails, others cover it):
//   1. Active loop: a tight self-rescheduling setTimeout running every POLL_INTERVAL_MS while
//      the worker is awake.
//   2. Offscreen keepalive: the offscreen document (NOT subject to the 30s idle kill) pings the
//      worker every 20s, resetting its idle timer so the active loop keeps running.
//   3. Heartbeat alarm: a 1-min chrome.alarms that resurrects the worker + loop if Chrome still
//      tears everything down, and guarantees >=1 poll per minute as a floor.
//   4. Watchdog: detects a stalled loop (no successful cycle for STALL_MS) and force-restarts it.
//   5. Fetch retry/backoff: handled inside the autoresponder cycle.
//   6. Persistent state: tags + dedup sets live in chrome.storage.local, so nothing is lost
//      across worker restarts.
//
// Polling design ported from FP Tools's Runner: fresh RANDOM tag per cycle for
// chat_bookmarks AND orders_counters, per-message dedup.

import { runAutoResponderCycle } from './autoresponder.js';

export const ENGINE_HEARTBEAT_ALARM = 'fpToolsEngineHeartbeat';
const OFFSCREEN_PATH = 'offscreen/offscreen.html';

const POLL_INTERVAL_MS = 3000;        // active-loop cadence while worker is awake
const MIN_CYCLE_GAP_MS = 2500;        // never hammer runner/ faster than this
const ERROR_BACKOFF_MS = 5000;        // FP Tools sleeps 5s after a runner error
const STALL_MS = 90000;               // if no successful cycle in 90s -> force restart

let loopTimer = null;
let watchdogTimer = null;
let running = false;
let lastCycleStart = 0;
let lastCycleOk = 0;

// FP Tools: utils.random_tag() -> 8 hex chars. Fresh tag per cycle keeps FunPay returning data.
export function randomTag() {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

async function anyAutomationEnabled() {
    const { fpToolsAutoReplies = {} } = await chrome.storage.local.get('fpToolsAutoReplies');
    return !!(
        fpToolsAutoReplies.greetingEnabled ||
        fpToolsAutoReplies.keywordsEnabled ||
        fpToolsAutoReplies.autoReviewEnabled ||
        fpToolsAutoReplies.bonusForReviewEnabled ||
        fpToolsAutoReplies.newOrderReplyEnabled ||
        fpToolsAutoReplies.orderConfirmReplyEnabled ||
        fpToolsAutoReplies.autoDeliveryEnabled
    );
}

// Layer 2 enabler: make sure the offscreen document exists so its keepalive interval runs.
async function ensureOffscreen() {
    try {
        const existing = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
        });
        if (!existing.length) {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_PATH,
                reasons: ['DOM_PARSER'],
                justification: 'Background polling, HTML parsing and keepalive for FunPay automation'
            });
        }
    } catch (e) {
        if (!String(e && e.message || '').includes('Only a single offscreen')) {
            console.warn('FP Tools engine: ensureOffscreen', e && e.message || e);
        }
    }
}

// One iteration of the active loop.
async function tick() {
    if (!running) return;
    try {
        if (await anyAutomationEnabled()) {
            const now = Date.now();
            if (now - lastCycleStart >= MIN_CYCLE_GAP_MS) {
                lastCycleStart = now;
                await runAutoResponderCycle();
                lastCycleOk = Date.now();
            }
            scheduleNext(POLL_INTERVAL_MS);
        } else {
            running = false;
            loopTimer = null;
        }
    } catch (e) {
        console.error('FP Tools engine: tick error', e && e.message || e);
        scheduleNext(ERROR_BACKOFF_MS);
    }
}

function scheduleNext(delayMs) {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = setTimeout(tick, delayMs);
}

// Layer 4: watchdog. If the loop claims to be running but no cycle has succeeded for STALL_MS,
// kick it.
function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(async () => {
        if (!running) return;
        if (!(await anyAutomationEnabled())) return;
        if (lastCycleOk && Date.now() - lastCycleOk > STALL_MS) {
            console.warn('FP Tools engine: watchdog detected stall, restarting loop');
            lastCycleStart = 0;
            scheduleNext(0);
        }
    }, 30000);
}

// Start (or confirm) the active loop. Safe to call repeatedly.
export async function startEngine() {
    await ensureHeartbeat();
    await ensureOffscreen();
    startWatchdog();

    if (running) return;
    if (!(await anyAutomationEnabled())) return;

    running = true;
    lastCycleOk = Date.now();
    scheduleNext(0);
    console.log('FP Tools engine: started (loop ' + POLL_INTERVAL_MS + 'ms + offscreen keepalive + heartbeat + watchdog)');
}

export function stopEngine() {
    running = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
    chrome.alarms.clear(ENGINE_HEARTBEAT_ALARM);
    console.log('FP Tools engine: stopped');
}

async function ensureHeartbeat() {
    const existing = await chrome.alarms.get(ENGINE_HEARTBEAT_ALARM);
    if (!existing) {
        await chrome.alarms.create(ENGINE_HEARTBEAT_ALARM, { periodInMinutes: 1 });
    }
}

// Layer 3: called by background.js from chrome.alarms.onAlarm every minute.
export async function onHeartbeat() {
    if (await anyAutomationEnabled()) {
        await ensureOffscreen();
        startWatchdog();
        if (!running) {
            running = true;
            lastCycleOk = Date.now();
            scheduleNext(0);
        }
        try {
            const now = Date.now();
            if (now - lastCycleStart >= MIN_CYCLE_GAP_MS) {
                lastCycleStart = now;
                await runAutoResponderCycle();
                lastCycleOk = Date.now();
            }
        } catch (e) {
            console.error('FP Tools engine: heartbeat cycle error', e && e.message || e);
        }
    } else {
        running = false;
        await chrome.alarms.clear(ENGINE_HEARTBEAT_ALARM);
    }
}

// Layer 2 receiver: offscreen pings land here.
export async function onKeepalivePing() {
    if (!running && (await anyAutomationEnabled())) {
        running = true;
        lastCycleOk = Date.now();
        scheduleNext(0);
    }
}
