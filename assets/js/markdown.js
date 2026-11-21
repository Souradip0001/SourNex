/**
 * SourNex XSS-Safe Markdown & Code Block Renderer
 */
(() => {
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url) {
        const trimmed = url.trim();
        if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('/')) {
            return trimmed;
        }
        return '#';
    }

    function formatInline(escapedLine) {
        const inlineCodeSlots = [];
        let out = escapedLine.replace(/`([^`]+)`/g, (_, code) => {
            const idx = inlineCodeSlots.length;
            inlineCodeSlots.push(`<code class="snx-inline-code">${code}</code>`);
            return `\u0000IC${idx}\u0000`;
        });

        out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawUrl) => {
            const safeHref = escapeHtml(sanitizeUrl(rawUrl));
            return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });

        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

        out = out.replace(/\u0000IC(\d+)\u0000/g, (_, idx) => inlineCodeSlots[Number(idx)] || '');
        return out;
    }

    function renderTextBlock(rawText) {
        const lines = escapeHtml(rawText).split('\n');
        const html = [];
        let listType = null;

        const closeList = () => {
            if (listType) {
                html.push(listType === 'ul' ? '</ul>' : '</ol>');
                listType = null;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed) {
                closeList();
                continue;
            }

            if (trimmed.startsWith('### ')) {
                closeList();
                html.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
            } else if (trimmed.startsWith('## ')) {
                closeList();
                html.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
            } else if (trimmed.startsWith('# ')) {
                closeList();
                html.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
            } else if (trimmed.startsWith('&gt; ')) {
                closeList();
                html.push(`<blockquote>${formatInline(trimmed.slice(5))}</blockquote>`);
            } else if (/^[-*]\s+/.test(trimmed)) {
                if (listType !== 'ul') {
                    closeList();
                    listType = 'ul';
                    html.push('<ul>');
                }
                html.push(`<li>${formatInline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
            } else if (/^\d+\.\s+/.test(trimmed)) {
                if (listType !== 'ol') {
                    closeList();
                    listType = 'ol';
                    html.push('<ol>');
                }
                html.push(`<li>${formatInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
            } else {
                closeList();
                html.push(`<p>${formatInline(trimmed)}</p>`);
            }
        }

        closeList();
        return html.join('');
    }

    window.escapeHtml = escapeHtml;

    window.renderSafeMarkdown = function (containerEl, markdownText) {
        if (!containerEl) return;
        const source = String(markdownText || '');
        const parts = source.split(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g);
        const output = [];

        for (let i = 0; i < parts.length; i += 3) {
            const textChunk = parts[i];
            if (textChunk && textChunk.trim()) {
                output.push(renderTextBlock(textChunk));
            }
            if (i + 2 < parts.length) {
                const lang = escapeHtml((parts[i + 1] || 'code').trim() || 'code');
                const codeBody = escapeHtml((parts[i + 2] || '').replace(/\n$/, ''));
                output.push(
                    `<div class="snx-code-block">` +
                        `<div class="snx-code-header">` +
                            `<span>${lang}</span>` +
                            `<button type="button" class="snx-copy-btn">Copy</button>` +
                        `</div>` +
                        `<pre><code>${codeBody}</code></pre>` +
                    `</div>`
                );
            }
        }

        containerEl.className = 'snx-markdown';
        containerEl.innerHTML = output.join('') || `<p>${escapeHtml(source)}</p>`;

        containerEl.querySelectorAll('.snx-copy-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const codeEl = btn.closest('.snx-code-block')?.querySelector('pre code');
                if (!codeEl) return;
                try {
                    await navigator.clipboard.writeText(codeEl.textContent || '');
                    btn.textContent = 'Copied';
                    if (window.showToast) window.showToast('Code copied to clipboard.', 'success', 2000);
                    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                } catch {
                    if (window.showToast) window.showToast('Unable to copy automatically.', 'warning');
                }
            });
        });
    };
})();
