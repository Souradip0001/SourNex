/**
 * SOURNEX PING & LATENCY ENGINE
 * Handles latency benchmarking, sorting model queues by response time,
 * and updating UI dynamic metadata tags.
 */

export const PingEngine = {
    latencyMap: {},

    async measurePing(modelId) {
        const startTime = performance.now();
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    model: modelId, 
                    currentPrompt: "ping", 
                    fallbackContext: "" 
                })
            });
            const endTime = performance.now();
            const latency = Math.round(endTime - startTime);
            
            if (res.ok) {
                this.latencyMap[modelId] = latency;
                return latency;
            }
        } catch (err) {
            console.warn(`[Ping Engine]: Failed to ping ${modelId}`, err);
        }
        this.latencyMap[modelId] = 9999;
        return 9999;
    },

    getSortedModelQueue(selectedModelId, candidateModelIds) {
        const sortedCandidates = [...candidateModelIds].sort((a, b) => {
            const pingA = this.latencyMap[a] ?? 500;
            const pingB = this.latencyMap[b] ?? 500;
            return pingA - pingB;
        });

        return [
            selectedModelId,
            ...sortedCandidates.filter(id => id !== selectedModelId),
            'openrouter/free'
        ];
    },

    updateCardModelHeader(uniqueId, actualModelId, modelRegistry, pingMs = null) {
        const conf = modelRegistry[actualModelId] || { 
            name: actualModelId.split('/')[1] || actualModelId, 
            short: 'AI' 
        };

        const cardElement = document.getElementById(`${uniqueId}-text`)?.closest('.bg-luxury-surface');
        if (!cardElement) return;

        const titleEl = cardElement.querySelector('.text-luxury-gold');
        if (titleEl) {
            const pingBadge = pingMs ? ` <span class="text-[9px] text-emerald-400 font-mono">(${pingMs}ms)</span>` : '';
            titleEl.innerHTML = `${conf.name}${pingBadge}`;
        }

        const avatarEl = cardElement.parentElement?.querySelector('.h-8.w-8');
        if (avatarEl) {
            avatarEl.textContent = conf.short;
        }

        const metaCard = document.getElementById(`meta-${uniqueId}`);
        if (metaCard) {
            const tagSpan = metaCard.querySelector('div:nth-child(2) span.text-zinc-500');
            if (tagSpan) tagSpan.textContent = actualModelId;
        }
    }
};
