// Sournex Orchestration Engine - Live Neural Link
document.addEventListener('DOMContentLoaded', () => {
    // UI Connections
    const chatThread = document.getElementById('chat-thread');
    const masterInput = document.getElementById('master-input');
    const sendBtn = document.getElementById('send-btn');
    const modelButtons = document.querySelectorAll('footer button:not(#send-btn)');
    
    // Vault UI Connections
    const vaultToggle = document.getElementById('vault-toggle');
    const vaultDrawer = document.getElementById('vault-drawer');
    const vaultSave = document.getElementById('vault-save');

    // Platform State Configurations
    let selectedModel = 'openai'; 
    let lastMessageContext = '';   
    let outputLayerCounter = 1;

    const modelConfigs = {
        openai: { name: 'OpenAI GPT-4o', short: 'OAI', colorClass: 'border-amber-500/30 text-amber-400 bg-amber-950/10' },
        gemini: { name: 'Gemini 2.5 Flash', short: 'GMN', colorClass: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/10' },
        claude: { name: 'Claude 3.5 Sonnet', short: 'CLD', colorClass: 'border-purple-500/30 text-purple-400 bg-purple-950/10' }
    };

    // Load Existing Keys quietly on load
    ['openai', 'gemini', 'claude'].forEach(provider => {
        const savedKey = localStorage.getItem(`sournex_key_${provider}`);
        if (savedKey) document.getElementById(`key-${provider}`).value = savedKey;
    });

    // Vault Toggle Handler
    vaultToggle.addEventListener('click', () => vaultDrawer.classList.toggle('hidden'));

    // Save Vault Keys Local Storage Setup
    vaultSave.addEventListener('click', () => {
        localStorage.setItem('sournex_key_openai', document.getElementById('key-openai').value.trim());
        localStorage.setItem('sournex_key_gemini', document.getElementById('key-gemini').value.trim());
        localStorage.setItem('sournex_key_claude', document.getElementById('key-claude').value.trim());
        vaultDrawer.classList.add('hidden');
        alert('Sournex Secure Vault Updated.');
    });

    // UI Tab State Switching Logic
    modelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modelButtons.forEach(b => {
                b.classList.remove('bg-luxury-gold', 'text-black', 'font-semibold');
                b.classList.add('text-zinc-400', 'hover:text-white');
            });
            btn.classList.add('bg-luxury-gold', 'text-black', 'font-semibold');
            btn.classList.remove('text-zinc-400', 'hover:text-white');
            selectedModel = btn.textContent.trim().toLowerCase();
        });
    });

    window.toggleMetadata = (id) => {
        const panel = document.getElementById(`meta-${id}`);
        const chevron = document.getElementById(`chev-${id}`);
        panel.classList.toggle('hidden');
        chevron.style.transform = panel.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    };

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
        const conf = modelConfigs[modelKey];
        const uniqueId = `seq-${Date.now()}`;
        const contextPreview = lastMessageContext ? lastMessageContext.substring(0, 60) + '...' : 'None (Initial Entry)';
        
        const modelHtml = `
            <div class="flex items-start space-x-4 animate-fade-in">
                <div class="h-8 w-8 rounded border ${conf.colorClass} flex items-center justify-center flex-shrink-0 text-[10px] font-bold tracking-tighter">${conf.short}</div>
                <div class="bg-luxury-surface border border-luxury-border p-4 rounded-xl shadow-gold-glow max-w-[85%] w-full">
                    <div class="flex items-center justify-between border-b border-luxury-border/40 pb-2 mb-3">
                        <p class="text-xs ${conf.colorClass.split(' ')[1]} tracking-wider uppercase font-semibold">${conf.name}</p>
                        <button onclick="toggleMetadata('${uniqueId}')" class="flex items-center space-x-1 text-[10px] text-zinc-500 hover:text-luxury-gold focus:outline-none">
                            <span>Inspect Layer ${outputLayerCounter}</span>
                            <svg id="chev-${uniqueId}" class="w-3 h-3 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                    </div>
                    <div id="meta-${uniqueId}" class="hidden mb-3 p-2.5 bg-luxury-dark/60 border border-luxury-border/60 rounded-lg text-[11px] font-mono text-zinc-400 space-y-1">
                        <div><span class="text-luxury-gold/70">Instruction:</span> "${userPrompt}"</div>
                        <div><span class="text-luxury-gold/70">Inherited Context:</span> "${contextPreview}"</div>
                    </div>
                    <p class="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap" id="${uniqueId}-text">
                        <span class="italic text-zinc-500 animate-pulse">Connecting to live engine...</span>
                    </p>
                </div>
            </div>`;
        chatThread.insertAdjacentHTML('beforeend', modelHtml);
        chatThread.scrollTop = chatThread.scrollHeight;
        return uniqueId;
    }

    // Network Engine Dispatcher
    async function fetchLiveAIResponse(model, currentPrompt, fallbackContext) {
        const apiKey = localStorage.getItem(`sournex_key_${model}`);
        if (!apiKey) return `Error: Missing API Key for ${model.toUpperCase()}. Click the [Vault] button at the top to add it.`;

        // The Chain Reaction Core Concept: Merge prior output message as raw context baseline input
        let structuralSystemPrompt = "You are an intelligent, elegant AI companion running inside the Sournex luxury workspace platform. You must chat beautifully, cleanly, and naturally like a human dialogue thread. Never output raw json parameters, debug traces, or mechanical templates.";
        if (fallbackContext) {
            structuralSystemPrompt += `\n\nCRITICAL CONTEXT BASELINE FROM PREVIOUS MODEL TURN: \n"""\n${fallbackContext}\n"""\n\nYou must explicitly follow up on, modify, or extend the context provided above based on the user's new request. Do not explain this mechanism; seamlessly blend the context into your response text naturally.`;
        }

        try {
                        if (model === 'gemini') {
                // Try the premier model tier first
                let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                
                let response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `${structuralSystemPrompt}\n\nUser Instruction: ${currentPrompt}` }] }]
                    })
                });
                
                let data = await response.json();
                
                // If Google says "high demand" (503 / overloaded), instantly swap to the Flash-Lite engine!
                if (data.error && (data.error.code === 503 || data.error.message.includes('demand'))) {
                    console.log("Primary model busy. Initiating fallback sequence...");
                    
                    const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
                    const fallbackResponse = await fetch(fallbackUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `${structuralSystemPrompt}\n\nUser Instruction: ${currentPrompt}` }] }]
                        })
                    });
                    data = await fallbackResponse.json();
                }
                
                // Final clean parser step
                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                    return data.candidates[0].content.parts[0].text;
                } else if (data.error) {
                    return `API Error from Google: ${data.error.message}`;
                } else {
                    return `Unexpected response structure from Google. Please try again.`;
                }
            }

            
            else if (model === 'openai') {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: structuralSystemPrompt },
                            { role: 'user', content: currentPrompt }
                        ]
                    })
                });
                const data = await response.json();
                return data.choices[0].message.content;
            }

            else if (model === 'claude') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'dangerously-allow-html-user-override': 'true'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-5-sonnet-20241022',
                        max_tokens: 2048,
                        system: structuralSystemPrompt,
                        messages: [{ role: 'user', content: currentPrompt }]
                    })
                });
                const data = await response.json();
                return data.content[0].text;
            }
        } catch (err) {
            return `Connection failed. Error structural diagnostic details: ${err.message}`;
        }
    }

    async function handleExecute() {
        const promptText = masterInput.value.trim();
        if (!promptText) return;

        appendUserMessage(promptText);
        masterInput.value = ''; 

        const textTargetId = appendModelSkeleton(selectedModel, promptText);
        const textTarget = document.getElementById(`${textTargetId}-text`);

        // Run network execution sequence
        const liveOutputText = await fetchLiveAIResponse(selectedModel, promptText, lastMessageContext);
        
        // Render perfectly clean humanized prose text output
        textTarget.innerText = liveOutputText;
        
        // Bind outputs into contextual chain variables
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
});
                    
