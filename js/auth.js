// =========================================================
// FILLER: COLOR FILL
// AUTHENTICATION & INTRO
// =========================================================

"use strict";


// =========================================================
// ELEMENTS
// =========================================================

const introScreen =
    document.getElementById("intro-screen");

const loginScreen =
    document.getElementById("login-screen");

const introStart =
    document.getElementById("intro-start");

const backToIntro =
    document.getElementById("back-to-intro");

const loginForm =
    document.getElementById("login-form");

const loginEmail =
    document.getElementById("login-email");

const loginPassword =
    document.getElementById("login-password");

const loginButton =
    document.getElementById("login-button");

const signupButton =
    document.getElementById("signup-button");

const loginMessage =
    document.getElementById("login-message");


// =========================================================
// SUPABASE
// =========================================================

function getAuthClient() {

    if (
        typeof supabaseClient !== "undefined" &&
        supabaseClient &&
        supabaseClient.auth
    ) {
        return supabaseClient;
    }

    if (
        window.supabaseClient &&
        window.supabaseClient.auth
    ) {
        return window.supabaseClient;
    }

    return null;
}


// =========================================================
// SCREEN
// =========================================================

function showScreen(screen) {

    if (!screen) {
        return;
    }

    document
        .querySelectorAll(".screen")
        .forEach(element => {
            element.classList.remove("active");
        });

    screen.classList.add("active");
}


// =========================================================
// MESSAGE
// =========================================================

function setLoginMessage(
    message,
    type = ""
) {

    if (!loginMessage) {
        return;
    }

    loginMessage.textContent =
        message;

    loginMessage.classList.remove(
        "error",
        "success"
    );

    if (type) {
        loginMessage.classList.add(
            type
        );
    }
}


// =========================================================
// MENU
// =========================================================

function goToMenu() {

    window.location.href =
        "pages/menu.html";
}


// =========================================================
// SESSION
// =========================================================

async function getCurrentUser() {

    const db =
        getAuthClient();

    if (!db) {
        return null;
    }

    try {

        const {
            data,
            error
        } = await db.auth.getSession();

        if (error) {
            return null;
        }

        return (
            data?.session?.user ||
            null
        );

    } catch (error) {

        return null;
    }
}


// =========================================================
// CHECK INTRO
// =========================================================

async function checkIntro(user) {

    const db =
        getAuthClient();

    if (!db || !user) {

        showScreen(
            introScreen
        );

        return;
    }

    try {

        const {
            data: progress,
            error
        } = await db
            .from("player_progress")
            .select(
                "intro_completed"
            )
            .eq(
                "user_id",
                user.id
            )
            .maybeSingle();


        if (error) {

            showScreen(
                introScreen
            );

            return;
        }


        if (
            progress &&
            progress.intro_completed === true
        ) {

            goToMenu();

            return;
        }


        showScreen(
            introScreen
        );

    } catch (error) {

        showScreen(
            introScreen
        );
    }
}


// =========================================================
// COMPLETE INTRO
// =========================================================

async function completeIntro() {

    const db =
        getAuthClient();


    // -----------------------------------------------------
    // KEIN SUPABASE
    // -----------------------------------------------------

    if (!db) {

        showScreen(
            loginScreen
        );

        setLoginMessage(
            "Bitte anmelden."
        );

        return;
    }


    // -----------------------------------------------------
    // AKTUELLEN USER LADEN
    // -----------------------------------------------------

    let user = null;

    try {

        user =
            await getCurrentUser();

    } catch (error) {

        user = null;
    }


    // -----------------------------------------------------
    // NICHT EINGELOGGT
    // -----------------------------------------------------

    if (!user) {

        setLoginMessage("");

        showScreen(
            loginScreen
        );

        return;
    }


    // -----------------------------------------------------
    // INTRO ABSCHLIESSEN
    // -----------------------------------------------------

    try {

        const {
            error
        } = await db.rpc(
            "complete_filler_intro"
        );


        if (error) {

            // Auch bei einem RPC-Fehler
            // weiterhin zum Menü.
            goToMenu();

            return;
        }


        goToMenu();

    } catch (error) {

        goToMenu();
    }
}


// =========================================================
// LOGIN
// =========================================================

