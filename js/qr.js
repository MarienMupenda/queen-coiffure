import { getInvoiceById } from "./finance.js";

export function generateQR(invoice, baseUrl = window.location.href) {
  if (!invoice || !invoice.id || invoice.total_amount === undefined) {
    throw new Error("Facture invalide");
  }

  const payload = {
    invoice_id: invoice.id,
    amount: invoice.total_amount,
    service_id: invoice.service_id || null,
    service_name: invoice.service_name || null,
  };

  const url = new URL(baseUrl || window.location.href, window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("pay", JSON.stringify(payload));

  return url.toString();
}

export function parseQR(qrString) {
  if (!qrString) {
    throw new Error("QR vide");
  }

  if (typeof qrString === "object") {
    return qrString;
  }

  const rawValue = String(qrString).trim();

  try {
    if (/^https?:\/\//i.test(rawValue) || rawValue.startsWith("file:") || rawValue.includes("?")) {
      const url = new URL(rawValue, window.location.href);
      const payload = url.searchParams.get("pay");

      if (payload) {
        return JSON.parse(payload);
      }
    }
  } catch {
    // Fall through to JSON parsing.
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error("QR invalide");
  }
}

export function validateQR(qrData) {
  if (!qrData || typeof qrData !== "object") {
    throw new Error("QR invalide");
  }

  const invoice = getInvoiceById(qrData.invoice_id);

  if (!invoice) {
    throw new Error("Facture introuvable");
  }

  if (invoice.status === "paid") {
    throw new Error("QR expiré");
  }

  if (Number(qrData.amount) !== Number(invoice.total_amount)) {
    throw new Error("Montant du QR invalide");
  }

  return invoice;
}

export function renderQR(container, data) {
  if (!container) {
    throw new Error("Container QR introuvable");
  }

  const qrValue = typeof data === "string" ? data : JSON.stringify(data);
  let details = null;

  try {
    details = typeof data === "string" ? parseQR(data) : data;
  } catch {
    details = null;
  }

  const qrLibrary = window.QRCode;

  if (!qrLibrary) {
    throw new Error("La librairie QRCode n'est pas chargée.");
  }

  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "rounded-[2rem] border border-rose-200 bg-white p-5 shadow-[0_18px_60px_rgba(136,19,55,0.14)]";

  const heading = document.createElement("div");
  heading.className = "mb-4 flex items-center justify-between gap-3";
  heading.innerHTML = `
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.35em] text-rose-400">Lien de paiement</p>
      <p class="mt-1 text-lg font-semibold text-slate-900">${details?.service_name ? details.service_name : "Paiement salon"}</p>
    </div>
    <span class="rounded-full bg-rose-900 px-3 py-1 text-xs font-semibold text-white">SCAN</span>
  `;

  const qrSlot = document.createElement("div");
  qrSlot.className =
    "mx-auto flex min-h-[320px] w-full max-w-[320px] items-center justify-center rounded-[1.5rem] border border-rose-100 bg-white p-3";

  const footer = document.createElement("div");
  footer.className = "mt-4 space-y-2";
  footer.innerHTML = `
    <div class="flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-3 text-sm text-slate-600">
      <span>${details?.amount !== undefined ? "Montant" : "Lien"}</span>
      <strong class="text-slate-900">${
        details?.amount !== undefined
          ? `${Number(details.amount).toLocaleString("fr-FR")} FC`
          : "Paiement mobile"
      }</strong>
    </div>
    <pre class="overflow-x-auto rounded-2xl bg-rose-950 p-4 text-xs text-rose-100">${qrValue}</pre>
  `;

  wrapper.appendChild(heading);
  wrapper.appendChild(qrSlot);
  wrapper.appendChild(footer);
  container.appendChild(wrapper);

  try {
    new qrLibrary(qrSlot, {
      text: qrValue,
      width: 280,
      height: 280,
      colorDark: "#4a102f",
      colorLight: "#ffffff",
      correctLevel: qrLibrary.CorrectLevel.M,
    });
  } catch (error) {
    container.innerHTML = `
      <div class="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p class="text-sm font-semibold">Impossible de générer le QR code.</p>
        <p class="mt-1 text-sm">${error.message}</p>
      </div>
    `;
  }
}
