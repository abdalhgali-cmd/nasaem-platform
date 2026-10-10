// Standalone flight bookings page. ?id=<booking id> opens that booking
// directly (shareable link).
(async function bootFlightBookingsPage() {
  const user = await requireSession();
  if (!user) return;
  renderHeader(user, "flights");
  if (!["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"].includes(user.role)) {
    showAlert(document.getElementById("alert"), "ليست لديك صلاحية لعرض حجوزات الطيران.");
    return;
  }

  const view = createFlightBookingsView({
    user,
    listBody: document.getElementById("flight-bookings-body"),
    statusFilter: document.getElementById("flight-status-filter"),
    searchInput: document.getElementById("flight-search"),
    detailCard: document.getElementById("flight-booking-detail"),
    onOpen: (id) => {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("id", id);
      else url.searchParams.delete("id");
      window.history.replaceState(null, "", url);
    },
  });

  await view.load();
  const initial = new URLSearchParams(window.location.search).get("id");
  if (initial) view.openDetail(initial);
})();
