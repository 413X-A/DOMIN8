// =========================================================
// ELEMENTS
// =========================================================

const introScreen =
    document.getElementById("intro-screen");

const loginScreen =
    document.getElementById("login-screen");

const menuScreen =
    document.getElementById("menu-screen");

const loginForm =
    document.getElementById("login-form");

const loginEmail =
    document.getElementById("login-email");

const loginPassword =
    document.getElementById("login-password");

const loginButton =
    document.getElementById("login-button");

const loginMessage =
    document.getElementById("login-message");

const logoutButton =
    document.getElementById("logout-button");

const playerName =
    document.getElementById("player-name");

const notification =
    document.getElementById("coming-soon");

const notificationText =
    document.getElementById("notification-text");


// =========================================================
// SCREEN MANAGEMENT
// =========================================================

function hideAllScreens() {
    document
        .querySelectorAll(".screen")
        .forEach(screen => {
            screen.classList.remove("active");
        });
}


function showScreen(screen) {
    if (!screen) {
        return;
    }

    hideAllScreens();

    screen.classList.add("active");
}


function showIntroScreen() {
    showScreen(introScreen);
}


function showLoginScreen() {
    showScreen(loginScreen);
}


function showMenuScreen() {
    showScreen(menuScreen);
}


// =========================================================
// NOTIFICATION
// =========================================================

let notificationTimeout = null;


function showNotification(text) {
    if (!notification || !notificationText) {
        return;
    }

    notificationText.textContent = text;

    notification.classList.add("show");

    clearTimeout(
        notificationTimeout
    );

    notificationTimeout = setTimeout(() => {
        notification.classList.remove(
            "show"
        );
    }, 2200);
}


// =========================================================
// LOAD PLAYER
// =========================================================

async function loadPlayer(user) {
    if (!user) {
        return null;
    }


    // -----------------------------------------------------
    // PROFILE
    // -----------------------------------------------------

    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .select(
            "username, display_name"
        )
        .eq(
            "id",
            user.id
        )
        .single();


    if (profileError) {
        return null;
    }


    // -----------------------------------------------------
    // PLAYER PROGRESS
    // -----------------------------------------------------

    const {
        data: progress,
        error: progressError
    } = await supabaseClient
        .from("player_progress")
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .single();


    if (progressError) {
        return null;
    }


    return {
        profile,
        progress
    };
}


// =========================================================
// UPDATE PLAYER UI
// =========================================================

function updatePlayerUI(player) {
    if (!player) {
        return;
    }

    const profile =
        player.profile;

    const name =
        profile.display_name ||
        profile.username ||
        "Player";

    if (playerName) {
        playerName.textContent =
            name;
    }
}


// =========================================================
// SHOW MAIN MENU
// =========================================================

async function showMainMenu(user) {
    const player =
        await loadPlayer(user);


    if (!player) {
        showLoginScreen();

        return;
    }


    updatePlayerUI(player);

    showMenuScreen();
}


// =========================================================
// LOGIN
// =========================================================

async function handleLogin(event) {
    event.preventDefault();


    const email =
        loginEmail.value.trim();

    const password =
        loginPassword.value;


    if (!email || !password) {
        if (loginMessage) {
            loginMessage.textContent =
                "Bitte E-Mail und Passwort eingeben.";
        }

        return;
    }


    if (loginButton) {
        loginButton.disabled = true;
    }

    if (loginMessage) {
        loginMessage.textContent =
            "LOGIN...";
    }


    const {
        data,
        error
    } = await supabaseClient.auth
        .signInWithPassword({
            email,
            password
        });


    if (error) {
        if (loginMessage) {
            loginMessage.textContent =
                "Login fehlgeschlagen.";
        }

        if (loginButton) {
            loginButton.disabled = false;
        }

        return;
    }


    if (loginMessage) {
        loginMessage.textContent = "";
    }


    if (data?.user) {
        await showMainMenu(
            data.user
        );
    }


    if (loginButton) {
        loginButton.disabled = false;
    }
}


// =========================================================
// LOGIN FORM EVENT
// =========================================================

if (loginForm) {
    loginForm.addEventListener(
        "submit",
        handleLogin
    );
}


// =========================================================
// LOGOUT
// =========================================================

async function handleLogout() {
    const {
        error
    } = await supabaseClient.auth
        .signOut();


    if (error) {
        return;
    }


    if (loginEmail) {
        loginEmail.value = "";
    }

    if (loginPassword) {
        loginPassword.value = "";
    }

    if (loginMessage) {
        loginMessage.textContent = "";
    }


    showLoginScreen();
}


// =========================================================
// LOGOUT BUTTON
// =========================================================

if (logoutButton) {
    logoutButton.addEventListener(
        "click",
        handleLogout
    );
}


// =========================================================
// MENU BUTTONS
// =========================================================

document
    .querySelectorAll("[data-action]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const action =
                    button.dataset.action;


                switch (action) {

                    case "play":

                        showNotification(
                            "Das Color-Fill-Spiel kommt als Nächstes."
                        );

                        break;


                    case "campaign":

                        showNotification(
                            "CAMPAIGN – COMING SOON"
                        );

                        break;


                    case "challenges":

                        showNotification(
                            "CHALLENGES – COMING SOON"
                        );

                        break;


                    case "ranked":

                        showNotification(
                            "RANKED – COMING SOON"
                        );

                        break;


                    case "profile":

                        showNotification(
                            "PROFILE – COMING SOON"
                        );

                        break;


                    case "settings":

                        showNotification(
                            "SETTINGS – COMING SOON"
                        );

                        break;


                    default:
                        break;
                }
            }
        );
    });


// =========================================================
// INITIALIZE APP
// =========================================================

async function initializeApp() {

    // -----------------------------------------------------
    // GET SESSION
    // -----------------------------------------------------

    const {
        data: { session },
        error
    } = await supabaseClient.auth
        .getSession();


    if (error) {
        showLoginScreen();

        return;
    }


    // -----------------------------------------------------
    // NO SESSION
    // -----------------------------------------------------

    if (!session) {
        showIntroScreen();

        return;
    }


    // -----------------------------------------------------
    // SESSION EXISTS
    // -----------------------------------------------------

    const player =
        await loadPlayer(
            session.user
        );


    if (!player) {
        showLoginScreen();

        return;
    }


    // -----------------------------------------------------
    // INTRO NOT COMPLETED
    // -----------------------------------------------------

    if (
        !player.progress.intro_completed
    ) {
        showIntroScreen();

        return;
    }


    // -----------------------------------------------------
    // INTRO COMPLETED
    // -----------------------------------------------------

    await showMainMenu(
        session.user
    );
}


// =========================================================
// AUTH STATE
// =========================================================

supabaseClient.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        if (
            event === "SIGNED_OUT"
        ) {
            showLoginScreen();

            return;
        }


        if (
            event === "SIGNED_IN" &&
            session
        ) {
            await showMainMenu(
                session.user
            );

            return;
        }
    }
);


// =========================================================
// START APPLICATION
// =========================================================

initializeApp();