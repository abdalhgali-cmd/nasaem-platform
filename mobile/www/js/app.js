import { icon } from "./icons.js";
import { offlineBanner, confirmDialog } from "./ui.js";
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
import { renderMyRequestsScreen, renderRequestDetailScreen, renderOrderDetailScreen } from "./screens/requests.js";
import { renderNotificationsScreen } from "./screens/notifications.js";
import { renderAccountScreen, renderEditProfileScreen, renderChangePasswordScreen, renderMyDocumentsScreen, setOnLoggedOut } from "./screens/account.js";

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");

function registerAllScreens() {
  registerScreen("welcome", renderWelcomeScreen);
  registerScreen("login", renderLoginScreen);
  registerScreen("register", renderRegisterScreen);
  registerScreen("forgotPassword", renderForgotPasswordScreen);
  registerScreen("resetPassword", renderResetPasswordScreen);

  registerScreen("home", renderHomeScreen);
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

  registerScreen("requests", renderMyRequestsScreen);
  registerScreen("requestDetail", renderRequestDetailScreen);
  registerScreen("orderDetail", renderOrderDetailScreen);

  registerScreen("notifications", renderNotificationsScreen);

  registerScreen("account", renderAccountScreen);
  registerScreen("editProfile", renderEditProfileScreen);
  registerScreen("changePassword", renderChangePasswordScreen);
  registerScreen("myDocuments", renderMyDocumentsScreen);
}

async function enterAuthenticatedShell() {
  navEl.hidden = false;
  await goToTab("home", "home", { title: "" });
}

async function enterAuthFlow() {
  navEl.hidden = true;
  await go("welcome", {}, { root: true });
}

function wireBottomNav() {
  navEl.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;
      if (currentTab() === tab && stackDepth() === 1) return; // already at tab root
      const titleByTab = { home: "", requests: "طلباتي", notifications: "الإشعارات", account: "حسابي" };
      const screenByTab = { home: "home", requests: "requests", notifications: "notifications", account: "account" };
      await goToTab(tab, screenByTab[tab], { title: titleByTab[tab] });
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

  setOnAuthenticated(enterAuthenticatedShell);
  setOnLoggedOut(enterAuthFlow);

  await auth.resolveSession();

  if (auth.isAuthenticated()) {
    await enterAuthenticatedShell();
  } else {
    await enterAuthFlow();
  }

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
