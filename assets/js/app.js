document.addEventListener('DOMContentLoaded', () => {
    const chatThread = document.getElementById('chat-thread');
    const masterInput = document.getElementById('master-input');
    const sendBtn = document.getElementById('send-btn');
    const dynamicModelDock = document.getElementById('dynamic-model-dock');
    const statusGlow = document.getElementById('engine-status-glow');
    const statusText = document.getElementById('engine-status-text');

    let selectedModelId = ''; 
    let lastMessageContext = '';   
    let outputLayerCounter = 1;
    let modelMetadataRegistry = {};
    
    // Track active HTTP network requests to cancel them safely
    let currentAbortController = null; 
    let isGenerating = false;

    async function initializeModelMatrix() {
        try {
            const res = await fetch('/api/chat', { method: 'GET' });
            const data = await res.json();
            
            if (!data.data || data.data.length === 0) throw new Error("Index data empty");

            const freeChatModels = data.data.filter(model => {
                const isFree = model.id.includes(':free') || (model.pricing && parseFloat(model.pricing.prompt) === 0);
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

            dynamicModelDock.innerHTML = ''; 
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
                        if (isGenerating) return; // Prevent model swapping mid-generation
                        document.querySelectorAll('#dynamic-model-dock button:not([disabled])').forEach(b => {
                            b.classList.remove('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                            b.classList.add('border-zinc-800', 'text-zinc-400');
                        });
                        btn.classList.add('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                        btn.classList.remove('border-zinc-800', 'text-zinc-400');
                        selectedModelId = model.id;
                    });

                    dynamicModelDock.appendChild(btn);

                    if (!functionalModelSelected) {
                        btn.click();
                        functionalModelSelected = true;
                    }
                } else {
                    dynamicModelDock.appendChild(btn);
                }
            });

            if (!functionalModelSelected) {
                setupFallbackModel();
                return;
            }

            masterInput.disabled = false;
            masterInput.placeholder = "Type instructions for the next model layer...";
            setButtonStateActive();
            
            statusGlow.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
            statusText.textContent = `${activeOnlineCount} Layers Online`;

        } catch (err) {
            console.error("Matrix compilation failed, falling back to router wrapper:", err);
            setupFallbackModel();
        }
    }
        function setupFallbackModel() {
        selectedModelId = 'openrouter/free';
        modelMetadataRegistry['openrouter/free'] = { name: 'SourNexZ Router', short: 'SNX' };
        
        dynamicModelDock.innerHTML = `
            <button class="px-2.5 py-1 text-[10px] font-mono rounded-md border border-luxury-gold/40 text-luxury-gold bg-luxury-gold/5 focus:outline-none">
                SourNexZ Router
            </button>`;
            
        masterInput.disabled = false;
        masterInput.placeholder = "Type instructions...";
        setButtonStateActive();
        statusGlow.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
        statusText.textContent = "SourNexZ Router Active";
        }
    

    function setupFallbackModel() {
        selectedModelId = 'openrouter/free';
        modelMetadataRegistry['openrouter/free'] = { name: 'Universal Free Router', short: 'RTR' };
        
        dynamicModelDock.innerHTML = `
            <button class="px-2.5 py-1 text-[10px] font-mono rounded-md border border-luxury-gold/40 text-luxury-gold bg-luxury-gold/5 focus:outline-none">
                Universal Free Router (Fail-Safe)
            </button>`;
            
        masterInput.disabled = false;
        masterInput.placeholder = "Type instructions...";
        setButtonStateActive();
        statusGlow.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
        statusText.textContent = "Router Fail-Safe Mode";
    }

    // Toggle Button to Standard Active State
    function setButtonStateActive() {
        isGenerating = false;
        sendBtn.disabled = false;
        sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black hover:bg-amber-400 active:scale-[0.98] transition-all focus:outline-none flex items-center space-x-1.5";
        sendBtn.innerHTML = `<span>Run</span>`;
    }

    // Toggle Button to Stop/Loading State with Tailwind animated spinner
    function setButtonStateLoading() {
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
        const userHtml = `
            <div class="flex items-start space-x-4 justify-end animate-fade-in">
                <div class="bg-luxury-surface border border-luxury-border/60 p-4 rounded-xl max-w-[85%] text-right">
                    <p class="text-xs text-zinc-500 tracking-wider uppercase mb-1">User Prompt</p>
                    <p class="text-sm text-white leading-relaxed">${text}</p>
                </div>
                <div class="h-8 w-8 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0 text-[10px] text-zinc-400 font-bold">YOU</div>
            </div>`;
        chatThread.insertAdjacentHTML('beforeend', userHtml);
        chatThread.scrollTop = chatThread.scrollHeight;
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
        chatThread.insertAdjacentHTML('beforeend', modelHtml);
        chatThread.scrollTop = chatThread.scrollHeight;
        return uniqueId;
    }

    async function fetchLiveAIResponse(modelId, currentPrompt, fallbackContext, abortSignal) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, currentPrompt, fallbackContext }),
                signal: abortSignal // Link the stop controller token straight to the HTTP call
            });
            const data = await response.json();
            return data.text || `Server Error: ${data.error}`;
        } catch (err) {
            if (err.name === 'AbortError') {
                return `Generation terminated by operator. Core context detached.`;
            }
            return `Secure link failed: ${err.message}`;
        }
    }

    async function handleExecute() {
        // Core addition: If currently generating, treat clicking this button as a cancel command
        if (isGenerating) {
            if (currentAbortController) {
                currentAbortController.abort();
            }
            setButtonStateActive();
            return;
        }

        const promptText = masterInput.value.trim();
        if (!promptText || !selectedModelId) return;

        appendUserMessage(promptText);
        masterInput.value = ''; 

        const textTargetId = appendModelSkeleton(selectedModelId, promptText);
        const textTarget = document.getElementById(`${textTargetId}-text`);

        // Spawn a fresh cancellation controller for this pipeline instance
        currentAbortController = new AbortController();
        setButtonStateLoading();

        const liveOutputText = await fetchLiveAIResponse(
            selectedModelId, 
            promptText, 
            lastMessageContext, 
            currentAbortController.signal
        );
        
        textTarget.innerText = liveOutputText;

        // Clean up internal context flags
        lastMessageContext = liveOutputText;
        outputLayerCounter++;
        setButtonStateActive();
        chatThread.scrollTop = chatThread.scrollHeight;
    }

    sendBtn.addEventListener('click', handleExecute);
    masterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleExecute();
        }
    });

    window.toggleMetadata = (id) => {
        const panel = document.getElementById(`meta-${id}`);
        const chevron = document.getElementById(`chev-${id}`);
        panel.classList.toggle('hidden');
        chevron.style.transform = panel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    };

    initializeModelMatrix();
});
