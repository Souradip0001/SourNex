// 1. SUPABASE INITIALIZATION
const SUPABASE_URL = 'https://qyznllcvbgeygusscpjs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NeNNwjPtDVVjSj5GgabI2Q_7JNnUslS';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentUser = null;
window.isUserLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('auth-overlay');
    const authCloseBtn = document.getElementById('auth-close-btn');
    const authForm = document.getElementById('credentials-form');
    const authTitle = document.getElementById('auth-title');
    const authToggleBtn = document.getElementById('auth-toggle');
    const toggleMsg = document.getElementById('toggle-msg');
    const submitBtn = document.getElementById('btn-submit');
    const guestBypassBtn = document.getElementById('auth-guest-bypass');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const authLimitNotice = document.getElementById('auth-limit-notice');
    const authLimitNoticeText = document.getElementById('auth-limit-notice-text');

    // Input containers
    const usernameContainer = document.getElementById('username-container');
    const dobContainer = document.getElementById('dob-container');
    const confirmPasswordContainer = document.getElementById('confirm-password-container');
    const apiKeyContainer = document.getElementById('api-key-container');
    const termsContainer = document.getElementById('terms-container');
    const captchaContainer = document.getElementById('captcha-container');
    const turnstileSlot = document.getElementById('turnstile-slot');
    const otpStepContainer = document.getElementById('otp-step-container');

    // Header UI elements
    const accountStatusLabel = document.getElementById('account-status-label');
    const accountStatusDot = document.getElementById('account-status-dot');
    const headerUsername = document.getElementById('header-username');
    const globalAccountBtn = document.getElementById('global-account-btn');

    let isSignUpMode = false;
    let awaitingOtp = false;
    let pendingEmail = '';
    let isRecoveryMode = false;

    let turnstileConfig = { enabled: false, siteKey: null };
    let turnstileWidgetId = null;

    function notify(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        }
    }

    // Load dynamic Turnstile configuration (avoids dummy hardcoded keys)
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

    // Single-owner modal open/close controls
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

    window.closeAuthModal = function () {
        if (!authOverlay) return;
        authOverlay.classList.add('hidden');
        authOverlay.setAttribute('aria-hidden', 'true');
        authLimitNotice?.classList.add('hidden');
        // Re-evaluate guest access: keeps chat unlocked if tokens remain,
        // or keeps only sending locked while prior messages stay readable if exhausted.
        if (typeof window.syncWorkspaceAccess === 'function') {
            window.syncWorkspaceAccess();
        }
    };

    // Password visibility toggle logic
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', () => {
            const input = button.parentElement?.querySelector('input');
            if (input) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                button.setAttribute('aria-pressed', String(isPassword));
                button.classList.toggle('text-luxury-gold', isPassword);
                button.classList.toggle('text-zinc-500', !isPassword);
            }
        });
    });

    function clearSensitiveFields() {
        const pwd = document.getElementById('password');
        const confirmPwd = document.getElementById('confirm-password');
        const otp = document.getElementById('otp-code');
        if (pwd) pwd.value = '';
        if (confirmPwd) confirmPwd.value = '';
        if (otp) otp.value = '';
    }

    // Toggle between Sign In & Sign Up mode
    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            isRecoveryMode = false;
            awaitingOtp = false;
            otpStepContainer?.classList.add('hidden');
            clearSensitiveFields();

            if (isSignUpMode) {
                authTitle.textContent = 'Register New Operator';
                submitBtn.textContent = 'Send OTP Code';
                toggleMsg.textContent = 'Already have an account?';
                authToggleBtn.textContent = 'Sign In';

                usernameContainer?.classList.remove('hidden');
                dobContainer?.classList.remove('hidden');
                confirmPasswordContainer?.classList.remove('hidden');
                apiKeyContainer?.classList.remove('hidden');
                termsContainer?.classList.remove('hidden');
                ensureTurnstileRendered();
            } else {
                authTitle.textContent = 'Account Verification';
                submitBtn.textContent = 'Verify Credentials';
                toggleMsg.textContent = 'New node initialization?';
                authToggleBtn.textContent = 'Create Account';

                usernameContainer?.classList.add('hidden');
                dobContainer?.classList.add('hidden');
                confirmPasswordContainer?.classList.add('hidden');
                apiKeyContainer?.classList.remove('hidden');
                termsContainer?.classList.add('hidden');
                captchaContainer?.classList.add('hidden');
            }
        });
    }

    // Forgot Password click handler
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            isRecoveryMode = true;
            isSignUpMode = false;
            awaitingOtp = false;
            clearSensitiveFields();

            authTitle.textContent = 'Reset Password';
            submitBtn.textContent = 'Send Recovery Code';

            usernameContainer?.classList.add('hidden');
            dobContainer?.classList.add('hidden');
            confirmPasswordContainer?.classList.add('hidden');
            apiKeyContainer?.classList.add('hidden');
            termsContainer?.classList.add('hidden');
            captchaContainer?.classList.add('hidden');
            otpStepContainer?.classList.add('hidden');
        });
    }

    // Form submission handler
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email')?.value.trim() || '';
            const password = document.getElementById('password')?.value || '';

            submitBtn.disabled = true;

            try {
                // STAGE A: FORGOT PASSWORD / RECOVERY FLOW
                if (isRecoveryMode) {
                    if (!awaitingOtp) {
                        submitBtn.textContent = 'Sending Code...';
                        const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
                        if (error) throw error;

                        pendingEmail = email;
                        awaitingOtp = true;

                        otpStepContainer?.classList.remove('hidden');
                        confirmPasswordContainer?.classList.remove('hidden');
                        submitBtn.textContent = 'Update Password';
                        notify('Recovery code sent to your email.', 'info');
                    } else {
                        const otpToken = document.getElementById('otp-code')?.value.trim() || '';
                        const newPassword = document.getElementById('password')?.value || '';
                        const confirmNewPassword = document.getElementById('confirm-password')?.value || '';

                        if (!otpToken || otpToken.length !== 6) {
                            notify('Please enter a valid 6-digit OTP code.', 'warning');
                            return;
                        }
                        if (newPassword.length < 6) {
                            notify('New password must be at least 6 characters.', 'warning');
                            return;
                        }
                        if (newPassword !== confirmNewPassword) {
                            notify('Passwords do not match.', 'warning');
                            return;
                        }

                        submitBtn.textContent = 'Updating...';

                        const { error: verifyError } = await supabaseClient.auth.verifyOtp({
                            email: pendingEmail,
                            token: otpToken,
                            type: 'recovery'
                        });
                        if (verifyError) throw verifyError;

                        const { error: updateError } = await supabaseClient.auth.updateUser({
                            password: newPassword
                        });
                        if (updateError) throw updateError;

                        notify('Password updated! Please sign in with your new password.', 'success');
                        isRecoveryMode = false;
                        awaitingOtp = false;
                        clearSensitiveFields();
                        otpStepContainer?.classList.add('hidden');
                        confirmPasswordContainer?.classList.add('hidden');
                        authTitle.textContent = 'Account Verification';
                        submitBtn.textContent = 'Verify Credentials';
                    }
                    return;
                }

                // STAGE B: OTP VERIFICATION FOR SIGN UP
                if (awaitingOtp) {
                    const otpToken = document.getElementById('otp-code')?.value.trim() || '';
                    if (!otpToken || otpToken.length !== 6) {
                        notify('Please enter a valid 6-digit OTP code.', 'warning');
                        return;
                    }

                    submitBtn.textContent = 'Verifying Code...';

                    const { data, error } = await supabaseClient.auth.verifyOtp({
                        email: pendingEmail,
                        token: otpToken,
                        type: 'signup'
                    });

                    if (error) throw error;

                    notify('OTP verified successfully. Account initialized.', 'success');
                    awaitingOtp = false;
                    if (data.session) handleSessionUpdate(data.session);

                } else if (isSignUpMode) {
                    // STAGE C: SIGN-UP DETAILS + OPTIONAL TURNSTILE VERIFICATION
                    const username = document.getElementById('username')?.value.trim() || '';
                    const dob = document.getElementById('dob')?.value || '';
                    const confirmPassword = document.getElementById('confirm-password')?.value || '';
                    const providerKey = document.getElementById('user-provider-key')?.value.trim() || '';
                    const termsChecked = document.getElementById('terms-checkbox')?.checked;

                    if (password.length < 6) {
                        notify('Password must be at least 6 characters.', 'warning');
                        return;
                    }
                    if (password !== confirmPassword) {
                        notify('Passwords do not match.', 'warning');
                        return;
                    }
                    if (!termsChecked) {
                        notify('Please accept the Terms of Service and Privacy Policy.', 'warning');
                        return;
                    }

                    if (turnstileConfig.enabled) {
                        const token = window.turnstile && turnstileWidgetId !== null
                            ? window.turnstile.getResponse(turnstileWidgetId)
                            : '';
                        if (!token) {
                            notify('Please complete the security CAPTCHA check.', 'warning');
                            return;
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

                    submitBtn.textContent = 'Sending Code...';

                    const { error } = await supabaseClient.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                username: username || null,
                                date_of_birth: dob || null
                            }
                        }
                    });

                    if (error) throw error;

                    if (providerKey) {
                        localStorage.setItem('snx_user_provider_key', providerKey);
                    }

                    pendingEmail = email;
                    awaitingOtp = true;

                    usernameContainer?.classList.add('hidden');
                    dobContainer?.classList.add('hidden');
                    confirmPasswordContainer?.classList.add('hidden');
                    apiKeyContainer?.classList.add('hidden');
                    termsContainer?.classList.add('hidden');
                    captchaContainer?.classList.add('hidden');

                    otpStepContainer?.classList.remove('hidden');
                    submitBtn.textContent = 'Confirm Security Code';
                    notify('Verification OTP dispatched to your email.', 'info');

                } else {
                    // STAGE D: STANDARD SIGN IN
                    submitBtn.textContent = 'Authenticating...';

                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email,
                        password
                    });

                    if (error) throw error;

                    const providerKey = document.getElementById('user-provider-key')?.value.trim() || '';
                    if (providerKey.startsWith('sk-') && providerKey.length >= 20) {
                        localStorage.setItem('snx_user_provider_key', providerKey);
                    }

                    notify('Authenticated successfully.', 'success');
                    handleSessionUpdate(data.session);
                }
            } catch (err) {
                notify(`Authentication Error: ${err.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                if (!awaitingOtp) {
                    submitBtn.textContent = isRecoveryMode
                        ? 'Send Recovery Code'
                        : (isSignUpMode ? 'Send OTP Code' : 'Verify Credentials');
                }
            }
        });
    }

    // Social Auth
    document.getElementById('btn-google')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    });

    document.getElementById('btn-github')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'github' });
    });

    // Modal dismiss handlers (X button, guest bypass, Escape key)
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
        if (window.isUserLoggedIn) {
            const confirmed = window.showConfirmToast
                ? await window.showConfirmToast('Sign out of your SourNex account?', 'Sign Out', 'Stay')
                : false;
            if (confirmed) {
                await supabaseClient.auth.signOut();
                notify('Signed out. Switched back to Guest Profile.', 'info');
            }
        } else {
            window.openAuthModal();
        }
    });

    // Session state handler
    function handleSessionUpdate(session) {
        if (awaitingOtp) {
            return;
        }

        if (session && session.user) {
            const isEmailVerified = session.user.email_confirmed_at !== null;

            if (!isEmailVerified) {
                supabaseClient.auth.signOut();
                window.currentUser = null;
                window.isUserLoggedIn = false;
                updateHeaderIdentity('Guest Profile', null, false);
                if (typeof window.syncWorkspaceAccess === 'function') {
                    window.syncWorkspaceAccess();
                }
                return;
            }

            window.currentUser = session.user;
            window.isUserLoggedIn = true;

            const metadata = session.user.user_metadata || {};
            const username = metadata.username || session.user.email.split('@')[0];

            updateHeaderIdentity('Authenticated', username, true);
            window.closeAuthModal();
        } else {
            window.currentUser = null;
            window.isUserLoggedIn = false;
            updateHeaderIdentity('Guest Profile', null, false);
            if (typeof window.syncWorkspaceAccess === 'function') {
                window.syncWorkspaceAccess();
            }
        }
    }

    function updateHeaderIdentity(statusLabel, username, isLoggedIn) {
        if (accountStatusLabel) accountStatusLabel.textContent = statusLabel;
        if (accountStatusDot) {
            accountStatusDot.className = isLoggedIn
                ? 'h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]'
                : 'h-2 w-2 rounded-full bg-zinc-600';
        }
        if (username && headerUsername) {
            headerUsername.textContent = `@${username}`;
            headerUsername.classList.remove('hidden');
        } else if (headerUsername) {
            headerUsername.classList.add('hidden');
        }
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleSessionUpdate(session);
    });
});
