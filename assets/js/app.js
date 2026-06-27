/**
 * SOURNEX ENGINE Core Orchestration Script
 * Infrastructure: Client-Side Multi-AI Layer Mapping
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- UI CORE ELEMENTS ---
    const chatThread = document.getElementById('chat-thread');
    const masterInput = document.getElementById('master-input');
    const sendBtn = document.getElementById('send-btn');
    const dynamicModelDock = document.getElementById('dynamic-model-dock');
    const statusGlow = document.getElementById('engine-status-glow');
    const statusText = document.getElementById('engine-status-text');
    const emptyState = document.getElementById('empty-state');

    // --- SOURNEX AUTHENTICATION UI ELEMENTS ---
    const authOverlay = document.getElementById('auth-overlay');
    const authTitle = document.getElementById('auth-title');
    const authForm = document.getElementById('credentials-form');
    const authToggle = document.getElementById('auth-toggle');
    const toggleMsg = document.getElementById('toggle-msg');
    const btnSubmit = document.getElementById('btn-submit');
    const btnGoogle = document.getElementById('btn-google');
    const btnGithub = document.getElementById('btn-github');
    const authCloseBtn = document.getElementById('auth-close-btn');
    const authGuestBypass = document.getElementById('auth-guest-bypass');

    // --- ACCORDION COMPONENT UI ELEMENTS ---
    const dockExpandTrigger = document.getElementById('dock-expand-trigger');
    const dockCollapsibleWrapper = document.getElementById('dock-collapsible-wrapper');
    const dockChevron = document.getElementById('dock-chevron');
    const dockCounterBadge = document.getElementById('dock-counter-badge');

    // --- GLOBAL TOPBAR ACCOUNT ACTIONS ---
    const globalAccountBtn = document.getElementById('global-account-btn');
    const accountStatusDot = document.getElementById('account-status-dot');
    const accountStatusLabel = document.getElementById('account-status-label');

    // --- STATE ENGINE PARAMETERS ---
    let selectedModelId = ''; 
    let lastMessageContext = '';   
    let outputLayerCounter = 1;
    let modelMetadataRegistry = {};
    
    let currentAbortController = null; 
    let isGenerating = false;
    let isSignUpMode = false;
    let isUserLoggedIn = false; 
    let isDockExpanded = false;

    // --- SOURNEX ACCORDION CONTROL SLIDER ---
    if (dockExpandTrigger && dockCollapsibleWrapper && dockChevron) {
        dockExpandTrigger.addEventListener('click', () => {
            isDockExpanded = !isDockExpanded;
            if (isDockExpanded) {
                dockCollapsibleWrapper.style.maxHeight = "300px"; 
                dockChevron.style.transform = "rotate(180deg)";
            } else {
                dockCollapsibleWrapper.style.maxHeight = "0px"; 
                dockChevron.style.transform = "rotate(0deg)";
            }
        });
    }

    // --- AUTH LAYER OVERLAYS: SHOW & HIDE CLICKS ---
    const displayAuthModal = () => {
        if (authOverlay) authOverlay.classList.remove('opacity-0', 'pointer-events-none');
    };
    
    const dismissAuthModal = () => {
        if (authOverlay) authOverlay.classList.add('opacity-0', 'pointer-events-none');
    };

    if (globalAccountBtn) globalAccountBtn.addEventListener('click', displayAuthModal);
    if (authCloseBtn) authCloseBtn.addEventListener('click', dismissAuthModal);
    if (authGuestBypass) {
        authGuestBypass.addEventListener('click', (e) => {
            e.preventDefault();
            dismissAuthModal();
        });
    }

    // --- GUEST RATE LIMIT & COOLDOWN MANAGEMENT ---
    function checkGuestAccess() {
        if (isUserLoggedIn) return true;

        const currentTimestamp = Date.now();
        const cooldownExpiry = localStorage.getItem('snx_cooldown_expiry');
        let currentCount = parseInt(localStorage.getItem('snx_guest_chat_count') || '0');

        const allocatedPromptsRemaining = Math.max(0, 10 - currentCount);
        if (authGuestBypass) {
            authGuestBypass.textContent = `Continue as Guest (${allocatedPromptsRemaining} Prompts Left)`;
        }

        if (cooldownExpiry && currentTimestamp < parseInt(cooldownExpiry)) {
            const timeLeftMs = parseInt(cooldownExpiry) - currentTimestamp;
            const minutesLeftTotal = Math.ceil(timeLeftMs / (1000 * 60));
            const hoursLeft = Math.floor(minutesLeftTotal / 60);
            const minutesLeft = minutesLeftTotal % 60;
            
            let timeString = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`;
            
            if (masterInput) {
                masterInput.disabled = true;
                masterInput.placeholder = `Guest quota exhausted. Cooling down (${timeString} remaining). Sign up to unlock.`;
            }
            
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-600 focus:outline-none cursor-not-allowed";
                sendBtn.innerHTML = `<span>Locked</span>`;
            }
            return false;
        }

        if (cooldownExpiry && currentTimestamp >= parseInt(cooldownExpiry)) {
            localStorage.removeItem('snx_cooldown_expiry');
            localStorage.setItem('snx_guest_chat_count', '0');
            if (authGuestBypass) authGuestBypass.textContent = "Continue as Guest (10 Prompts Left)";
        }

        return true;
    }

    // --- METADATA DIRECTORY ENGINE ---
    async function initializeModelMatrix() {
        try {
            const res = await fetch('/api/chat', { method: 'GET' });
            const data = await res.json();
            
            if (!data || !data.data || !Array.isArray(data.data) || data.data.length == 0) {
                throw new Error(data.error || "Index data empty or invalid backend format");
            }

            const freeChatModels = data.data.filter(model => {
                const isFree = model.id.includes(':free') || (model.pricing && parseFloat(model.pricing.prompt) == 0);
                const modelIdLower = model.id.toLowerCase();
                const nameLower = (model.name || '').toLowerCase();
                
                const isUtility = modelIdLower.includes('safety') || nameLower.includes('safety') ||
                                  modelIdLower.includes('moderation') || nameLower.includes('moderation') ||
                                  modelIdLower.includes('embed') || modelIdLower.includes('similarity');

                return isFree && !isUtility;
            });

            if (freeChatModels.length == 0) {
                setupFallbackModel();
                return;
            }

            if (dynamicModelDock) dynamicModelDock.innerHTML = ''; 
            let functionalModelSelected = false;
            let activeOnlineCount = 0;

            freeChatModels.forEach((model) => {
                const isDeprecated = model.deprecation != null;
                const isUnstable = model.description && (
                    model.description.toLowerCase().includes('degraded') || 
                    model.description.toLowerCase().includes('unstable') ||
                    model.description.toLowerCase().includes('maintenance')
                );
                
                const isWorkingFine = !isDeprecated && !isUnstable;

                modelMetadataRegistry[model.id] = {
                    name: model.name || model.id.split('/')[1].replace(':free', ''),
                    short: model.id.split('/')[1].substring(0, 3).toUpperCase()
                };

                const btn = document.createElement('button');
                let visualName = model.name.replace('(free)', '').replace(':free', '').trim();

                if (isWorkingFine) {
                    btn.className = "px-2.5 py-1 text-[10px] font-mono rounded-md border border-zinc-800 text-zinc-400 bg-zinc-950/40 hover:text-white hover:border-zinc-700 transition-all duration-150 focus:outline-none cursor-pointer";
                    btn.textContent = visualName;
                    activeOnlineCount++;
                } else {
                    btn.className = "px-2.5 py-1 text-[10px] font-mono rounded-md border border-zinc-900/60 text-zinc-600 bg-zinc-950/10 opacity-30 pointer-events-none line-through";
                    btn.textContent = `${visualName} [DOWN]`;
                    btn.disabled = true;
                }

                btn.setAttribute('data-model-id', model.id);
                
                if (isWorkingFine) {
                    btn.addEventListener('click', () => {
                        if (isGenerating) return; 
                        document.querySelectorAll('#dynamic-model-dock button:not([disabled])').forEach(b => {
                            b.classList.remove('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                            b.classList.add('border-zinc-800', 'text-zinc-400');
                        });
                        btn.classList.add('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                        btn.classList.remove('border-zinc-800', 'text-zinc-400');
                        selectedModelId = model.id;
                    });

                    if (dynamicModelDock) dynamicModelDock.appendChild(btn);

                    if (!functionalModelSelected) {
                        btn.click();
                        functionalModelSelected = true;
                    }
                } else {
                    if (dynamicModelDock) dynamicModelDock.appendChild(btn);
                }
            });

            if (!functionalModelSelected) {
                setupFallbackModel();
                return;
            }

            if (dockCounterBadge) dockCounterBadge.textContent = activeOnlineCount;

            if (checkGuestAccess()) {
                if (masterInput) {
                    masterInput.disabled = false;
                    masterInput.placeholder = "Type instructions for the next model layer...";
                }
                setButtonStateActive();
            }
            
            if (statusGlow) statusGlow.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
            if (statusText) statusText.textContent = `${activeOnlineCount} Layers Online`;

        } catch (err) {
            console.error("Matrix compilation failed, falling back to router wrapper:", err);
            setupFallbackModel();
        }
    }

    function setupFallbackModel() {
        selectedModelId = 'openrouter/free';
        modelMetadataRegistry['openrouter/free'] = { name: 'SourNexZ Router', short: 'SNX' };
        
        if (dynamicModelDock) {
            dynamicModelDock.innerHTML = `
                <button class="px-2.5 py-1 text-[10px] font-mono rounded-md border border-luxury-gold/40 text-luxury-gold bg-luxury-gold/5 focus:outline-none">
                    SourNexZ Router
                </button>`;
        }
            
        if (dockCounterBadge) dockCounterBadge.textContent = "1";

        if (checkGuestAccess()) {
            if (masterInput) {
                masterInput.disabled = false;
                masterInput.placeholder = "Type instructions...";
            }
            setButtonStateActive();
        }
        if (statusGlow) statusGlow.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
        if (statusText) statusText.textContent = "SourNexZ Router Active";
    }

    // --- UI RE-STATE STREAMS ---
    function setButtonStateActive() {
        if (!sendBtn) return;
        isGenerating = false;
        sendBtn.disabled = false;
        sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black hover:bg-amber-400 active:scale-[0.98] transition-all focus:outline-none flex items-center space-x-1.5 cursor-pointer";
        sendBtn.innerHTML = `<span>Run</span>`;
    }

    function setButtonStateLoading() {
        if (!sendBtn) return;
        isGenerating = true;
        sendBtn.className = "absolute right-2 px-3 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all focus:outline-none flex items-center space-x-1.5 cursor-pointer animate-pulse";
        sendBtn.innerHTML = `
            <svg class="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Stop</span>`;
    }

    function appendUserMessage(text) {
        if (emptyState) emptyState.remove();

        const userHtml = `
            <div class="flex items-start space-x-4 justify-end animate-fade-in">
                <div class="bg-luxury-surface border border-luxury-border/60 p-4 rounded-xl max-w-[85%] text-right">
                    <p class="text-xs text-zinc-500 tracking-wider uppercase mb-1">User Prompt</p>
                    <p class="text-sm text-white leading-relaxed">${text}</p>
                </div>
                <div class="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0 text-[10px] text-zinc-400 font-bold">YOU</div>
            </div>`;
        if (chatThread) {
            chatThread.insertAdjacentHTML('beforeend', userHtml);
            chatThread.scrollTop = chatThread.scrollHeight;
        }
    }

    function appendModelSkeleton(modelKey, userPrompt) {
        const conf = modelMetadataRegistry[modelKey] || { name: 'Unknown Target Node', short: 'AI' };
        const uniqueId = `seq-${Date.now()}`;
        const contextPreview = lastMessageContext ? lastMessageContext.substring(0, 60) + '...' : 'None (Initial Entry)';

        const modelHtml = `
            <div class="flex items-start space-x-4 animate-fade-in">
                <div class="h-8 w-8 rounded border border-zinc-800 text-zinc-400 bg-zinc-950 flex items-center justify-center flex-shrink-0 text-[10px] font-bold tracking-tighter">${conf.short}</div>
                <div class="bg-luxury-surface border border-luxury-border p-4 rounded-xl shadow-gold-glow max-w-[85%] w-full">
                    <div class="flex items-center justify-between border-b border-luxury-border/40 pb-2 mb-3">
                        <p class="text-xs text-luxury-gold tracking-wider uppercase font-semibold">${conf.name}</p>
                        <button onclick="toggleMetadata('${uniqueId}')" class="flex items-center space-x-1 text-[10px] text-zinc-500 hover:text-luxury-gold focus:outline-none">
                            <span>Inspect Layer ${outputLayerCounter}</span>
                            <svg id="chev-${uniqueId}" class="w-3 h-3 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </div>
                    <div id="meta-${uniqueId}" class="hidden mb-3 p-2.5 bg-luxury-dark/60 border border-luxury-border/60 rounded-lg text-[11px] font-mono text-zinc-400 space-y-1">
                        <div><span class="text-luxury-gold/70">Instruction:</span> "${userPrompt}"</div>
                        <div><span class="text-luxury-gold/70">Dynamic ID Tag:</span> <span class="text-zinc-500">${modelKey}</span></div>
                        <div><span class="text-luxury-gold/70">Inherited Context:</span> "${contextPreview}"</div>
                    </div>
                    <p class="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap" id="${uniqueId}-text">
                        <span class="italic text-zinc-500 animate-pulse">Routing instruction sequence via secure server...</span>
                    </p>
                </div>
            </div>`;
        if (chatThread) {
            chatThread.insertAdjacentHTML('beforeend', modelHtml);
            chatThread.scrollTop = chatThread.scrollHeight;
        }
        return uniqueId;
    }

    // --- PIPELINE EXECUTION ENGINE ---
    async function fetchLiveAIResponse(modelId, currentPrompt, fallbackContext, abortSignal) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, currentPrompt, fallbackContext }),
                signal: abortSignal 
            });
            const data = await response.json();
            return data.text || `Server Error: ${data.error}`;
        } catch (err) {
            if (err.name == 'AbortError') {
                return `Generation terminated by operator. Core context detached.`;
            }
            return `Secure link failed: ${err.message}`;
        }
    }

    async function handleExecute() {
        if (isGenerating) {
            if (currentAbortController) currentAbortController.abort();
            setButtonStateActive();
            return;
        }

        if (!checkGuestAccess()) return;

        const promptText = masterInput ? masterInput.value.trim() : '';
        if (!promptText || !selectedModelId) return;

        if (!isUserLoggedIn) {
            let currentCount = parseInt(localStorage.getItem('snx_guest_chat_count') || '0');
            currentCount++;
            localStorage.setItem('snx_guest_chat_count', currentCount.toString());

            if (currentCount >= 10) {
                const twoHoursInMs = 2 * 60 * 60 * 1000; 
                const expiryTime = Date.now() + twoHoursInMs;
                localStorage.setItem('snx_cooldown_expiry', expiryTime.toString());
            }
        }

        appendUserMessage(promptText);
        if (masterInput) masterInput.value = ''; 

        const textTargetId = appendModelSkeleton(selectedModelId, promptText);
        const textTarget = document.getElementById(`${textTargetId}-text`);

        currentAbortController = new AbortController();
        setButtonStateLoading();

        const liveOutputText = await fetchLiveAIResponse(
            selectedModelId, 
            promptText, 
            lastMessageContext, 
            currentAbortController.signal
        );
        
        if (textTarget) textTarget.innerText = liveOutputText;

        lastMessageContext = liveOutputText;
        outputLayerCounter++;
        
        if (checkGuestAccess()) {
            setButtonStateActive();
        }
        if (chatThread) chatThread.scrollTop = chatThread.scrollHeight;
    }

    // --- AUTHENTICATION INTERFACE FORM TOGGLE ---
    if (authToggle) {
        authToggle.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            if (isSignUpMode) {
                if (authTitle) authTitle.textContent = "Register New Matrix Profile";
                if (btnSubmit) btnSubmit.textContent = "Initialize Registration";
                if (toggleMsg) toggleMsg.textContent = "Already verified?";
                authToggle.textContent = "Sign In";
            } else {
                if (authTitle) authTitle.textContent = "Account Verification";
                if (btnSubmit) btnSubmit.textContent = "Verify Credentials";
                if (toggleMsg) toggleMsg.textContent = "New node initialization?";
                authToggle.textContent = "Create Account";
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSession
