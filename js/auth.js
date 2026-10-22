// =========================================================
// FILLER: COLOR FILL
// AUTHENTICATION & INTRO
// =========================================================

"use strict";

console.log("[AUTH] auth.js wurde geladen.");

// =========================================================
// ELEMENTS
// =========================================================

const introScreen = document.getElementById("intro-screen");
const loginScreen = document.getElementById("login-screen");

const introStart = document.getElementById("intro-start");
const backToIntro = document.getElementById("back-to-intro");

const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginButton = document.getElementById("login-button");
const signupButton = document.getElementById("signup-button");
const loginMessage = document.getElementById("login-message");


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
        console.error("[AUTH] Screen fehlt.");
        return;
    }

    document.querySelectorAll(".screen").forEach(element => {
        element.classList.remove("active");
    });

    screen.classList.add("active");

    console.log(
        "[AUTH] Screen gewechselt:",
        screen.id
    );
}


// =========================================================
// MESSAGE
// =========================================================

function setLoginMessage(message, type = "") {

    if (!loginMessage) return;

    loginMessage.textContent = message;

    loginMessage.classList.remove(
        "error",
        "success"
    );

    if (type) {
        loginMessage.classList.add(type);
    }
}


// =========================================================
// MENU
// =========================================================

function goToMenu() {

    console.log(
        "[AUTH] Weiterleitung zu pages/menu.html"
    );

    window.location.href = "pages/menu.html";
}


// =========================================================
// SESSION
// =========================================================

async function getCurrentUser() {

    const db = getAuthClient();

    if (!db) {
        console.error(
            "[AUTH] Kein Supabase Client."
        );

        return null;
    }

    try {

        const {
            data,
            error
        } = await db.auth.getSession();

        if (error) {
            console.error(
                "[AUTH] getSession Fehler:",
                error
            );

            return null;
        }

        return data?.session?.user || null;

    } catch (error) {

        console.error(
            "[AUTH] Session Fehler:",
            error
        );

        return null;
    }
}


// =========================================================
// CHECK INTRO
// =========================================================

async function checkIntro(user) {

    const db = getAuthClient();

    if (!db || !user) {
        showScreen(introScreen);
        return;
    }

    try {

        const {
            data: progress,
            error
        } = await db
            .from("player_progress")
            .select("intro_completed")
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {

            console.error(
                "[AUTH] player_progress Fehler:",
                error
            );

            showScreen(introScreen);
            return;
        }

        if (
            progress &&
            progress.intro_completed === true
        ) {
            goToMenu();
            return;
        }

        showScreen(introScreen);

    } catch (error) {

        console.error(
            "[AUTH] checkIntro Fehler:",
            error
        );

        showScreen(introScreen);
    }
}


// =========================================================
// START
// =========================================================

async function completeIntro() {

    console.log(
        "================================"
    );

    console.log(
        "[AUTH] START wurde gedrückt!"
    );

    console.log(
        "================================"
    );


    const db = getAuthClient();


    // Kein Supabase → trotzdem Login anzeigen
    if (!db) {

        console.error(
            "[AUTH] Supabase fehlt."
        );

        showScreen(loginScreen);

        setLoginMessage(
            "Bitte anmelden."
        );

        return;
    }


    let user = null;

    try {
        user = await getCurrentUser();
    } catch (error) {
        console.error(
            "[AUTH] Sessionprüfung Fehler:",
            error
        );
    }


    // Nicht eingeloggt → LOGIN
    if (!user) {

        console.log(
            "[AUTH] Kein User → Login anzeigen."
        );

        setLoginMessage("");

        showScreen(loginScreen);

        return;
    }


    // Bereits eingeloggt
    console.log(
        "[AUTH] User bereits eingeloggt:",
        user.id
    );


    try {

        const {
            error
        } = await db.rpc(
            "complete_filler_intro"
        );

        if (error) {

            console.error(
                "[AUTH] complete_filler_intro Fehler:",
                error
            );

            // Trotzdem weiter zum Menü
            goToMenu();

            return;
        }

        goToMenu();

    } catch (error) {

        console.error(
            "[AUTH] Intro Fehler:",
            error
        );

        goToMenu();
    }
}

console.log("[AUTH] URL:", SUPABASE_URL);
console.log(
    "[AUTH] KEY:",
    SUPABASE_KEY
        ? SUPABASE_KEY.substring(0, 20) + "..."
        : "FEHLT"
);

// =========================================================
// LOGIN
// =========================================================

async function handleLogin(event) {

    event.preventDefault();

    console.log(
        "[AUTH] LOGIN wurde gedrückt."
    );

    const db = getAuthClient();

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


    loginButton.disabled = true;

    setLoginMessage(
        "Anmeldung läuft ..."
    );


    try {

        const {
            data,
            error
        } = await db.auth.signInWithPassword({
            email,
            password
        });


        if (error) {

            console.error(
                "[AUTH] Login Fehler:",
                error
            );

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


        console.log(
            "[AUTH] Login erfolgreich:",
            data.user.id
        );


        setLoginMessage(
            "Erfolgreich angemeldet.",
            "success"
        );


        await checkIntro(data.user);

    } catch (error) {

        console.error(
            "[AUTH] Unerwarteter Login-Fehler:",
            error
        );

        setLoginMessage(
            error?.message ||
            "Verbindungsfehler.",
            "error"
        );

    } finally {

        loginButton.disabled = false;
    }
}


// =========================================================
// SIGNUP
// =========================================================

async function handleSignup() {

    const db = getAuthClient();

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


    signupButton.disabled = true;
    loginButton.disabled = true;

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

        console.error(
            "[AUTH] Registrierung Fehler:",
            error
        );

        setLoginMessage(
            error?.message ||
            "Konto konnte nicht erstellt werden.",
            "error"
        );

    } finally {

        signupButton.disabled = false;
        loginButton.disabled = false;
    }
}


// =========================================================
// EVENTS
// =========================================================

console.log(
    "[AUTH] Suche START-Button..."
);

if (introStart) {

    console.log(
        "[AUTH] START-Button gefunden."
    );

    introStart.addEventListener(
        "click",
        completeIntro
    );

} else {

    console.error(
        "[AUTH] FEHLER: #intro-start nicht gefunden!"
    );
}


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


if (loginForm) {

    loginForm.addEventListener(
        "submit",
        handleLogin
    );
}


if (signupButton) {

    signupButton.addEventListener(
        "click",
        handleSignup
    );
}


// =========================================================
// AUTH STATE
// =========================================================

const authClient = getAuthClient();

if (authClient) {

    authClient.auth.onAuthStateChange(
        (event) => {

            console.log(
                "[AUTH] Auth Event:",
                event
            );

            if (event === "SIGNED_OUT") {
                showScreen(introScreen);
            }
        }
    );
}


// =========================================================
// INITIALIZATION
// =========================================================

async function initializeAuth() {

    console.log(
        "[AUTH] Initialisierung..."
    );

    const db = getAuthClient();

    if (!db) {

        console.error(
            "[AUTH] Supabase Client fehlt."
        );

        showScreen(introScreen);

        return;
    }


    const user =
        await getCurrentUser();


    if (!user) {

        showScreen(introScreen);

        return;
    }


    console.log(
        "[AUTH] Eingeloggter User:",
        user.id
    );


    await checkIntro(user);
}


initializeAuth();
