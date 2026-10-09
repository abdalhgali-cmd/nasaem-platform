import { icon } from "./icons.js";
import { offlineBanner, confirmDialog, toast } from "./ui.js";
import { registerScreen, initRouter, go, goToTab, back, stackDepth, currentTab } from "./router.js";
import * as auth from "./auth.js";

import { renderWelcomeScreen, renderLoginScreen, renderRegisterScreen, renderForgotPasswordScreen, renderResetPasswordScreen, setOnAuthenticated } from "./screens/auth-screens.js";
import { renderHomeScreen } from "./screens/home.js";
import { renderServicesScreen, renderVisasHubScreen, renderServiceDetailScreen } from "./screens/services.js";
import { renderUmrahScreen } from "./screens/umrah.js";
import { renderFlightsScreen } from "./screens/flights.js";
import { renderFerriesScreen } from "./screens/ferries.js";
import { renderHotelsScreen } from "./screens/hotels.js";
import { renderEgyptClearanceScreen } from "./screens/egypt-clearance.js";
import { renderSaudiFamilyVisitScreen } from "./screens/saudi-family-visit.js";
import { renderRequestSubmittedScreen } from "./screens/intake.js";
import { renderRequestsTabScreen, renderRequestDetailScreen, renderOrderDetailScreen, renderTrackedRequestDetailScreen, renderGuestTrackingScreen } from "./screens/requests.js";
import { renderNotificationsScreen } from "./screens/notifications.js";
import { renderAccountScreen, renderEditProfileScreen, renderChangePasswordScreen, renderMyDocumentsScreen, setOnLoggedOut, setOnReplayOnboarding } from "./screens/account.js";
import { renderSecurityScreen } from "./screens/security.js";
import { renderOnboardingScreen, isOnboardingDone, markOnboardingDone } from "./screens/onboarding.js";
import { renderAboutScreen } from "./screens/about.js";
import { launchRoute } from "./experience-core.js";
import { tapFeedback } from "./motion.js";

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");

function registerAllScreens() {
  registerScreen("onboarding", renderOnboardingScreen, { chrome: false });
  registerScreen("welcome", renderWelcomeScreen, { chrome: false });
  registerScreen("about", renderAboutScreen);
  registerScreen("login", renderLoginScreen);
  registerScreen("register", renderRegisterScreen);
  registerScreen("forgotPassword", renderForgotPasswordScreen);
  registerScreen("resetPassword", renderResetPasswordScreen);

  registerScreen("home", renderHomeScreen, { chrome: false });
  registerScreen("services", renderServicesScreen);
  registerScreen("visasHub", renderVisasHubScreen);
  registerScreen("serviceDetail", renderServiceDetailScreen);
  registerScreen("umrah", renderUmrahScreen);
  registerScreen("flights", renderFlightsScreen);
  registerScreen("ferries", renderFerriesScreen);
  registerScreen("hotels", renderHotelsScreen);
  registerScreen("egyptClearance", renderEgyptClearanceScreen);
  registerScreen("saudiFamilyVisit", renderSaudiFamilyVisitScreen);
  registerScreen("requestSubmitted", renderRequestSubmittedScreen);

  registerScreen("requests", renderRequestsTabScreen);
  registerScreen("requestDetail", renderRequestDetailScreen);
  registerScreen("orderDetail", renderOrderDetailScreen);

  registerScreen("notifications", renderNotificationsScreen);

  registerScreen("account", renderAccountScreen);
  registerScreen("editProfile", renderEditProfileScreen);
  registerScreen("changePassword", renderChangePasswordScreen);
  registerScreen("myDocuments", renderMyDocumentsScreen);
  registerScreen("security", renderSecurityScreen);

  registerScreen("trackedRequestDetail", renderTrackedRequestDetailScreen);
  registerScreen("guestTracking", renderGuestTrackingScreen);
}

// The app is usable without an account: every launch ends on the public
// shell (Home, Services, Requests, Account). An account session, if one is
// stored, is checked in the background and only unlocks account content.
const TAB_TITLES = { home: "", services: "الخدمات", requests: "طلباتي", account: "حسابي" };
const ACCOUNT_DEPENDENT_TABS = new Set(["home", "requests", "account"]);
const SESSION_ENDED_NOTICE = "انتهت جلسة حسابك. يمكنك متابعة التصفح، وسجّل الدخول متى شئت لعرض حسابك.";

