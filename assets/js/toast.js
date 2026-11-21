/**
 * SourNex Non-Blocking Toast & Confirmation System
 */
(() => {
    function getContainer() {
        let container = document.getElementById('snx-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'snx-toast-container';
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }
        return container;
    }

    function dismissToast(el) {
        if (!el || !el.parentElement) return;
        el.classList.remove('is-visible');
        setTimeout(() => {
            if (el.parentElement) el.remove();
        }, 180);
    }

    window.showToast = function (message, type = 'info', duration = 4500) {
        const container = getContainer();
        const toast = document.createElement('div');
        toast.className = `snx-toast snx-toast--${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-3';

        const text = document.createElement('p');
        text.className = 'text-xs text-zinc-200 leading-relaxed';
        text.textContent = String(message || '');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'text-zinc-500 hover:text-white text-xs font-mono px-1 cursor-pointer';
        closeBtn.setAttribute('aria-label', 'Dismiss notification');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => dismissToast(toast));

        row.appendChild(text);
        row.appendChild(closeBtn);
        toast.appendChild(row);
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('is-visible'));

        if (duration > 0) {
            setTimeout(() => dismissToast(toast), duration);
        }
        return toast;
    };

    window.showConfirmToast = function (message, confirmLabel = 'Confirm', cancelLabel = 'Cancel') {
        return new Promise((resolve) => {
            const container = getContainer();
            const toast = document.createElement('div');
            toast.className = 'snx-toast snx-toast--warning';
            toast.setAttribute('role', 'dialog');

            const text = document.createElement('p');
            text.className = 'text-xs text-zinc-200 leading-relaxed';
            text.textContent = String(message || '');

            const actions = document.createElement('div');
            actions.className = 'flex items-center justify-end gap-2 pt-1';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'px-2.5 py-1 text-[11px] font-mono rounded-md border border-zinc-700 text-zinc-300 hover:text-white cursor-pointer';
            cancelBtn.textContent = cancelLabel;

            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'px-2.5 py-1 text-[11px] font-mono font-bold rounded-md bg-luxury-gold text-black hover:bg-amber-400 cursor-pointer';
            confirmBtn.textContent = confirmLabel;

            let settled = false;
            const settle = (value) => {
                if (settled) return;
                settled = true;
                dismissToast(toast);
                resolve(value);
            };

            cancelBtn.addEventListener('click', () => settle(false));
            confirmBtn.addEventListener('click', () => settle(true));

            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
            toast.appendChild(text);
            toast.appendChild(actions);
            container.appendChild(toast);

            requestAnimationFrame(() => toast.classList.add('is-visible'));
        });
    };
})();
