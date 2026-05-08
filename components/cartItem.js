function formatAmount(amount) {
  return `${Number(amount || 0).toLocaleString("fr-FR")} FC`;
}

export function createCartItem(item, onRemove) {
  const el = document.createElement("article");
  el.className =
    "flex items-center justify-between gap-4 rounded-2xl border border-rose-200/30 bg-rose-50/10 px-4 py-3";

  el.innerHTML = `
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold text-rose-50" data-item-name></p>
      <p class="mt-1 text-xs uppercase tracking-[0.3em] text-rose-300">Article du panier</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="rounded-full bg-rose-100/20 px-3 py-1 text-sm font-semibold text-rose-200" data-item-price></span>
      <button
        type="button"
        class="rounded-full border border-rose-300/30 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/10"
        data-remove-item
      >
        Supprimer
      </button>
    </div>
  `;

  el.querySelector("[data-item-name]").textContent = item.name;
  el.querySelector("[data-item-price]").textContent = formatAmount(item.price);
  el.querySelector("[data-remove-item]").addEventListener("click", () =>
    onRemove(item.id)
  );

  return el;
}
