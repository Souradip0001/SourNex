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

    // PASSWORD VISIBILITY TOGGLE LOGIC
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', () => {
            const input = button.parentElement.querySelector('input');
            if (input) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                button.classList.toggle('text-luxury-gold', isPassword);
                button.classList.toggle('text-zinc-500', !isPassword);
            }
        });
    });

    // Input containers
    const usernameContainer = document.getElementById('username-container');
    const dobContainer = document.getElementById('dob-container');
    const confirmPasswordContainer = document.getElementById('confirm-password-container');
    const apiKeyContainer = document.getElementById('api-key-container');
    const termsContainer = document.getElementById('terms-container');
    const captchaContainer = document.getElementById('captcha-container');
    const otpStepContainer = document.getElementById('otp-step-container');

    // Header UI elements
    const accountStatusLabel = document.getElementById('account-status-label');
    const accountStatusDot = document.getElementById('account-status-dot');
    const headerUsername = document.getElementById('header-username');
    const globalAccountBtn = document.getElementById('global-account-btn');
    const masterInput = document.getElementById('master-input');
    const sendBtn = document.getElementById('send-btn');

    let isSignUpMode = false;
    let awaitingOtp = false;     // State flag to track OTP stage
    let pendingEmail = "";       // Holds email across OTP step
    let isRecoveryMode = false; // State flag for password reset mode

    // TOGGLE BETWEEN SIGN IN & SIGN UP MODE
    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            isRecoveryMode = false;
            awaitingOtp = false;
            otpStepContainer?.classList.add('hidden');

            if (isSignUpMode) {
                authTitle.textContent = "REGISTER NEW OPERATOR";
                submitBtn.textContent = "Send OTP Code";
                toggleMsg.textContent = "Already have an account?";
                authToggleBtn.textContent = "Sign In";

                usernameContainer?.classList.remove('hidden');
                dobContainer?.classList.remove('hidden');
                confirmPasswordContainer?.classList.remove('hidden');
                apiKeyContainer?.classList.remove('hidden');
                termsContainer?.classList.remove('hidden');
                captchaContainer?.classList.remove('hidden');
            } else {
                authTitle.textContent = "ACCOUNT VERIFICATION";
                submitBtn.textContent = "Verify Credentials";
                toggleMsg.textContent = "New node initialization?";
                authToggleBtn.textContent = "Create Account";

                usernameContainer?.classList.add('hidden');
                dobContainer?.classList.add('hidden');
                confirmPasswordContainer?.classList.add('hidden');
                apiKeyContainer?.classList.add('hidden');
                termsContainer?.classList.add('hidden');
                captchaContainer?.classList.add('hidden');
            }
        });
    }

    // FORGOT PASSWORD CLICK HANDLER
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            isRecoveryMode = true;
            isSignUpMode = false;
            awaitingOtp = false;

            authTitle.textContent = "RESET PASSWORD";
            submitBtn.textContent = "Send Recovery Code";

            // Hide non-essential registration fields
            usernameContainer?.classList.add('hidden');
            dobContainer?.classList.add('hidden');
            confirmPasswordContainer?.classList.add('hidden');
            apiKeyContainer?.classList.add('hidden');
            termsContainer?.classList.add('hidden');
            captchaContainer?.classList.add('hidden');
            otpStepContainer?.classList.add('hidden');
        });
    }

    // FORM SUBMISSION HANDLER
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            submitBtn.disabled = true;

            try {
                // STAGE A: FORGOT PASSWORD / RECOVERY FLOW
                if (isRecoveryMode) {
                    if (!awaitingOtp) {
                        // Request Recovery OTP via Brevo / Supabase
                        submitBtn.textContent = "Sending Code...";
                        const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
                        if (error) throw error;

                        pendingEmail = email;
                        awaitingOtp = true;
                        
                        // Reveal OTP and New Password fields
                        otpStepContainer?.classList.remove('hidden');
                        confirmPasswordContainer?.classList.remove('hidden');
                        submitBtn.textContent = "Update Password";
                    } else {
                        // Verify OTP & Apply New Password
                        const otpToken = document.getElementById('otp-code').value.trim();
                        const newPassword = document.getElementById('password').value;

                        if (!otpToken || otpToken.length !== 6) {
                            alert("Please enter a valid 6-digit OTP code.");
                            return;
                        }

                        submitBtn.textContent = "Updating...";

                        // Verify Recovery Token
                        const { error: verifyError } = await supabaseClient.auth.verifyOtp({
                            email: pendingEmail,
                            token: otpToken,
                            type: 'recovery'
                        });
                        if (verifyError) throw verifyError;

                        // Set New Password
                        const { error: updateError } = await supabaseClient.auth.updateUser({
                            password: newPassword
                        });
                        if (updateError) throw updateError;

                        alert("Password updated successfully! Please sign in with your new password.");
                        isRecoveryMode = false;
                        awaitingOtp = false;
                        location.reload();
                    }
                    return;
                }

                // STAGE B: USER IS ENTERING 6-DIGIT OTP (SIGNUP)
                if (awaitingOtp) {
                    const otpToken = document.getElementById('otp-code').value.trim();
                    if (!otpToken || otpToken.length !== 6) {
                        alert("Please enter a valid 6-digit OTP code.");
                        return;
                    }

                    submitBtn.textContent = "Verifying Code...";

                    const { data, error } = await supabaseClient.auth.verifyOtp({
                        email: pendingEmail,
                        token: otpToken,
                        type: 'signup'
                    });

                    if (error) throw error;

                    alert("OTP verified successfully! Account initialized.");
                    awaitingOtp = false;
                    if (data.session) handleSessionUpdate(data.session);

                } else if (isSignUpMode) {
                    // STAGE C: USER SUBMITS SIGN-UP DETAILS TO REQUEST OTP
                    const username = document.getElementById('username').value.trim();
                    const dob = document.getElementById('dob').value;
                    const confirmPassword = document.getElementById('confirm-password').value;
                    const termsChecked = document.getElementById('terms-checkbox').checked;

                    if (password !== confirmPassword) {
                        alert("Passwords do not match.");
                        return;
                    }
                    if (!termsChecked) {
                        alert("Please accept the Terms of Service.");
                        return;
                    }

                    submitBtn.textContent = "Sending Code...";

                    const { data, error } = await supabaseClient.auth.signUp({
                        email: email,
                        password: password,
                        options: {
                            data: {
                                username: username || null,
                                date_of_birth: dob || null
                            }
                        }
                    });

                    if (error) throw error;

                    pendingEmail = email;
                    awaitingOtp = true;
                    
                    usernameContainer?.classList.add('hidden');
                    dobContainer?.classList.add('hidden');
                    confirmPasswordContainer?.classList.add('hidden');
                    apiKeyContainer?.classList.add('hidden');
                    termsContainer?.classList.add('hidden');
                    captchaContainer?.classList.add('hidden');
                    
                    otpStepContainer?.classList.remove('hidden');
                    submitBtn.textContent = "Confirm Security Code";

                } else {
                    // STAGE D: STANDARD SIGN IN
                    submitBtn.textContent = "Authenticating...";

                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: email,
                        password: password
                    });

                    if (error) throw error;

                    handleSessionUpdate(data.session);
                }
            } catch (err) {
                alert(`Authentication Error: ${err.message}`);
            } finally {
                submitBtn.disabled = false;
                if (!awaitingOtp) {
                    submitBtn.textContent = isRecoveryMode ? "Send Recovery Code" : (isSignUpMode ? "Send OTP Code" : "Verify Credentials");
                }
            }
        });
    }

    // SOCIAL AUTH
    document.getElementById('btn-google')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    });

    document.getElementById('btn-github')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'github' });
    });

    // GUEST BYPASS
    guestBypassBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        authOverlay?.classList.add('hidden');
        enableChatInterface("Guest Profile", null);
    });

    authCloseBtn?.addEventListener('click', () => {
        authOverlay?.classList.add('hidden');
    });

    globalAccountBtn?.addEventListener('click', () => {
        if (window.isUserLoggedIn) {
            if (confirm("Would you like to sign out?")) {
                supabaseClient.auth.signOut();
            }
        } else {
            authOverlay?.classList.remove('hidden');
        }
    });

    // SESSION HANDLERS
    function handleSessionUpdate(session) {
        if (awaitingOtp) {
            disableChatInterface();
            return;
        }

        if (session && session.user) {
            const isEmailVerified = session.user.email_confirmed_at !== null;

            if (!isEmailVerified) {
                supabaseClient.auth.signOut();
                window.currentUser = null;
                window.isUserLoggedIn = false;
                disableChatInterface();
                return;
            }

            window.currentUser = session.user;
            window.isUserLoggedIn = true;

            const metadata = session.user.user_metadata || {};
            const username = metadata.username || session.user.email.split('@')[0];

            authOverlay?.classList.add('hidden');
            enableChatInterface("Authenticated", username);
        } else {
            window.currentUser = null;
            window.isUserLoggedIn = false;
            disableChatInterface();
        }
    }

    function enableChatInterface(statusLabel, username) {
        if (accountStatusLabel) accountStatusLabel.textContent = statusLabel;
        if (accountStatusDot) accountStatusDot.className = "h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]";
        
        if (username && headerUsername) {
            headerUsername.textContent = `@${username}`;
            headerUsername.classList.remove('hidden');
        } else if (headerUsername) {
            headerUsername.classList.add('hidden');
        }

        if (masterInput) {
            masterInput.disabled = false;
            masterInput.placeholder = "Inject prompt into matrix stream...";
        }
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = "Send";
            sendBtn.classList.replace('bg-zinc-800', 'bg-luxury-gold');
            sendBtn.classList.replace('text-zinc-500', 'text-black');
        }
    }

    function disableChatInterface() {
        if (accountStatusLabel) accountStatusLabel.textContent = "Guest Profile";
        if (accountStatusDot) accountStatusDot.className = "h-2 w-2 rounded-full bg-zinc-600";
        if (headerUsername) headerUsername.classList.add('hidden');
        
        if (masterInput) {
            masterInput.disabled = true;
            masterInput.placeholder = "Authentication required to unlock pipeline...";
        }
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.textContent = "Lock";
            sendBtn.classList.replace('bg-luxury-gold', 'bg-zinc-800');
            sendBtn.classList.replace('text-black', 'text-zinc-500');
        }
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleSessionUpdate(session);
    });
});
                                  
