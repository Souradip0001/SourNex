/**
 * SourNex Peripheral Features & Enhancements Module
 * Houses optional UI/UX enhancements separately from core chat orchestration (app.js)
 * so core chat loads quickly even on weak connections.
 */
(() => {
    const escapeHtml = (str) => {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // --- 1. ONE-BY-ONE CHAIN OF THOUGHTS LOADER ---
    const THOUGHT_STEPS = [
        'Analyzing your prompt',
        'Reviewing conversation context',
        'Selecting reasoning path',
        'Drafting response'
    ];

    function renderThoughtStepHtml(label, idx, state) {
        const stateClass = state === 'done' ? 'is-done' : 'is-active';
        const marker = state === 'done' ? '&#10003;' : '&#9679;';
        return `<div class="snx-thinking-step ${stateClass}" data-step-index="${idx}"><span class="font-mono text-[11px]">${marker}</span><span>${escapeHtml(label)}</span></div>`;
    }

    function buildThinkingLoaderHtml(uniqueId, headlineText) {
        return `
            <div class="snx-thinking-box" id="${uniqueId}-loader">
                <div class="snx-thinking-header">
                    <span class="snx-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                    <span id="${uniqueId}-loader-label">${escapeHtml(headlineText || 'Thinking...')}</span>
                </div>
                <div class="snx-thinking-steps" id="${uniqueId}-loader-steps">
                    ${renderThoughtStepHtml(THOUGHT_STEPS[0], 0, 'active')}
                </div>
                <div class="snx-shimmer-stack" aria-hidden="true">
                    <div class="snx-shimmer-line w-[88%]"></div>
                    <div class="snx-shimmer-line w-[64%]"></div>
                </div>
            </div>`;
    }

    function startThoughtStepper(uniqueId, chatThread) {
        let currentStep = 0;
        const timer = setInterval(() => {
            if (currentStep >= THOUGHT_STEPS.length - 1) return;
            const stepsContainer = document.getElementById(`${uniqueId}-loader-steps`);
            if (!stepsContainer) return;

            const prevEl = stepsContainer.querySelector(`.snx-thinking-step[data-step-index="${currentStep}"]`);
            if (prevEl) {
                prevEl.classList.remove('is-active');
                prevEl.classList.add('is-done');
                const markerEl = prevEl.querySelector('span');
                if (markerEl) markerEl.innerHTML = '&#10003;';
            }

            currentStep += 1;
            stepsContainer.insertAdjacentHTML(
                'beforeend',
                renderThoughtStepHtml(THOUGHT_STEPS[currentStep], currentStep, 'active')
            );

            if (chatThread && (chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight) < 120) {
                chatThread.scrollTop = chatThread.scrollHeight;
            }
        }, 950);

        return () => clearInterval(timer);
    }

    // --- 2. MESSAGE-ONLY ZOOM (PINCH / CTRL+WHEEL / KEYBOARD) ---
    function initMessageZoom() {
        const chatThread = document.getElementById('chat-thread');
        if (!chatThread) return;

        const zoomIndicator = document.getElementById('snx-zoom-indicator');
        const zoomLabel = document.getElementById('snx-zoom-label');
        const zoomResetBtn = document.getElementById('snx-zoom-reset-btn');

        const MSG_SCALE_KEY = 'snx_msg_scale';
        const MIN_MSG_SCALE = 0.75;
        const MAX_MSG_SCALE = 1.85;
        let currentMsgScale = 1;
        let zoomHideTimer = null;

        function applyMessageScale(nextScale, showHud = true) {
            const clamped = Math.min(MAX_MSG_SCALE, Math.max(MIN_MSG_SCALE, Math.round(nextScale * 100) / 100));
            currentMsgScale = clamped;
            chatThread.style.setProperty('--snx-msg-scale', String(clamped));
            try {
                localStorage.setItem(MSG_SCALE_KEY, String(clamped));
            } catch {
                // Ignore storage errors
            }

            if (showHud && zoomIndicator && zoomLabel) {
                zoomLabel.textContent = `Messages ${Math.round(clamped * 100)}%`;
                zoomIndicator.classList.add('is-visible');
                if (zoomHideTimer) clearTimeout(zoomHideTimer);
                zoomHideTimer = setTimeout(() => {
                    zoomIndicator.classList.remove('is-visible');
                }, 1500);
            }
        }

        try {
            const savedScale = parseFloat(localStorage.getItem(MSG_SCALE_KEY) || '1');
            if (!Number.isNaN(savedScale) && savedScale >= MIN_MSG_SCALE && savedScale <= MAX_MSG_SCALE) {
                applyMessageScale(savedScale, false);
            }
        } catch {
            // Ignore storage errors
        }

        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => applyMessageScale(1, true));
        }

        let pinchStartDist = 0;
        let pinchStartScale = 1;

        const getTouchDistance = (touches) => {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        };

        chatThread.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                pinchStartDist = getTouchDistance(e.touches);
                pinchStartScale = currentMsgScale;
            }
        }, { passive: true });

        chatThread.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && pinchStartDist > 0) {
                e.preventDefault();
                const dist = getTouchDistance(e.touches);
                applyMessageScale(pinchStartScale * (dist / pinchStartDist), true);
            }
        }, { passive: false });

        chatThread.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                pinchStartDist = 0;
            }
        }, { passive: true });

        chatThread.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = -e.deltaY * 0.0035;
                applyMessageScale(currentMsgScale + delta, true);
            }
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                applyMessageScale(currentMsgScale + 0.1, true);
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                applyMessageScale(currentMsgScale - 0.1, true);
            } else if (e.key === '0') {
                e.preventDefault();
                applyMessageScale(1, true);
            }
        });
    }

    // --- 3. AUTO-EXPANDING COMPOSER INPUT ---
    function initAutoResizeInput() {
        const masterInput = document.getElementById('master-input');
        if (!masterInput) return;

        masterInput.addEventListener('input', () => {
            masterInput.style.height = 'auto';
            masterInput.style.height = `${Math.min(masterInput.scrollHeight, 112)}px`;
        });
    }

    window.SourNexFeatures = {
        buildThinkingLoaderHtml,
        startThoughtStepper
    };

    document.addEventListener('DOMContentLoaded', () => {
        initMessageZoom();
        initAutoResizeInput();
    });
})();
