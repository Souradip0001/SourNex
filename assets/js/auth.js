// 1. AUTH0 CONFIGURATION
const AUTH0_DOMAIN = 'dev-rlzsvnlicolgxd1n.us.auth0.com';
const AUTH0_CLIENT_ID = 'duUzQWvusIuFMVO6ESniNH8hzuQtHNpF';

window.currentUser = null;
window.isUserLoggedIn = false;

let auth0ClientInstance = null;

window.getAuthAccessToken = async function () {
    if (!auth0ClientInstance) return null;
    try {
        return await auth0ClientInstance.getTokenSilently();
    } catch {
        return null;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('auth-overlay');
    const authCloseBtn = document.getElementById('auth-close-btn');
    const authForm = document.getElementById('credentials-form');
    const authTitle = document.getElementById('auth-title');
    const authToggleBtn = document.getElementById('auth-toggle');
    const toggleMsg = document.getElementById('toggle-msg');
    const submitBtn = document.getElementById('btn-submit');
    const guestBypassBtn = document.getElementById('auth-guest-bypass');
    const authLimitNotice = document.getElementById('auth-limit-notice');
    const authLimitNoticeText = document.getElementById('auth-limit-notice-text');

    const termsContainer = document.getElementById('terms-container');
    const captchaContainer = document.getElementById('captcha-container');
    const turnstileSlot = document.getElementById('turnstile-slot');

    // Header UI elements
    const accountStatusLabel = document.getElementById('account-status-label');
    const accountStatusDot = document.getElementById('account-status-dot');
    const headerUsername = document.getElementById('header-username');
    const globalAccountBtn = document.getElementById('global-account-btn');

    let isSignUpMode = false;
    let hasPendingUnverifiedSession = false;

    let turnstileConfig = { enabled: false, siteKey: null };
    let turnstileWidgetId = null;

    function notify(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        }
    }

    // Load dynamic Turnstile configuration
    fetch('/api/verify-turnstile')
        .then(r => (r.ok ? r.json() : null))
        .then(cfg => {
            if (cfg && cfg.enabled && cfg.siteKey) {
                turnstileConfig = cfg;
            }
        })
        .catch(() => {});

    function ensureTurnstileRendered() {
        if (!turnstileConfig.enabled || !turnstileConfig.siteKey || !turnstileSlot) {
            captchaContainer?.classList.add('hidden');
            return;
        }
        captchaContainer?.classList.remove('hidden');
        if (window.turnstile && turnstileWidgetId === null) {
            turnstileWidgetId = window.turnstile.render(turnstileSlot, {
                sitekey: turnstileConfig.siteKey,
                theme: 'dark'
            });
        }
    }

    // Modal open/close controls
    window.openAuthModal = function (reasonMessage = '') {
        if (!authOverlay) return;
        const keyInput = document.getElementById('user-provider-key');
        if (keyInput) {
            keyInput.value = localStorage.getItem('snx_user_provider_key') || '';
        }
        if (authLimitNotice && authLimitNoticeText) {
            if (reasonMessage) {
                authLimitNoticeText.textContent = reasonMessage;
                authLimitNotice.classList.remove('hidden');
            } else {
                authLimitNotice.classList.add('hidden');
            }
        }
        authOverlay.classList.remove('hidden');
        authOverlay.setAttribute('aria-hidden', 'false');
    };

    window.closeAuthModal = function () {
        if (!authOverlay) return;
        authOverlay.classList.add('hidden');
        authOverlay.setAttribute('aria-hidden', 'true');
        authLimitNotice?.classList.add('hidden');
        if (typeof window.syncWorkspaceAccess === 'function') {
            window.syncWorkspaceAccess();
        }
    };

    // Optional OpenRouter API key controls
    const saveProviderKeyBtn = document.getElementById('save-provider-key-btn');
    const clearProviderKeyBtn = document.getElementById('clear-provider-key-btn');

    saveProviderKeyBtn?.addEventListener('click', () => {
        const keyInput = document.getElementById('user-provider-key');
        const val = keyInput?.value.trim() || '';
        if (!val.startsWith('sk-') || val.length < 20) {
            notify('Enter a valid provider key starting with "sk-" or click Clear to use default server access.', 'warning');
            return;
        }
        localStorage.setItem('snx_user_provider_key', val);
        notify('Personal API key saved locally. Requests will now use your own key.', 'success');
        if (typeof window.syncWorkspaceAccess === 'function') {
            window.syncWorkspaceAccess();
        }
    });

    clearProviderKeyBtn?.addEventListener('click', () => {
        const keyInput = document.getElementById('user-provider-key');
        if (keyInput) keyInput.value = '';
        localStorage.removeItem('snx_user_provider_key');
        notify('Personal API key cleared. Using SourNex server access.', 'info');
        if (typeof window.syncWorkspaceAccess === 'function') {
            window.syncWorkspaceAccess();
        }
    });

    // Toggle between Sign In & Create Account mode
    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;

            if (isSignUpMode) {
                if (authTitle) authTitle.textContent = 'Create Account';
                if (submitBtn) submitBtn.textContent = 'Create Account with Email';
                if (toggleMsg) toggleMsg.textContent = 'Already have an account?';
                authToggleBtn.textContent = 'Sign In';
                termsContainer?.classList.remove('hidden');
                ensureTurnstileRendered();
            } else {
                if (authTitle) authTitle.textContent = 'Account Access';
                if (submitBtn) submitBtn.textContent = 'Sign In with Email';
                if (toggleMsg) toggleMsg.textContent = 'New to SourNex?';
                authToggleBtn.textContent = 'Create Account';
                termsContainer?.classList.add('hidden');
                captchaContainer?.classList.add('hidden');
            }
        });
    }

    async function ensureAuth0Ready() {
        if (auth0ClientInstance) return auth0ClientInstance;
        if (!window.auth0 || typeof window.auth0.createAuth0Client !== 'function') {
            throw new Error('Authentication SDK failed to load. Please refresh the page.');
        }
        auth0ClientInstance = await window.auth0.createAuth0Client({
            domain: AUTH0_DOMAIN,
            clientId: AUTH0_CLIENT_ID,
            cacheLocation: 'localstorage',
            useRefreshTokens: true,
            authorizationParams: {
                redirect_uri: window.location.origin
            }
        });
        return auth0ClientInstance;
    }

    async function verifyOptionalSignupChecks() {
        if (!isSignUpMode) return true;

        const termsChecked = document.getElementById('terms-checkbox')?.checked;
        if (!termsChecked) {
            notify('Please accept the Terms of Service and Privacy Policy.', 'warning');
            return false;
        }

        if (turnstileConfig.enabled) {
            const token = window.turnstile && turnstileWidgetId !== null
                ? window.turnstile.getResponse(turnstileWidgetId)
                : '';
            if (!token) {
                notify('Please complete the security CAPTCHA check.', 'warning');
                return false;
            }
            const verifyRes = await fetch('/api/verify-turnstile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
                if (window.turnstile && turnstileWidgetId !== null) {
                    window.turnstile.reset(turnstileWidgetId);
                }
                throw new Error(verifyData.error || 'CAPTCHA verification failed.');
            }
        }

        return true;
    }

    // Email / Password Universal Login launcher
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (submitBtn) submitBtn.disabled = true;

            try {
                const passed = await verifyOptionalSignupChecks();
                if (!passed) return;

                const client = await ensureAuth0Ready();
                const authParams = {
                    redirect_uri: window.location.origin
                };
                if (isSignUpMode) {
                    authParams.screen_hint = 'signup';
                } else if (hasPendingUnverifiedSession) {
                    // Force fresh login check after user clicks verification email link
                    authParams.prompt = 'login';
                }

                await client.loginWithRedirect({ authorizationParams: authParams });
            } catch (err) {
                notify(`Authentication Error: ${err.message}`, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Social Login (Google & GitHub)
    document.getElementById('btn-google')?.addEventListener('click', async () => {
        try {
            const client = await ensureAuth0Ready();
            await client.loginWithRedirect({
                authorizationParams: {
                    connection: 'google-oauth2',
                    redirect_uri: window.location.origin
                }
            });
        } catch (err) {
            notify(`Google Sign-In Error: ${err.message}`, 'error');
        }
    });

    document.getElementById('btn-github')?.addEventListener('click', async () => {
        try {
            const client = await ensureAuth0Ready();
            await client.loginWithRedirect({
                authorizationParams: {
                    connection: 'github',
                    redirect_uri: window.location.origin
                }
            });
        } catch (err) {
            notify(`GitHub Sign-In Error: ${err.message}`, 'error');
        }
    });

    // Modal dismiss handlers
    guestBypassBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        window.closeAuthModal();
    });

    authCloseBtn?.addEventListener('click', () => {
        window.closeAuthModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && authOverlay && !authOverlay.classList.contains('hidden')) {
            window.closeAuthModal();
        }
    });

    // Global topbar account action
    globalAccountBtn?.addEventListener('click', async () => {
        if (window.isUserLoggedIn || hasPendingUnverifiedSession) {
            const promptLabel = hasPendingUnverifiedSession
                ? 'Sign out of this unverified session?'
                : 'Sign out of your SourNex account?';
            const confirmed = window.showConfirmToast
                ? await window.showConfirmToast(promptLabel, 'Sign Out', 'Stay')
                : false;
            if (confirmed) {
                try {
                    const client = await ensureAuth0Ready();
                    await client.logout({
                        logoutParams: { returnTo: window.location.origin }
                    });
                } catch (err) {
                    notify(`Sign out failed: ${err.message}`, 'error');
                }
            }
        } else {
            window.openAuthModal();
        }
    });

    function updateHeaderIdentity(statusLabel, username, isLoggedIn) {
        if (accountStatusLabel) accountStatusLabel.textContent = statusLabel;
        if (accountStatusDot) {
            accountStatusDot.className = isLoggedIn
                ? 'h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] shrink-0'
                : 'h-2 w-2 rounded-full bg-zinc-500 shrink-0';
        }
        if (username && headerUsername) {
            headerUsername.textContent = `@${username}`;
            headerUsername.classList.remove('hidden');
        } else if (headerUsername) {
            headerUsername.classList.add('hidden');
        }
    }

    function applyUserSession(user, justAuthenticated = false) {
        if (user) {
            const isEmailVerified = user.email_verified !== false;
            if (!isEmailVerified) {
                hasPendingUnverifiedSession = true;
                window.currentUser = null;
                window.isUserLoggedIn = false;
                updateHeaderIdentity('Verify Email', null, false);
                if (typeof window.syncWorkspaceAccess === 'function') {
                    window.syncWorkspaceAccess();
                }
                const targetEmail = user.email ? ` (${user.email})` : '';
                window.openAuthModal(`Verification link sent to your email${targetEmail}. Please open your inbox and verify your email, then click "Sign In with Email" again.`);
                return;
            }

            hasPendingUnverifiedSession = false;
            window.currentUser = user;
            window.isUserLoggedIn = true;

            const rawHandle = user.nickname || user.preferred_username || user.name || (user.email ? user.email.split('@')[0] : 'operator');
            const cleanHandle = String(rawHandle).replace(/\s+/g, '').slice(0, 24);
            updateHeaderIdentity('Authenticated', cleanHandle, true);

            if (justAuthenticated) {
                notify('Authenticated successfully.', 'success');
            }
            window.closeAuthModal();
        } else {
            hasPendingUnverifiedSession = false;
            window.currentUser = null;
            window.isUserLoggedIn = false;
            updateHeaderIdentity('Guest Profile', null, false);
            if (typeof window.syncWorkspaceAccess === 'function') {
                window.syncWorkspaceAccess();
            }
        }
    }

    async function initAuth0Session() {
        try {
            const client = await ensureAuth0Ready();
            const params = new URLSearchParams(window.location.search);
            let justAuthenticated = false;

            if (params.has('error')) {
                const errMsg = params.get('error_description') || params.get('error') || 'Authentication canceled.';
                window.history.replaceState({}, document.title, window.location.pathname);
                notify(`Auth Notice: ${errMsg}`, 'warning');
            } else if (params.has('code') && params.has('state')) {
                await client.handleRedirectCallback();
                window.history.replaceState({}, document.title, window.location.pathname);
                justAuthenticated = true;
            }

            const isAuthenticated = await client.isAuthenticated();
            if (isAuthenticated) {
                const user = await client.getUser();
                applyUserSession(user || null, justAuthenticated);
            } else {
                applyUserSession(null, false);
            }
        } catch (err) {
            console.warn('Auth0 initialization fallback to Guest mode:', err);
            applyUserSession(null, false);
        }
    }

    initAuth0Session();
});
