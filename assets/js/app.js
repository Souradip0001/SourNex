/**
 * SOURNEX ENGINE Core Orchestration Script
 * Infrastructure: Client-Side Multi-AI Layer Mapping
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS ---
    const GUEST_LIMIT = 20;
    const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
    const MODEL_REQUEST_TIMEOUT_MS = 12000; // 12s per model attempt
    const MODEL_CACHE_KEY = 'snx_free_models_cache_v1';
    const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    // --- DOM ELEMENT SELECTIONS ---
    const chatThread = document.getElementById('chat-thread');
    const masterInput = document.getElementById('master-input');
    const sendBtn = document.getElementById('send-btn');
    const dynamicModelDock = document.getElementById('dynamic-model-dock');
    const statusGlow = document.getElementById('engine-status-glow');
    const statusText = document.getElementById('engine-status-text');
    const clearThreadBtn = document.getElementById('clear-thread-btn');

    // --- ACCORDION COMPONENT UI ELEMENTS ---
    const dockExpandTrigger = document.getElementById('dock-expand-trigger');
    const dockCollapsibleWrapper = document.getElementById('dock-collapsible-wrapper');
    const dockChevron = document.getElementById('dock-chevron');
    const dockCounterBadge = document.getElementById('dock-counter-badge');

    // --- STATE ENGINE PARAMETERS ---
    let selectedModelId = '';
    let lastMessageContext = '';
    let hasChatHistory = false;
    let isContextCompressed = false;
    let lastRespondedModelId = '';
    let activeCompressionPromise = null;
    let outputLayerCounter = 1;
    let activeOnlineCount = 0;
    let uniqueSeqCounter = 0;
    let modelMetadataRegistry = {};

    let currentAbortController = null;
    let cooldownResetTimer = null;
    let isGenerating = false;
    let isDockExpanded = false;

    const escapeHtml = (str) => {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    function getRequestHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const userKey = (localStorage.getItem('snx_user_provider_key') || '').trim();
        if (userKey.startsWith('sk-') && userKey.length >= 20) {
            headers['X-Provider-Key'] = userKey;
        }
        return headers;
    }

    // --- HELPER: CONTEXT MEMORY COMPRESSION ---
    async function generateCompressedMemory() {
        const sourceHistory = (lastMessageContext || '').trim();
        if (!hasChatHistory || sourceHistory.length < 50) {
            return { context: lastMessageContext, compressed: false };
        }

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    action: 'SUMMARIZE_MEMORY',
                    fullChatHistory: sourceHistory
                }),
                signal: AbortSignal.timeout ? AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS) : undefined
            });

            const data = await response.json();
            if (response.ok && data && typeof data.memoryJson === 'string' && data.memoryJson.trim()) {
                return { context: data.memoryJson, compressed: true };
            }
        } catch (err) {
            console.warn('Memory compression failed, falling back to last context string:', err);
        }
        return { context: lastMessageContext, compressed: false };
    }

    async function ensureCompressedContext(statusMessage) {
        if (!hasChatHistory || isContextCompressed) return;
        if (activeCompressionPromise) {
            await activeCompressionPromise;
            return;
        }

        activeCompressionPromise = (async () => {
            try {
                if (statusText) statusText.textContent = statusMessage || 'Compressing context memory...';
                const result = await generateCompressedMemory();
                if (result.compressed) {
                    lastMessageContext = result.context;
                    isContextCompressed = true;
                }
            } finally {
                activeCompressionPromise = null;
                if (statusText) {
                    statusText.textContent = activeOnlineCount > 0
                        ? `${activeOnlineCount} Layers Online`
                        : 'SourNexZ Router Active';
                }
            }
        })();

        await activeCompressionPromise;
    }

    // --- ACCORDION CONTROL ---
    if (dockExpandTrigger && dockCollapsibleWrapper) {
        dockExpandTrigger.addEventListener('click', () => {
            isDockExpanded = !isDockExpanded;
            dockExpandTrigger.setAttribute('aria-expanded', String(isDockExpanded));
            dockCollapsibleWrapper.style.maxHeight = isDockExpanded ? '300px' : '0px';
            if (dockChevron) {
                dockChevron.style.transform = isDockExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }

    const SYSTEM_WELCOME_HTML = `
        <div id="system-welcome-msg" class="w-full min-w-0 bg-luxury-surface border border-luxury-border rounded-2xl p-4 sm:p-5 space-y-2 shadow-gold-glow">
            <div class="flex items-center justify-between gap-2 border-b border-luxury-border/50 pb-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-luxury-gold">SourNex System</span>
                <span class="text-xs font-mono text-zinc-500">Welcome</span>
            </div>
            <div class="text-base sm:text-[15px] text-zinc-200 leading-relaxed space-y-1.5">
                <p class="font-medium text-white">Hello! Welcome to SourNex Engine.</p>
                <p>This workspace lets you chat across multiple AI models in one place with automatic backup switching whenever a model is busy or unavailable. You can start right away with 20 free guest messages every 2 hours, or connect your own OpenRouter key anytime in Account settings.</p>
            </div>
        </div>`;

    // --- CLEAR THREAD CONTROL ---
    if (clearThreadBtn && chatThread) {
        clearThreadBtn.addEventListener('click', () => {
            if (isGenerating) return;
            lastMessageContext = '';
            hasChatHistory = false;
            isContextCompressed = false;
            lastRespondedModelId = '';
            outputLayerCounter = 1;
            chatThread.innerHTML = SYSTEM_WELCOME_HTML;
            if (window.showToast) window.showToast('Conversation thread cleared.', 'info', 2200);
        });
    }

    // --- GUEST RATE LIMIT (20 TOKENS) & 2-HOUR COOLDOWN MANAGEMENT ---
    function scheduleCooldownReset(delayMs) {
        if (cooldownResetTimer) {
            clearTimeout(cooldownResetTimer);
            cooldownResetTimer = null;
        }
        if (delayMs > 0) {
            cooldownResetTimer = setTimeout(() => {
                checkGuestAccess();
                if (window.showToast) {
                    window.showToast('Guest tokens reset! 20 free layers are now available.', 'success');
                }
            }, delayMs + 250);
        }
    }

    function hasPersonalProviderKey() {
        const userKey = (localStorage.getItem('snx_user_provider_key') || '').trim();
        return userKey.startsWith('sk-') && userKey.length >= 20;
    }

    function checkGuestAccess() {
        if (hasPersonalProviderKey()) {
            if (cooldownResetTimer) {
                clearTimeout(cooldownResetTimer);
                cooldownResetTimer = null;
            }
            if (masterInput) {
                masterInput.disabled = false;
                masterInput.placeholder = 'Personal API Key Active (Direct OpenRouter routing)...';
            }
            if (!isGenerating) setButtonStateActive();
            return true;
        }

        if (window.isUserLoggedIn) {
            if (cooldownResetTimer) {
                clearTimeout(cooldownResetTimer);
                cooldownResetTimer = null;
            }
            if (masterInput) {
                masterInput.disabled = false;
                masterInput.placeholder = 'Inject prompt into matrix stream...';
            }
            if (!isGenerating) setButtonStateActive();
            return true;
        }

        const currentTimestamp = Date.now();
        let cooldownExpiry = localStorage.getItem('snx_cooldown_expiry');
        let currentCount = parseInt(localStorage.getItem('snx_guest_chat_count') || '0', 10);
        if (Number.isNaN(currentCount) || currentCount < 0) currentCount = 0;

        // Reset expired 2-hour cooldown automatically
        if (cooldownExpiry && currentTimestamp >= parseInt(cooldownExpiry, 10)) {
            localStorage.removeItem('snx_cooldown_expiry');
            localStorage.setItem('snx_guest_chat_count', '0');
            cooldownExpiry = null;
            currentCount = 0;
            if (cooldownResetTimer) {
                clearTimeout(cooldownResetTimer);
                cooldownResetTimer = null;
            }
        }

        // Handle legacy/inconsistent state where count >= 20 without an expiry timestamp
        if (!cooldownExpiry && currentCount >= GUEST_LIMIT) {
            const newExpiry = currentTimestamp + COOLDOWN_MS;
            localStorage.setItem('snx_cooldown_expiry', String(newExpiry));
            cooldownExpiry = String(newExpiry);
        }

        // Locked state ONLY when guest tokens are exhausted
        if (cooldownExpiry && currentTimestamp < parseInt(cooldownExpiry, 10)) {
            const timeLeftMs = parseInt(cooldownExpiry, 10) - currentTimestamp;
            const minutesLeftTotal = Math.ceil(timeLeftMs / (1000 * 60));

            if (masterInput) {
                masterInput.disabled = true;
                masterInput.placeholder = `Guest quota exhausted (0 / ${GUEST_LIMIT}). Sign in or wait ${minutesLeftTotal}m to unlock.`;
            }

            if (sendBtn && !isGenerating) {
                sendBtn.disabled = true;
                sendBtn.className = 'absolute right-1.5 sm:right-2 min-h-[40px] px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed';
                sendBtn.innerHTML = '<span>Locked</span>';
            }

            scheduleCooldownReset(timeLeftMs);
            return false;
        }

        const remaining = Math.max(0, GUEST_LIMIT - currentCount);
        if (masterInput) {
            masterInput.disabled = false;
            masterInput.placeholder = `Guest Access Active (${remaining} / ${GUEST_LIMIT} free messages remaining)...`;
        }
        if (!isGenerating) setButtonStateActive();
        return true;
    }

    // Shared access sync entry point for auth.js
    window.syncWorkspaceAccess = () => checkGuestAccess();

    // --- METADATA DIRECTORY ENGINE (WITH SHORT-LIVED CACHE) ---
    function readCachedModels() {
        try {
            const raw = sessionStorage.getItem(MODEL_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.data) || Date.now() - parsed.ts > MODEL_CACHE_TTL_MS) {
                return null;
            }
            return parsed.data;
        } catch {
            return null;
        }
    }

    function writeCachedModels(models) {
        try {
            sessionStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: models }));
        } catch {
            // Ignore storage quota errors
        }
    }

    async function initializeModelMatrix() {
        try {
            let modelList = readCachedModels();

            if (!modelList) {
                const res = await fetch('/api/chat', {
                    method: 'GET',
                    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
                });
                const data = await res.json();

                if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
                    throw new Error(data.error || 'Index data empty or invalid backend format');
                }
                modelList = data.data;
                writeCachedModels(modelList);
            }

            const freeChatModels = modelList.filter(model => {
                if (!model || typeof model.id !== 'string') return false;
                const isFree = model.id.includes(':free') || (model.pricing && parseFloat(model.pricing.prompt) === 0);
                const modelIdLower = model.id.toLowerCase();
                const nameLower = (model.name || '').toLowerCase();

                const isUtility = modelIdLower.includes('safety') || nameLower.includes('safety') ||
                                  modelIdLower.includes('moderation') || nameLower.includes('moderation') ||
                                  modelIdLower.includes('embed') || nameLower.includes('embed') ||
                                  modelIdLower.includes('similarity') || nameLower.includes('similarity');

                return isFree && !isUtility;
            });

            if (freeChatModels.length === 0) {
                setupFallbackModel();
                return;
            }

            if (dynamicModelDock) dynamicModelDock.innerHTML = '';
            let functionalModelSelected = false;
            activeOnlineCount = 0;

            freeChatModels.forEach((model) => {
                const isDeprecated = model.deprecation != null;
                const isUnstable = model.description && (
                    model.description.toLowerCase().includes('degraded') ||
                    model.description.toLowerCase().includes('unstable') ||
                    model.description.toLowerCase().includes('maintenance')
                );

                const isWorkingFine = !isDeprecated && !isUnstable;
                const slugPart = model.id.includes('/') ? model.id.split('/')[1] : model.id;
                const safeName = (model.name || slugPart || model.id).replace('(free)', '').replace(':free', '').trim();
                const shortCode = (slugPart || model.id).replace(':free', '').substring(0, 3).toUpperCase() || 'AI';

                modelMetadataRegistry[model.id] = {
                    name: safeName,
                    short: shortCode
                };

                const btn = document.createElement('button');
                btn.type = 'button';

                if (isWorkingFine) {
                    btn.className = 'px-3 py-1.5 min-h-[36px] text-xs font-mono rounded-lg border border-zinc-800 text-zinc-300 bg-zinc-950/40 hover:text-white hover:border-zinc-700 transition-all duration-150 focus:outline-none cursor-pointer';
                    btn.textContent = safeName;
                    activeOnlineCount++;
                } else {
                    btn.className = 'px-3 py-1.5 min-h-[36px] text-xs font-mono rounded-lg border border-zinc-900/60 text-zinc-600 bg-zinc-950/10 opacity-30 pointer-events-none line-through';
                    btn.textContent = `${safeName} [DOWN]`;
                    btn.disabled = true;
                }

                btn.setAttribute('data-model-id', model.id);

                if (isWorkingFine) {
                    btn.addEventListener('click', async () => {
                        if (isGenerating) return;
                        if (selectedModelId === model.id) return;

                        document.querySelectorAll('#dynamic-model-dock button:not([disabled])').forEach(b => {
                            b.classList.remove('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                            b.classList.add('border-zinc-800', 'text-zinc-400');
                        });
                        btn.classList.add('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                        btn.classList.remove('border-zinc-800', 'text-zinc-400');

                        selectedModelId = model.id;

                        if (hasChatHistory && !isContextCompressed && lastRespondedModelId && model.id !== lastRespondedModelId) {
                            await ensureCompressedContext('Compressing context for new model...');
                        }
                    });

                    if (dynamicModelDock) dynamicModelDock.appendChild(btn);

                    if (!functionalModelSelected) {
                        btn.click();
                        functionalModelSelected = true;
                    }
                } else if (dynamicModelDock) {
                    dynamicModelDock.appendChild(btn);
                }
            });

            if (!functionalModelSelected) {
                setupFallbackModel();
                return;
            }

            if (dockCounterBadge) dockCounterBadge.textContent = String(activeOnlineCount);
            checkGuestAccess();

            if (statusGlow) statusGlow.className = 'h-2 w-2 rounded-full bg-emerald-500 animate-pulse';
            if (statusText) statusText.textContent = `${activeOnlineCount} Layers Online`;
        } catch (err) {
            console.error('Matrix compilation failed, falling back to router wrapper:', err);
            setupFallbackModel();
        }
    }

    function setupFallbackModel() {
        activeOnlineCount = 0;
        selectedModelId = 'openrouter/free';
        modelMetadataRegistry['openrouter/free'] = { name: 'SourNexZ Router', short: 'SNX' };

        if (dynamicModelDock) {
            dynamicModelDock.innerHTML = `
                <button type="button" data-model-id="openrouter/free" class="px-3 py-1.5 min-h-[36px] text-xs font-mono rounded-lg border border-luxury-gold/40 text-luxury-gold bg-luxury-gold/5 focus:outline-none">
                    SourNexZ Router
                </button>`;
        }

        if (dockCounterBadge) dockCounterBadge.textContent = '1';
        checkGuestAccess();

        if (statusGlow) statusGlow.className = 'h-2 w-2 rounded-full bg-amber-500 animate-pulse';
        if (statusText) statusText.textContent = 'SourNexZ Router Active';
    }

    // --- UI RE-STATE STREAMS ---
    function setButtonStateActive() {
        if (!sendBtn) return;
        isGenerating = false;
        sendBtn.disabled = false;
        sendBtn.className = 'absolute right-1.5 sm:right-2 min-h-[40px] px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black hover:bg-amber-400 active:scale-[0.98] transition-all focus:outline-none flex items-center space-x-1.5 cursor-pointer';
        sendBtn.innerHTML = '<span>Run</span>';
    }

    function setButtonStateLoading() {
        if (!sendBtn) return;
        isGenerating = true;
        sendBtn.disabled = false;
        sendBtn.className = 'absolute right-1.5 sm:right-2 min-h-[40px] px-3.5 py-2 text-xs font-bold tracking-wider uppercase rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all focus:outline-none flex items-center space-x-1.5 cursor-pointer animate-pulse';
        sendBtn.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Stop</span>`;
    }

        // XSS-safe user message append
    function appendUserMessage(text) {
        const userHtml = `
            <div class="flex items-start justify-end gap-2.5 sm:gap-3.5 animate-fade-in w-full min-w-0">
                <div class="bg-luxury-surface border border-luxury-border/70 px-3.5 py-3 sm:p-4 rounded-2xl max-w-[88%] sm:max-w-[82%] min-w-0 text-left">
                    <p class="text-[11px] sm:text-xs text-zinc-400 font-medium tracking-wider uppercase mb-1">You</p>
                    <p class="text-base sm:text-[15px] text-white leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(text)}</p>
                </div>
                <div class="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 text-[10px] sm:text-[11px] text-zinc-300 font-bold mt-0.5">YOU</div>
            </div>`;
        if (chatThread) {
            chatThread.insertAdjacentHTML('beforeend', userHtml);
            chatThread.scrollTop = chatThread.scrollHeight;
        }
    }

    // XSS-safe model response skeleton
    function appendModelSkeleton(modelKey, userPrompt) {
        const conf = modelMetadataRegistry[modelKey] || { name: 'Unknown Target Node', short: 'AI' };
        uniqueSeqCounter += 1;
        const uniqueId = `seq-${Date.now()}-${uniqueSeqCounter}`;
        const contextPreview = lastMessageContext ? `${lastMessageContext.substring(0, 60)}...` : 'None (Initial Entry)';

        const modelHtml = `
            <div class="flex items-start gap-2.5 sm:gap-3.5 animate-fade-in w-full min-w-0">
                <div id="${uniqueId}-short" class="h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-zinc-800 text-zinc-300 bg-zinc-950 flex items-center justify-center flex-shrink-0 text-[10px] sm:text-[11px] font-bold tracking-tight mt-0.5">${escapeHtml(conf.short)}</div>
                <div class="bg-luxury-surface border border-luxury-border p-3.5 sm:p-4 rounded-2xl shadow-gold-glow flex-1 min-w-0 max-w-full sm:max-w-[90%]">
                    <div class="flex items-center justify-between gap-2 border-b border-luxury-border/50 pb-2 mb-3 min-w-0">
                        <p id="${uniqueId}-name" class="text-xs sm:text-[13px] text-luxury-gold tracking-wide uppercase font-semibold truncate min-w-0">${escapeHtml(conf.name)}</p>
                        <button type="button" onclick="toggleMetadata('${uniqueId}')" class="flex items-center gap-1 text-[11px] sm:text-xs text-zinc-400 hover:text-luxury-gold focus:outline-none cursor-pointer whitespace-nowrap shrink-0 py-1 px-1.5 rounded">
                            <span>Inspect Layer ${outputLayerCounter}</span>
                            <svg id="chev-${uniqueId}" class="w-3.5 h-3.5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </div>
                    <div id="meta-${uniqueId}" class="hidden mb-3 p-2.5 bg-luxury-dark/60 border border-luxury-border/60 rounded-lg text-xs font-mono text-zinc-400 space-y-1 break-words overflow-hidden">
                        <div><span class="text-luxury-gold/70">Instruction:</span> "${escapeHtml(userPrompt)}"</div>
                        <div><span class="text-luxury-gold/70">Dynamic ID Tag:</span> <span id="${uniqueId}-tag" class="text-zinc-500">${escapeHtml(modelKey)}</span></div>
                        <div><span class="text-luxury-gold/70">Inherited Context:</span> "<span id="${uniqueId}-ctx">${escapeHtml(contextPreview)}</span>"</div>
                    </div>
                    <div class="text-base sm:text-[15px] text-zinc-200 leading-relaxed min-w-0 break-words" id="${uniqueId}-text">
                        <span class="italic text-zinc-400 animate-pulse">Routing instruction sequence via secure server...</span>
                    </div>
                </div>
            </div>`;
        if (chatThread) {
            chatThread.insertAdjacentHTML('beforeend', modelHtml);
            chatThread.scrollTop = chatThread.scrollHeight;
        }
        return uniqueId;
    }

    // --- PIPELINE EXECUTION ENGINE WITH PER-REQUEST TIMEOUT ---
    async function fetchLiveAIResponse(modelId, currentPrompt, fallbackContext, manualSignal) {
        const requestController = new AbortController();
        const onManualAbort = () => requestController.abort('manual');
        if (manualSignal.aborted) {
            return 'Generation terminated by operator. Core context detached.';
        }
        manualSignal.addEventListener('abort', onManualAbort, { once: true });

        const timeoutId = setTimeout(() => {
            requestController.abort('timeout');
        }, MODEL_REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ model: modelId, currentPrompt, fallbackContext }),
                signal: requestController.signal
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                const errorMsg = data.error || data.message || `HTTP ${response.status}`;
                return `[Execution Error]: ${errorMsg}`;
            }

            return data.text || 'No response returned from layer.';
        } catch (err) {
            if (manualSignal.aborted) {
                return 'Generation terminated by operator. Core context detached.';
            }
            if (err.name === 'AbortError' || requestController.signal.reason === 'timeout') {
                return '[Connection Error]: Layer request timed out.';
            }
            return `[Connection Error]: ${err.message}`;
        } finally {
            clearTimeout(timeoutId);
            manualSignal.removeEventListener('abort', onManualAbort);
        }
    }

    // --- AUTO-SWITCHING PIPELINE EXECUTION ENGINE WITH SINGLE COMPRESSION ---
    async function handleExecute() {
        if (isGenerating) {
            if (currentAbortController) currentAbortController.abort();
            setButtonStateActive();
            return;
        }

        if (!checkGuestAccess()) {
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal('Guest token limit (20/20) reached. Sign in to continue, or close to read your chat history until the 2-hour reset.');
            }
            return;
        }

        const promptText = masterInput ? masterInput.value.trim() : '';
        if (!promptText || !selectedModelId) return;

        let justExhaustedGuestTokens = false;
        if (!window.isUserLoggedIn && !hasPersonalProviderKey()) {
            let currentCount = parseInt(localStorage.getItem('snx_guest_chat_count') || '0', 10);
            if (Number.isNaN(currentCount) || currentCount < 0) currentCount = 0;
            currentCount += 1;
            localStorage.setItem('snx_guest_chat_count', String(currentCount));

            if (currentCount >= GUEST_LIMIT) {
                const expiryTime = Date.now() + COOLDOWN_MS;
                localStorage.setItem('snx_cooldown_expiry', String(expiryTime));
                justExhaustedGuestTokens = true;
            }
        }

        appendUserMessage(promptText);
        if (masterInput) masterInput.value = '';

        const textTargetId = appendModelSkeleton(selectedModelId, promptText);
        const textTarget = document.getElementById(`${textTargetId}-text`);

        currentAbortController = new AbortController();
        setButtonStateLoading();

        const activeDockButtons = Array.from(document.querySelectorAll('#dynamic-model-dock button:not([disabled])'));
        const candidateModelIds = activeDockButtons
            .map(btn => btn.getAttribute('data-model-id'))
            .filter(Boolean);

        const modelQueue = [
            selectedModelId,
            ...candidateModelIds.filter(id => id !== selectedModelId),
            'openrouter/free'
        ];

        let successfulResponse = '';
        let usedModelId = selectedModelId;

        if (activeCompressionPromise) {
            await activeCompressionPromise;
            const ctxEl = document.getElementById(`${textTargetId}-ctx`);
            if (ctxEl) {
                ctxEl.textContent = lastMessageContext ? `${lastMessageContext.substring(0, 60)}...` : 'None (Initial Entry)';
            }
        }

        for (let i = 0; i < modelQueue.length; i++) {
            const currentTargetModel = modelQueue[i];
            const conf = modelMetadataRegistry[currentTargetModel] || {
                name: currentTargetModel.split('/')[1] || currentTargetModel,
                short: 'AI'
            };

            const nameEl = document.getElementById(`${textTargetId}-name`);
            const shortEl = document.getElementById(`${textTargetId}-short`);
            const tagEl = document.getElementById(`${textTargetId}-tag`);

            if (nameEl) nameEl.textContent = conf.name;
            if (shortEl) shortEl.textContent = conf.short || 'AI';
            if (tagEl) tagEl.textContent = currentTargetModel;

            const needsModelSwitchCompression =
                hasChatHistory &&
                !isContextCompressed &&
                lastRespondedModelId &&
                currentTargetModel !== lastRespondedModelId;

            if (i > 0 && textTarget) {
                textTarget.innerHTML = needsModelSwitchCompression
                    ? `<span class="italic text-amber-400/80 animate-pulse">Switching to backup layer (${escapeHtml(conf.name)}) &amp; compressing context...</span>`
                    : `<span class="italic text-amber-400/80 animate-pulse">Switching to backup layer (${escapeHtml(conf.name)})...</span>`;
            }

            if (needsModelSwitchCompression) {
                await ensureCompressedContext(`Compressing context for ${conf.name}...`);
                const ctxEl = document.getElementById(`${textTargetId}-ctx`);
                if (ctxEl) {
                    ctxEl.textContent = lastMessageContext ? `${lastMessageContext.substring(0, 60)}...` : 'None (Initial Entry)';
                }
                if (currentAbortController.signal.aborted) break;
            }

            const liveOutputText = await fetchLiveAIResponse(
                currentTargetModel,
                promptText,
                lastMessageContext,
                currentAbortController.signal
            );

            const normalizedText = (liveOutputText || '').trim().toLowerCase();

            const isInvalidOutput =
                !liveOutputText ||
                liveOutputText.startsWith('[Execution Error]') ||
                liveOutputText.startsWith('[Connection Error]') ||
                normalizedText.startsWith('user safety:') ||
                normalizedText.includes('gateway exception') ||
                normalizedText.includes('insufficient credits') ||
                normalizedText.includes('resourceexhausted') ||
                normalizedText.includes('provider returned error') ||
                normalizedText.includes('generation terminated by operator') ||
                normalizedText.includes('secure link failed');

            if (!isInvalidOutput) {
                successfulResponse = liveOutputText;
                usedModelId = currentTargetModel;
                break;
            } else {
                if (currentAbortController.signal.aborted) break;
                console.warn(`[Auto-Switching Engine]: Model "${currentTargetModel}" failed/rejected response. Trying next node...`);
            }
        }

        // Update UI safely and accumulate context
        if (textTarget) {
            if (currentAbortController.signal.aborted) {
                textTarget.textContent = 'Generation terminated by operator. Core context detached.';
            } else if (successfulResponse) {
                if (typeof window.renderSafeMarkdown === 'function') {
                    window.renderSafeMarkdown(textTarget, successfulResponse);
                } else {
                    textTarget.textContent = successfulResponse;
                }

                if (!lastMessageContext) {
                    lastMessageContext = `User: ${promptText}\nAssistant: ${successfulResponse}`;
                } else {
                    lastMessageContext += `\nUser: ${promptText}\nAssistant: ${successfulResponse}`;
                }
                hasChatHistory = true;
                isContextCompressed = false;
                lastRespondedModelId = usedModelId;
            } else {
                textTarget.textContent = 'All available network model layers are temporarily busy or rate-limited. Please try again shortly.';
            }
        }

        outputLayerCounter += 1;
        isGenerating = false;

        const hasAccess = checkGuestAccess();
        if (hasAccess) {
            setButtonStateActive();
        } else if (justExhaustedGuestTokens && typeof window.openAuthModal === 'function') {
            window.openAuthModal('All 20 guest tokens have been used. Sign in to continue, or close this window to keep reading your chat until the 2-hour reset.');
        }

        if (chatThread) chatThread.scrollTop = chatThread.scrollHeight;
    }

    // --- GLOBAL EVENT REGISTRATION ---
    if (sendBtn) sendBtn.addEventListener('click', handleExecute);

    if (masterInput) {
        masterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecute();
            }
        });
    }

    // Initialize directly into guest chat workspace & load dynamic model dock
    checkGuestAccess();
    initializeModelMatrix();
});

// Global metadata inspection utility
window.toggleMetadata = function (id) {
    const metaCard = document.getElementById(`meta-${id}`);
    const chevron = document.getElementById(`chev-${id}`);
    if (metaCard) {
        if (metaCard.classList.contains('hidden')) {
            metaCard.classList.remove('hidden');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
            metaCard.classList.add('hidden');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }
};