async function enterShell(tab = "home") {
  navEl.hidden = false;
  await goToTab(tab, tab, { title: TAB_TITLES[tab] ?? "" });
}

async function showOnboarding({ replay = false } = {}) {
  navEl.hidden = true;
  await go("onboarding", { onFinish: () => enterShell(replay ? "account" : "home") }, { root: true });
}

async function startFromStoredSession() {
  const stored = await auth.loadStoredSession();
  const onboardingDone = await isOnboardingDone();
  // Customers who already had a session before this version never need the intro.
  if (stored.kind !== "none" && !onboardingDone) markOnboardingDone();
  if (launchRoute({ storedKind: stored.kind, onboardingDone }) === "onboarding") await showOnboarding();
  else await enterShell("home");

  // Saved account (no biometric lock): confirm it with the server without
  // holding up the public screens. A biometric-locked account stays locked
  // until the customer opens account content (screens/account.js).
  if (stored.kind === "token") {
    auth.verifySession().then((result) => {
      if (result.state === auth.SessionState.EXPIRED) toast(SESSION_ENDED_NOTICE);
    });
  }
}

// Account state changed (verified, locked, expired, signed out): re-draw the
// account-dependent tab the customer is looking at, if they are on its root.
function wireAccountStateRefresh() {
  auth.onAccountStateChange(() => {
    const tab = currentTab();
    if (navEl.hidden || stackDepth() !== 1 || !ACCOUNT_DEPENDENT_TABS.has(tab)) return;
    goToTab(tab, tab, { title: TAB_TITLES[tab] ?? "" });
  });
}

// Light status-bar icons over the navy strip, on every Android version (see
// capacitor.config.ts). Both plugins write the same window flag; setting it
// from here wins over any default applied while the bridge started.
function applySystemBarStyle() {
  const plugins = window.Capacitor?.Plugins || {};
  plugins.SystemBars?.setStyle?.({ style: "DARK" })?.catch?.(() => {});
  plugins.StatusBar?.setStyle?.({ style: "DARK" })?.catch?.(() => {});
}

function wireBottomNav() {
  navEl.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tapFeedback();
      const tab = btn.dataset.tab;
      if (currentTab() === tab && stackDepth() === 1) return; // already at tab root
      await goToTab(tab, tab, { title: TAB_TITLES[tab] ?? "" });
    });
  });
}

function wireBackButton() {
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) return;
  AppPlugin.addListener("backButton", () => {
    if (stackDepth() > 1) {
      back();
      return;
    }
    // At a tab root (or the auth flow's first screen): confirm exit rather
    // than leaving the Android back button feeling broken or silently
    // backgrounding without feedback.
    if (confirmDialog("هل تريد إغلاق التطبيق؟")) {
      AppPlugin.exitApp();
    }
  });
}

function wireConnectivity() {
  const update = () => offlineBanner(!navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

async function boot() {
  registerAllScreens();
  initRouter({ screenElement: screenEl, navElement: navEl, emptyStackHandler: () => {} });
  wireBottomNav();
  wireBackButton();
  wireConnectivity();
  applySystemBarStyle();
  window.Capacitor?.Plugins?.App?.addListener?.("resume", applySystemBarStyle);

  // Signing in / creating an account lands on the account tab; signing out
  // returns to the public home. Neither is ever required to use the app.
  setOnAuthenticated(() => enterShell("account"));
  setOnLoggedOut(() => enterShell("home"));
  setOnReplayOnboarding(() => showOnboarding({ replay: true }));
  auth.setOnSessionEnded(() => toast(SESSION_ENDED_NOTICE));
  wireAccountStateRefresh();

  await startFromStoredSession();

  window.Capacitor?.Plugins?.SplashScreen?.hide();
}

boot().catch((error) => {
  console.error("[app] boot failed", error);
  screenEl.innerHTML = `
    <div class="boot-error">
      ${icon("alert", { size: 32 })}
      <h2>تعذر تشغيل التطبيق</h2>
      <p>${error.message || "حدث خطأ غير متوقع"}</p>
      <button class="primary" onclick="location.reload()">إعادة المحاولة</button>
    </div>`;
  window.Capacitor?.Plugins?.SplashScreen?.hide();
});
