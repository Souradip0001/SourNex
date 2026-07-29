/**
 * SOURNEX ENGINE - Authentication & Matrix Access System
 * Handles Supabase Authentication, OAuth, Guest Access, and UI State Updates.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- SUPABASE CLIENT INITIALIZATION ---
    const SUPABASE_URL = "https://qyznllcvbgeygusscpjs.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_NeNNwjPtDVVjSj5GgabI2Q_7JNnUslS";
    
    let supabaseClient = null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error("Supabase SDK failed to load properly from CDN.");
    }

    // --- UI DOM ELEMENTS ---
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

    const globalAccountBtn = document.getElementById('global-account-btn');
    const accountStatusDot = document.getElementById('account-status-dot');
    const accountStatusLabel = document.getElementById('account-status-label');

    // NATIVE HTML FORM INPUTS & CONTAINERS
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const eyeIconOff = document.getElementById('eye-icon-off');
    const eyeIconOn = document.getElementById('eye-icon-on');

    const confirmPasswordContainer = document.getElementById('confirm-password-container');
    const confirmPasswordInput = document.getElementById('confirm-password');

    const apiKeyContainer = document.getElementById('api-key-container');
    const apiKeyInput = document.getElementById('user-provider-key');

    const termsContainer = document.getElementById('terms-container');
    const termsCheckbox = document.getElementById('terms-checkbox');

    const captchaContainer = document.getElementById('captcha-container');
    const emailVerificationNotice = document.getElementById('email-verification-notice');

    // Local authentication state
    let isSignUpMode = false;

    // --- PASSWORD VISIBILITY TOGGLE ---
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            
            if (confirmPasswordInput) {
                confirmPasswordInput.type = passwordInput.type;
            }

            // Toggle Eye Icons
            if (isPassword) {
                eyeIconOff?.classList.add('hidden');
                eyeIconOn?.classList.remove('hidden');
            } else {
                eyeIconOff?.classList.remove('hidden');
                eyeIconOn?.classList.add('hidden');
            }
        });
    }

    // --- UI MODAL DISPLAY TOGGLES ---
    window.displayAuthModal = function() {
        if (authOverlay) {
            authOverlay.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
            authOverlay.classList.add('pointer-events-auto', 'flex');
        }
    };

    window.dismissAuthModal = function() {
        if (authOverlay) {
            authOverlay.classList.remove('pointer-events-auto', 'flex');
            authOverlay.classList.add('opacity-0', 'pointer-events-none', 'hidden');
        }
    };

    if (globalAccountBtn) globalAccountBtn.addEventListener('click', window.displayAuthModal);
    if (authCloseBtn) authCloseBtn.addEventListener('click', window.dismissAuthModal);
    if (authGuestBypass) {
        authGuestBypass.addEventListener('click', (e) => {
            e.preventDefault();
            window.dismissAuthModal();
        });
    }

    // --- FORM MODE SWITCHING (Login vs Sign Up) ---
    if (authToggle) {
        authToggle.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;

            // Hide verification notice when toggling forms
            if (emailVerificationNotice) emailVerificationNotice.classList.add('hidden');

            if (isSignUpMode) {
                if (authTitle) authTitle.textContent = "Register Matrix Profile";
                if (btnSubmit) btnSubmit.textContent = "Initialize Registration";
                if (toggleMsg) toggleMsg.textContent = "Already verified?";
                authToggle.textContent = "Sign In";

                // Reveal registration-specific native HTML fields
                confirmPasswordContainer?.classList.remove('hidden');
                apiKeyContainer?.classList.remove('hidden');
                termsContainer?.classList.remove('hidden');
                captchaContainer?.classList.remove('hidden');

                if (confirmPasswordInput) confirmPasswordInput.required = true;
            } else {
                if (authTitle) authTitle.textContent = "Account Verification";
                if (btnSubmit) btnSubmit.textContent = "Verify Credentials";
                if (toggleMsg) toggleMsg.textContent = "New node initialization?";
                authToggle.textContent = "Create Account";

                // Hide registration fields for simple login
                confirmPasswordContainer?.classList.add('hidden');
                apiKeyContainer?.classList.add('hidden');
                termsContainer?.classList.add('hidden');
                captchaContainer?.classList.add('hidden');

                if (confirmPasswordInput) confirmPasswordInput.required = false;
            }
        });
    }

    // --- ACCOUNT STATE UPDATER ---
    function updateAccountState(user) {
        const masterInput = document.getElementById('master-input');
        const sendBtn = document.getElementById('send-btn');

        if (user) {
            window.isUserLoggedIn = true;
            if (accountStatusDot) accountStatusDot.className = "h-2 w-2 rounded-full bg-luxury-gold shadow-gold-glow animate-pulse";
            if (accountStatusLabel) accountStatusLabel.textContent = user.email ? user.email.split('@')[0] : "Verified Profile";
            
            if (masterInput) {
                masterInput.disabled = false;
                masterInput.placeholder = "Type instructions for the multi-layer pipeline...";
            }
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.className = "absolute right-2 px-4 py-2 text-[11px] font-bold tracking-wider uppercase rounded-lg bg-luxury-gold text-black hover:bg-amber-400 active:scale-[0.98] transition-all focus:outline-none flex items-center space-x-1.5 cursor-pointer";
                sendBtn.innerHTML = `<span>Run</span>`;
            }
        } else {
            window.isUserLoggedIn = false;
            if (accountStatusDot) accountStatusDot.className = "h-2 w-2 rounded-full bg-zinc-600";
            if (accountStatusLabel) accountStatusLabel.textContent = "Guest Profile";
        }
    }

    // --- SUPABASE SESSION LISTENER ---
    if (supabaseClient) {
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                updateAccountState(session.user);
            }
        });

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                updateAccountState(session.user);
            } else {
                updateAccountState(null);
            }
        });
    }

    // --- FORM SUBMISSION HANDLER ---
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!supabaseClient) {
                alert("Database connection uninitialized. Please refresh.");
                return;
            }

            const email = emailInput?.value.trim();
            const password = passwordInput?.value.trim();
            const userApiKey = apiKeyInput?.value.trim();

            if (!email || !password) return;

            // Form Validation on Registration
            if (isSignUpMode) {
                const confirmPassword = confirmPasswordInput?.value.trim();
                
                if (password !== confirmPassword) {
                    alert("Cipher mismatch: Access Cipher confirmation does not match.");
                    return;
                }
                
                if (password.length < 6) {
                    alert("Cipher strength error: Password must be at least 6 characters.");
                    return;
                }

                if (termsCheckbox && !termsCheckbox.checked) {
                    alert("Matrix Policy Agreement Required: Please accept the Terms of Service.");
                    return;
                }
            }

            btnSubmit.disabled = true;
            btnSubmit.innerText = "Processing...";

            try {
                if (isSignUpMode) {
                    // Registration Flow
                    const { data, error } = await supabaseClient.auth.signUp({
                        email: email,
                        password: password,
                        options: {
                            data: {
                                provider_api_key: userApiKey || null
                            }
                        }
                    });

                    if (error) throw error;

                    // If user is created but email verification is pending
                    if (data?.user && data.session === null) {
                        if (emailVerificationNotice) {
                            emailVerificationNotice.classList.remove('hidden');
                        }
                    } else if (data?.user) {
                        if (userApiKey) localStorage.setItem('snx_user_provider_key', userApiKey);
                        updateAccountState(data.user);
                        window.dismissAuthModal();
                    }
                } else {
                    // Sign In Flow
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password,
                    });

                    if (error) throw error;

                    if (data?.user) {
                        updateAccountState(data.user);
                        window.dismissAuthModal();
                    }
                }
            } catch (err) {
                alert(`Authentication Error: ${err.message || err}`);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerText = isSignUpMode ? "Initialize Registration" : "Verify Credentials";
            }
        });
    }

    // --- OAUTH PROVIDERS ---
    async function handleOAuthLogin(provider) {
        if (!supabaseClient) {
            alert("Database connection uninitialized.");
            return;
        }

        try {
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (err) {
            alert(`OAuth Error (${provider}): ${err.message}`);
        }
    }

    if (btnGoogle) btnGoogle.addEventListener('click', () => handleOAuthLogin('google'));
    if (btnGithub) btnGithub.addEventListener('click', () => handleOAuthLogin('github'));
});
      
