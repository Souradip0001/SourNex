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

    // Registry arrays to track discovered architecture states
    let modelMetadataRegistry = {};

    // Initialize Page Sequence - Load live API listings from public endpoints
    async function initializeModelMatrix() {
        try {
            // Fetch live index data safely from OpenRouter open directory endpoint
            const res = await fetch('https://openrouter.ai/api/v1/models');
            const data = await res.json();
            
            if (!data.data || data.data.length === 0) throw new Error("Index data empty");

            // Filter out premium options to capture ONLY active free tiers
            const freeModels = data.data.filter(m => m.id.includes(':free') || (m.pricing && parseFloat(m.pricing.prompt) === 0));

            if (freeModels.length === 0) {
                dynamicModelDock.innerHTML = `<span class="text-xs text-amber-500 p-2">No direct allocations available. Defaulting to router network.</span>`;
                setupFallbackModel();
                return;
            }

            dynamicModelDock.innerHTML = ''; // Clear temporary loading placeholder text
            
            freeModels.forEach((model, index) => {
                // Register tracking specifications internally
                modelMetadataRegistry[model.id] = {
                    name: model.name || model.id.split('/')[1].replace(':free', ''),
                    short: model.id.split('/')[1].substring(0, 3).toUpperCase()
                };

                // Create individual node button elements dynamically
                const btn = document.createElement('button');
                btn.className = "px-2.5 py-1 text-[10px] font-mono rounded-md border border-zinc-800 text-zinc-400 bg-zinc-950/40 hover:text-white hover:border-zinc-700 transition-all duration-150 focus:outline-none";
                btn.setAttribute('data-model-id', model.id);
                
                // Clean up presentation label names gracefully
                let visualName = model.name.replace('(free)', '').replace(':free', '').trim();
                btn.textContent = visualName;

                // Event listener sequence mapping
                btn.addEventListener('click', () => {
                    document.querySelectorAll('#dynamic-model-dock button').forEach(b => {
                        b.classList.remove('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                        b.classList.add('border-zinc-800', 'text-zinc-400');
                    });
                    btn.classList.add('border-luxury-gold/40', 'text-luxury-gold', 'bg-luxury-gold/5');
                    btn.classList.remove('border-zinc-800', 'text-zinc-400');
                    selectedModelId = model.id;
                });

                dynamicModelDock.appendChild(btn);

                // Auto-select the first discovery array allocation as active element
                if (index === 0) {
                    btn.click();
                }
            });

            // Unlock interface fields once configuration arrays resolve completely
            masterInput.disabled = false;
            masterInput.placeholder = "Type instructions for the next model layer...";
            sendBtn.disabled = false;
            sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black hover:bg-amber-400 active:scale-[0.98] transition-all focus:outline-none";
            sendBtn.textContent = "Run";
            
            statusGlow.className = "h-2 w-2 rounded-full bg-emerald-500 animate-pulse";
            statusText.textContent = `${freeModels.length} Layers Online`;

        } catch (err) {
            console.error("Matrix compilation failed, falling back to router wrapper:", err);
            setupFallbackModel();
        }
    }

    function setupFallbackModel() {
        selectedModelId = 'openrouter/free';
        modelMetadataRegistry['openrouter/free'] = { name: 'Universal Free Router', short: 'RTR' };
        
        dynamicModelDock.innerHTML = `
            <button class="px-2.5 py-1 text-[10px] font-mono rounded-md border border-luxury-gold/40 text-luxury-gold bg-luxury-gold/5 focus:outline-none">
                Universal Free Router (Auto-Fallback)
            </button>`;
            
        masterInput.disabled = false;
        masterInput.placeholder = "Type instructions...";
        sendBtn.disabled = false;
        sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black focus:outline-none";
        sendBtn.textContent = "Run";
        statusGlow.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
        statusText.textContent = "Router Fail-Safe Mode";
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

    async function fetchLiveAIResponse(modelId, currentPrompt, fallbackContext) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, currentPrompt, fallbackContext })
            });
            
            const data = await response.json();
            
            if (data.text) {
                return data.text;
            } else if (data.error) {
                return `Server Error: ${data.error}`;
            } else {
                return `Backend mapping failed to parse response sequence.`;
            }
        } catch (err) {
            return `Secure link failed to clear network layer: ${err.message}`;
        }
    }

    async function handleExecute() {
        const promptText = masterInput.value.trim();
        if (!promptText || !selectedModelId) return;

        appendUserMessage(promptText);
        masterInput.value = ''; 

        const textTargetId = appendModelSkeleton(selectedModelId, promptText);
        const textTarget = document.getElementById(`${textTargetId}-text`);

        const liveOutputText = await fetchLiveAIResponse(selectedModelId, promptText, lastMessageContext);
        textTarget.innerText = liveOutputText;

        lastMessageContext = liveOutputText;
        outputLayerCounter++;
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

    // Initialize Matrix Core Link Configuration Routine on Boot
    initializeModelMatrix();
});
