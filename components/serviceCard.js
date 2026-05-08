function formatAmount(amount) {
  return `${Number(amount || 0).toLocaleString("fr-FR")} FC`;
}

function getInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createServiceCard(service, onAction, options = {}) {
  const { label = "Choisir", active = false } = options;
  const el = document.createElement("article");
  el.className = [
    "overflow-hidden rounded-3xl border bg-white shadow-sm transition",
    active
      ? "border-rose-300 ring-2 ring-rose-100 shadow-lg"
      : "border-rose-100 hover:-translate-y-0.5 hover:shadow-md",
  ].join(" ");

  const photoMarkup = service.photo
    ? `<img src="${escapeHtml(service.photo)}" alt="${escapeHtml(
        service.name
      )}" class="h-40 w-full object-cover" />`
    : `<div class="flex h-40 w-full items-center justify-center bg-gradient-to-br from-rose-900 via-fuchsia-700 to-rose-400 text-4xl font-bold text-white">${getInitials(
        service.name
      )}</div>`;

  el.innerHTML = `
    ${photoMarkup}
    <div class="space-y-4 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">Service</p>
          <h3 class="mt-2 truncate text-lg font-semibold text-slate-900" data-service-name></h3>
        </div>
        <span class="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700" data-service-price></span>
      </div>
      <button
        type="button"
        class="w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
          active
            ? "bg-rose-300 text-rose-950"
            : "bg-rose-900 text-white hover:bg-rose-800"
        }"
        data-service-action
      >
        ${label}
      </button>
    </div>
  `;

  el.querySelector("[data-service-name]").textContent = service.name;
  el.querySelector("[data-service-price]").textContent = formatAmount(service.price);
  el.querySelector("[data-service-action]").addEventListener("click", () =>
    onAction(service)
  );

  return el;
}