async function handleLogin(event) {

    event.preventDefault();


    const db =
        getAuthClient();


    if (!db) {

        setLoginMessage(
            "Supabase-Verbindung fehlt.",
            "error"
        );

        return;
    }


    const email =
        loginEmail?.value.trim();

    const password =
        loginPassword?.value || "";


    if (!email || !password) {

        setLoginMessage(
            "Bitte E-Mail und Passwort eingeben.",
            "error"
        );

        return;
    }


    if (loginButton) {
        loginButton.disabled = true;
    }


    setLoginMessage(
        "Anmeldung läuft ..."
    );


    try {

        const {
            data,
            error
        } = await db.auth
            .signInWithPassword({
                email,
                password
            });


        if (error) {

            setLoginMessage(
                error.message ||
                "Login fehlgeschlagen.",
                "error"
            );

            return;
        }


        if (!data?.user) {

            setLoginMessage(
                "Anmeldung fehlgeschlagen.",
                "error"
            );

            return;
        }


        setLoginMessage(
            "Erfolgreich angemeldet.",
            "success"
        );


        await checkIntro(
            data.user
        );

    } catch (error) {

        setLoginMessage(
            error?.message ||
            "Verbindungsfehler.",
            "error"
        );

    } finally {

        if (loginButton) {
            loginButton.disabled = false;
        }
    }
}


// =========================================================
// SIGNUP
// =========================================================

async function handleSignup() {

    const db =
        getAuthClient();


    if (!db) {

        setLoginMessage(
            "Supabase-Verbindung fehlt.",
            "error"
        );

        return;
    }


    const email =
        loginEmail?.value.trim();

    const password =
        loginPassword?.value || "";


    if (!email || !password) {

        setLoginMessage(
            "Bitte E-Mail und Passwort eingeben.",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        setLoginMessage(
            "Das Passwort muss mindestens 6 Zeichen lang sein.",
            "error"
        );

        return;
    }


    if (signupButton) {
        signupButton.disabled = true;
    }

    if (loginButton) {
        loginButton.disabled = true;
    }


    setLoginMessage(
        "Konto wird erstellt ..."
    );


    try {

        const {
            data,
            error
        } = await db.auth.signUp({

            email,
            password,

            options: {
                data: {
                    username:
                        email.split("@")[0]
                }
            }
        });


        if (error) {
            throw error;
        }


        if (
            data?.session &&
            data?.user
        ) {

            await checkIntro(
                data.user
            );

        } else {

            setLoginMessage(
                "Konto erstellt. Bitte bestätige deine E-Mail und melde dich danach an.",
                "success"
            );
        }

    } catch (error) {

        setLoginMessage(
            error?.message ||
            "Konto konnte nicht erstellt werden.",
            "error"
        );

    } finally {

        if (signupButton) {
            signupButton.disabled = false;
        }

        if (loginButton) {
            loginButton.disabled = false;
        }
    }
}


// =========================================================
// EVENTS
// =========================================================

// ---------------------------------------------------------
// START INTRO
// ---------------------------------------------------------

if (introStart) {

    introStart.addEventListener(
        "click",
        completeIntro
    );
}


// ---------------------------------------------------------
// ZURÜCK ZUM INTRO
// ---------------------------------------------------------

if (backToIntro) {

    backToIntro.addEventListener(
        "click",
        () => {

            setLoginMessage("");

            showScreen(
                introScreen
            );
        }
    );
}


// ---------------------------------------------------------
// LOGIN FORM
// ---------------------------------------------------------

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        handleLogin
    );
}


// ---------------------------------------------------------
// SIGNUP
// ---------------------------------------------------------

if (signupButton) {

    signupButton.addEventListener(
        "click",
        handleSignup
    );
}


// =========================================================
// AUTH STATE
// =========================================================

const authClient =
    getAuthClient();


if (authClient) {

    authClient.auth.onAuthStateChange(
        event => {

            if (
                event === "SIGNED_OUT"
            ) {

                showScreen(
                    introScreen
                );
            }
        }
    );
}


// =========================================================
// INITIALIZATION
// =========================================================

async function initializeAuth() {

    const db =
        getAuthClient();


    if (!db) {

        showScreen(
            introScreen
        );

        return;
    }


    const user =
        await getCurrentUser();


    if (!user) {

        showScreen(
            introScreen
        );

        return;
    }


    await checkIntro(
        user
    );
}


// =========================================================
// START APPLICATION
// =========================================================

initializeAuth();