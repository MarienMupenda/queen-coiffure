export function renderHeader(container, onNavigate, activeView = "salon") {
  if (!container) {
    throw new Error("Header container introuvable");
  }

  container.innerHTML = `
    <header class="rounded-[2rem] border border-rose-200/40 bg-rose-50/20 px-5 py-4 shadow-[0_16px_60px_rgba(136,19,55,0.18)] backdrop-blur">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.45em] text-rose-300">Queen Coiffure</p>
          <h1 class="mt-2 text-2xl font-semibold text-white">Paiement QR pour salons de coiffure</h1>
        </div>
        <nav class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-nav="salon"
            class="rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeView === "salon"
                ? "bg-rose-300 text-rose-950"
                : "bg-rose-100/20 text-rose-50 hover:bg-rose-100/30"
            }"
          >
            Salon
          </button>
          <button
            type="button"
            data-nav="client"
            class="rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeView === "client"
                ? "bg-rose-300 text-rose-950"
                : "bg-rose-100/20 text-rose-50 hover:bg-rose-100/30"
            }"
          >
            Client
          </button>
        </nav>
      </div>
    </header>
  `;

  container.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => onNavigate(button.dataset.nav));
  });
}
