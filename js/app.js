import { renderHeader } from "../components/header.js";
import { createServiceCard } from "../components/serviceCard.js";
import {
  addService,
  deleteService,
  getServices,
  updateService,
} from "./services.js";
import { createInvoice, createPayment, getInvoices, getPayments } from "./finance.js";
import { generateQR, parseQR, renderQR } from "./qr.js";

export const STORAGE_KEY = "hair-salon-qr-mvp";

export const state = {
  services: [],
  cart: [],
  invoices: [],
  payments: [],
  paymentBaseUrl: "",
};

let activeView = "salon";
let editingServiceId = null;
let salonMessage = "";
let clientMessage = "";
let rootEl = null;
let servicePhotoDraft = "";
let clientSession = null;
let clientQrDraft = "";
let paymentBaseUrl = "";
const HARDCODED_PAYMENT_BASE_URL = "https://salon-de-coiffure-systeme.vercel.app";

const paymentMethods = [
  { value: "airtel", label: "Airtel Money" },
  { value: "orange", label: "Orange Money" },
  { value: "afrimoney", label: "Afrimoney" },
  { value: "cash", label: "Espèce" },
];

const moneyFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount) {
  return `${moneyFormatter.format(Number(amount) || 0)} FC`;
}

function getPaymentMethodLabel(method) {
  return paymentMethods.find((item) => item.value === method)?.label || method || "-";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeService(service) {
  if (!service || typeof service !== "object") {
    return null;
  }

  const price = Number(service.price);

  if (!service.id || !service.name || !Number.isFinite(price)) {
    return null;
  }

  return {
    id: String(service.id),
    name: String(service.name),
    price,
    photo: typeof service.photo === "string" ? service.photo : "",
  };
}

function normalizeInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return null;
  }

  const amount = Number(invoice.total_amount);
  const status = invoice.status === "paid" ? "paid" : "pending";

  if (!invoice.id || !Number.isFinite(amount)) {
    return null;
  }

  return {
    id: String(invoice.id),
    total_amount: amount,
    status,
    service_id: invoice.service_id ? String(invoice.service_id) : null,
    service_name: invoice.service_name ? String(invoice.service_name) : null,
    service_photo: typeof invoice.service_photo === "string" ? invoice.service_photo : "",
  };
}

function normalizePayment(payment) {
  if (!payment || typeof payment !== "object") {
    return null;
  }

  const amount = Number(payment.amount);

  if (
    !payment.id ||
    !payment.invoice_id ||
    !Number.isFinite(amount) ||
    !paymentMethods.some((item) => item.value === payment.method) ||
    payment.status !== "success"
  ) {
    return null;
  }

  return {
    id: String(payment.id),
    invoice_id: String(payment.invoice_id),
    amount,
    method: payment.method,
    status: "success",
  };
}

function normalizePaymentBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function getInjectedAppOrigin() {
  if (typeof window.__APP_ORIGIN__ !== "string") {
    return "";
  }

  const injected = window.__APP_ORIGIN__.trim();

  if (!injected || injected === "__APP_ORIGIN__") {
    return "";
  }

  return normalizePaymentBaseUrl(injected);
}

function isLikelyLocalPaymentUrl(baseUrl) {
  if (!baseUrl) {
    return true;
  }

  try {
    const url = new URL(baseUrl);
    return (
      url.protocol === "file:" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    );
  } catch {
    return true;
  }
}

export function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getState() {
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      state.services = [];
      state.cart = [];
      state.invoices = [];
      state.payments = [];
      return state;
    }

    const parsed = JSON.parse(raw);

    state.services = normalizeArray(parsed.services).map(normalizeService).filter(Boolean);
    state.cart = normalizeArray(parsed.cart).filter(
      (item) => item && typeof item === "object"
    );
    state.invoices = normalizeArray(parsed.invoices)
      .map(normalizeInvoice)
      .filter(Boolean);
    state.payments = normalizeArray(parsed.payments)
      .map(normalizePayment)
      .filter(Boolean);
    paymentBaseUrl = normalizePaymentBaseUrl(parsed.paymentBaseUrl || "");
    state.paymentBaseUrl = paymentBaseUrl;
  } catch {
    state.services = [];
    state.cart = [];
    state.invoices = [];
    state.payments = [];
    paymentBaseUrl = "";
    state.paymentBaseUrl = "";
  }

  return state;
}

export function saveState() {
  state.paymentBaseUrl = paymentBaseUrl;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in restricted contexts.
  }

  return state;
}

export function resetState() {
  state.services = [];
  state.cart = [];
  state.invoices = [];
  state.payments = [];
  state.paymentBaseUrl = "";
  paymentBaseUrl = "";

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function setSalonMessage(message) {
  salonMessage = message;
}

function setClientMessage(message) {
  clientMessage = message;
}

function clearServiceDraft() {
  editingServiceId = null;
  servicePhotoDraft = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire la photo"));
    reader.readAsDataURL(file);
  });
}

function currentServiceForEdit() {
  if (!editingServiceId) {
    return null;
  }

  return getServices().find((service) => service.id === editingServiceId) || null;
}

function handleNavigate(view) {
  activeView = view;
  renderApp();
}

function handleClientQrDraft(event) {
  clientQrDraft = event.currentTarget.value;
}

function getPaymentBaseUrl() {
  return HARDCODED_PAYMENT_BASE_URL;
}

function getServiceFromInvoice(invoice, qrData) {
  const services = getServices();
  const serviceId = invoice?.service_id || qrData?.service_id || invoice?.id || null;
  const matchedService = services.find((service) => service.id === serviceId) || null;

  return {
    id: serviceId,
    name:
      matchedService?.name ||
      invoice?.service_name ||
      qrData?.service_name ||
      "Service sélectionné",
    photo: matchedService?.photo || invoice?.service_photo || "",
    price: Number(invoice?.total_amount || qrData?.amount || 0),
  };
}

function findInvoiceFromQR(qrData) {
  const invoiceId = String(qrData?.invoice_id || "").trim();
  const amount = Number(qrData?.amount);

  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("QR invalide");
  }

  const existingInvoice = getInvoices().find((invoice) => invoice.id === invoiceId) || null;

  if (existingInvoice) {
    if (Number(existingInvoice.total_amount) !== amount) {
      throw new Error("Montant du QR invalide");
    }

    return existingInvoice;
  }
  return null;
}

function openClientPaymentSession(qrData) {
  const invoice = findInvoiceFromQR(qrData);
  const amount = Number(qrData?.amount);
  const invoiceId = String(qrData?.invoice_id || "").trim();

  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("QR invalide");
  }

  const service = getServiceFromInvoice(invoice, qrData);
  const payment = invoice
    ? getPayments().find((item) => item.invoice_id === invoice.id) || null
    : null;

  clientSession = {
    service,
    invoice: invoice || {
      id: invoiceId,
      total_amount: amount,
      status: "pending",
      service_id: qrData?.service_id ? String(qrData.service_id) : null,
      service_name: qrData?.service_name ? String(qrData.service_name) : null,
      service_photo: "",
    },
    payment,
    modalOpen: true,
  };
  activeView = "client";
  clientQrDraft = "";
  setClientMessage(
    payment || invoice.status === "paid"
      ? "Paiement déjà confirmé pour ce service."
      : "Le QR a été ouvert. Vérifie les informations puis confirme le paiement."
  );
  renderApp();
}

function initializeClientSessionFromUrl() {
  try {
    const qrData = parseQR(window.location.href);

    if (!qrData?.invoice_id) {
      return;
    }

    openClientPaymentSession(qrData);
  } catch {
    // Aucun QR dans l'URL courante.
  }
}

async function handleServicePhotoChange(event) {
  const file = event.currentTarget.files?.[0];

  if (!file) {
    servicePhotoDraft = "";
    renderApp();
    return;
  }

  try {
    servicePhotoDraft = await fileToDataUrl(file);
    renderApp();
  } catch (error) {
    servicePhotoDraft = "";
    setSalonMessage(error.message);
    renderApp();
  }
}

function handleServiceSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const name = form.elements.serviceName.value.trim();
  const priceValue = Number(form.elements.servicePrice.value);
  const existingService = currentServiceForEdit();
  const photoValue = servicePhotoDraft || existingService?.photo || "";

  if (!name || !Number.isFinite(priceValue) || priceValue <= 0) {
    setSalonMessage("Veuillez saisir un nom et un prix valides.");
    renderApp();
    return;
  }

  if (!photoValue) {
    setSalonMessage("Veuillez ajouter une photo du service.");
    renderApp();
    return;
  }

  try {
    if (existingService) {
      updateService(existingService.id, {
        name,
        price: priceValue,
        photo: photoValue,
      });
      setSalonMessage("Service mis a jour.");
    } else {
      addService(name, priceValue, photoValue);
      setSalonMessage("Service ajoute.");
    }

    clearServiceDraft();
    form.reset();
    renderApp();
  } catch (error) {
    setSalonMessage(error.message);
    renderApp();
  }
}

function handleEditService(serviceId) {
  editingServiceId = serviceId;
  servicePhotoDraft = "";
  setSalonMessage("Mode modification active.");
  renderApp();
}

function handleCancelEdit() {
  clearServiceDraft();
  setSalonMessage("Modification annulee.");
  renderApp();
}

function handleDeleteService(serviceId) {
  const service = getServices().find((item) => item.id === serviceId);
  const confirmDelete = window.confirm(
    `Supprimer "${service?.name || "ce service"}" ?`
  );

  if (!confirmDelete) {
    return;
  }

  try {
    deleteService(serviceId);

    if (editingServiceId === serviceId) {
      clearServiceDraft();
    }

    if (clientSession?.service?.id === serviceId) {
      clientSession = null;
      setClientMessage("Le service selectionne a ete supprime.");
    }

    setSalonMessage("Service supprime.");
    renderApp();
  } catch (error) {
    setSalonMessage(error.message);
    renderApp();
  }
}

function handleResetStoredData() {
  const confirmReset = window.confirm(
    "Reinitialiser toutes les donnees enregistrees (services, factures, paiements) ?"
  );

  if (!confirmReset) {
    return;
  }

  resetState();
  clearServiceDraft();
  clientSession = null;
  clientQrDraft = "";
  setClientMessage("");
  setSalonMessage("Toutes les donnees ont ete reinitialisees.");
  renderApp();
}

function handleSelectClientService(service) {
  if (!service) {
    return;
  }

  const selectedSession =
    clientSession?.service?.id === service.id &&
    clientSession.invoice &&
    clientSession.invoice.status === "pending"
      ? clientSession
      : null;

  if (selectedSession) {
    setClientMessage("Service deja selectionne. Le QR est disponible.");
    clientSession = {
      ...selectedSession,
      modalOpen: true,
    };
    renderApp();
    return;
  }

  const invoice = createInvoice([
    {
      id: service.id,
      service_id: service.id,
      name: service.name,
      price: service.price,
      photo: service.photo,
    },
  ]);

  clientSession = {
    service: { ...service },
    invoice,
    payment: null,
    modalOpen: true,
  };
  clientMessage = "";
  setClientMessage("Service selectionne. Le QR a ete genere.");
  renderApp();
}

function handleScanClientQr(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const rawValue = form.elements.clientQrInput.value.trim();

  try {
    const qrData = parseQR(rawValue);
    openClientPaymentSession(qrData);
  } catch (error) {
    clientSession = null;
    setClientMessage(error.message);
    renderApp();
  }
}

function closeClientModal() {
  if (!clientSession) {
    return;
  }

  clientSession = {
    ...clientSession,
    modalOpen: false,
  };
  setClientMessage("Confirmation fermee.");
  renderApp();
}

function handleClientPayment(event) {
  event.preventDefault();

  if (!clientSession?.invoice) {
    setClientMessage("Choisissez d abord un service.");
    renderApp();
    return;
  }

  const method = event.currentTarget.elements.paymentMethod.value;

  try {
    let invoice = getInvoices().find((item) => item.id === clientSession.invoice.id) || null;

    if (!invoice) {
      invoice = {
        id: clientSession.invoice.id,
        total_amount: Number(clientSession.invoice.total_amount),
        status: "pending",
        service_id: clientSession.service?.id || null,
        service_name: clientSession.service?.name || null,
        service_photo: clientSession.service?.photo || "",
      };
      state.invoices.push(invoice);
      saveState();
    }

    const payment = createPayment(clientSession.invoice.id, method);
    clientSession = {
      ...clientSession,
      payment,
      invoice: {
        ...invoice,
        status: "paid",
      },
      modalOpen: true,
    };
    setClientMessage("Paiement confirme avec succes.");
    renderApp();
  } catch (error) {
    setClientMessage(error.message);
    renderApp();
  }
}

function createBanner(message, tone = "neutral") {
  if (!message) {
    return "";
  }

  const toneClasses = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return `
    <div class="rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses[tone]}">
      ${escapeHtml(message)}
    </div>
  `;
}

function createPhotoThumb(service) {
  if (service.photo) {
    return `
      <img
        src="${service.photo}"
        alt="${escapeHtml(service.name)}"
        class="h-16 w-16 rounded-2xl object-cover"
      />
    `;
  }

  const initials = String(service.name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return `
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-900 via-fuchsia-700 to-rose-400 text-xl font-bold text-white">
      ${escapeHtml(initials)}
    </div>
  `;
}

function createAdminServiceRow(service) {
  const row = document.createElement("div");
  row.className =
    "flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between";

  row.innerHTML = `
    <div class="flex items-center gap-4">
      ${createPhotoThumb(service)}
      <div>
        <p class="text-sm font-semibold text-slate-900" data-name></p>
        <p class="text-sm text-slate-500" data-price></p>
      </div>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        data-edit
      >
        Modifier
      </button>
      <button
        type="button"
        class="rounded-full border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
        data-delete
      >
        Supprimer
      </button>
    </div>
  `;

  row.querySelector("[data-name]").textContent = service.name;
  row.querySelector("[data-price]").textContent = formatAmount(service.price);
  row.querySelector("[data-edit]").addEventListener("click", () =>
    handleEditService(service.id)
  );
  row.querySelector("[data-delete]").addEventListener("click", () =>
    handleDeleteService(service.id)
  );

  return row;
}

function createInvoiceRow(invoice) {
  const row = document.createElement("div");
  row.className =
    "flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between";

  row.innerHTML = `
    <div>
      <p class="text-sm font-semibold text-slate-900" data-title></p>
      <p class="text-xs uppercase tracking-[0.3em] text-slate-400">Facture</p>
    </div>
    <div class="flex items-center gap-3">
      <span class="rounded-full px-3 py-1 text-xs font-semibold" data-status></span>
      <span class="text-sm font-semibold text-slate-700" data-amount></span>
    </div>
  `;

  const title = invoice.service_name || invoice.id;
  row.querySelector("[data-title]").textContent = title;
  row.querySelector("[data-amount]").textContent = formatAmount(invoice.total_amount);

  const badge = row.querySelector("[data-status]");
  const isPaid = invoice.status === "paid";
  badge.textContent = isPaid ? "Payee" : "En attente";
  badge.className = isPaid
    ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
    : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700";

  return row;
}

function renderSalonView(container) {
  const services = getServices();
  const invoices = getInvoices();
  const editingService = currentServiceForEdit();
  const currentQrBaseUrl = getPaymentBaseUrl();
  const qrWarning = isLikelyLocalPaymentUrl(currentQrBaseUrl)
    ? createBanner(
        "Le QR doit pointer vers une URL accessible depuis le téléphone. Renseigne l'URL publique du salon si Safari ne peut pas ouvrir la page.",
        "danger"
      )
    : "";

  if (editingServiceId && !editingService) {
    clearServiceDraft();
  }

  const previewPhoto = servicePhotoDraft || editingService?.photo || "";

  container.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
      <section class="space-y-6">
        <div class="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div class="mb-5">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-rose-600">Salon</p>
            <h2 class="mt-2 text-2xl font-semibold text-slate-900">Creer un service avec photo</h2>
            <p class="mt-1 text-sm text-slate-500">Le client verra cette photo avant de choisir son service.</p>
          </div>

          ${salonMessage ? createBanner(salonMessage) : ""}
          ${qrWarning}

          <form id="serviceForm" class="mt-5 space-y-5">
            <div class="grid gap-4 md:grid-cols-[1.1fr_0.6fr]">
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-700" for="serviceName">Nom du service</label>
                <input
                  id="serviceName"
                  name="serviceName"
                  type="text"
                  value="${editingService ? escapeHtml(editingService.name) : ""}"
                  placeholder="Coupe homme"
                  class="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  required
                />
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-700" for="servicePrice">Prix (FC)</label>
                <input
                  id="servicePrice"
                  name="servicePrice"
                  type="number"
                  min="1"
                  step="1"
                  value="${editingService ? escapeHtml(editingService.price) : ""}"
                  placeholder="1500"
                  class="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  required
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700" for="servicePhoto">Photo du service</label>
              <input
                id="servicePhoto"
                name="servicePhoto"
                type="file"
                accept="image/*"
                class="block w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-rose-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
              <p class="text-xs text-slate-500">Ajoute une image claire. Elle sera stockee localement dans le navigateur.</p>
            </div>

            <div class="grid gap-4 md:grid-cols-[180px_1fr]">
              <div class="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                ${
                  previewPhoto
                    ? `<img src="${previewPhoto}" alt="Preview service" class="h-40 w-full object-cover" />`
                    : `<div class="flex h-40 items-center justify-center bg-gradient-to-br from-rose-900 via-fuchsia-700 to-rose-400 text-sm font-semibold text-white">Apercu photo</div>`
                }
              </div>
              <div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                ${
                  editingService
                    ? "Modifie les infos du service. Laisse la photo vide pour conserver l'image actuelle."
                    : "La photo est obligatoire pour creer un nouveau service."
                }
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <button
                type="submit"
                class="rounded-2xl bg-rose-900 px-5 py-3 font-semibold text-white transition hover:bg-rose-800"
              >
                ${editingService ? "Mettre a jour" : "Ajouter le service"}
              </button>
              ${
                editingService
                  ? `
                    <button
                      type="button"
                      id="cancelEditBtn"
                      class="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  `
                  : ""
              }
            </div>
          </form>
        </div>

        <div class="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div class="mb-5">
            <h3 class="text-xl font-semibold text-slate-900">Services crees</h3>
            <p class="text-sm text-slate-500">Chaque service peut ensuite etre choisi par le client.</p>
          </div>
          <div id="adminList" class="space-y-3"></div>
          ${
            services.length === 0
              ? `
                <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aucun service pour le moment.
                </div>
              `
              : ""
          }
        </div>
      </section>

      <section class="space-y-6">
        <div class="rounded-[2rem] border border-rose-900 bg-rose-900 p-6 text-white shadow-[0_20px_80px_rgba(136,19,55,0.22)]">
          <div class="mb-4">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-rose-200">Factures</p>
            <h3 class="mt-2 text-2xl font-semibold">Historique local</h3>
          </div>
          <div id="invoiceList" class="space-y-3"></div>
          ${
            invoices.length === 0
              ? `
                <div class="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-300">
                  Les factures creees depuis la vue client apparaitront ici.
                </div>
              `
              : ""
          }
        </div>

        <div class="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <h3 class="text-xl font-semibold text-slate-900">Regles</h3>
          <ul class="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Un service doit avoir une photo.</li>
            <li>• Le client choisit un service, le QR correspondant s affiche.</li>
            <li>• Une facture ne peut etre payee qu une seule fois.</li>
          </ul>
          <button
            type="button"
            id="resetDataBtn"
            class="mt-5 w-full rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Reinitialiser les donnees enregistrees
          </button>
        </div>
      </section>
    </div>
  `;

  const form = container.querySelector("#serviceForm");
  const cancelEditBtn = container.querySelector("#cancelEditBtn");
  const servicePhotoInput = container.querySelector("#servicePhoto");
  const adminList = container.querySelector("#adminList");
  const invoiceList = container.querySelector("#invoiceList");
  const resetDataBtn = container.querySelector("#resetDataBtn");

  form.addEventListener("submit", handleServiceSubmit);
  servicePhotoInput.addEventListener("change", handleServicePhotoChange);

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", handleCancelEdit);
  }

  if (resetDataBtn) {
    resetDataBtn.addEventListener("click", handleResetStoredData);
  }

  services.forEach((service) => {
    adminList.appendChild(createAdminServiceRow(service));
  });

  invoices.forEach((invoice) => {
    invoiceList.appendChild(createInvoiceRow(invoice));
  });
}

function renderClientView(container) {
  const services = getServices();

  if (clientSession?.service) {
    const refreshedService = services.find(
      (service) => service.id === clientSession.service.id
    );

    if (refreshedService) {
      clientSession.service = refreshedService;
    }

    const refreshedInvoice = getInvoices().find(
      (invoice) => invoice.id === clientSession.invoice?.id
    );

    if (refreshedInvoice) {
      clientSession.invoice = refreshedInvoice;
      const payment = getPayments().find((item) => item.invoice_id === refreshedInvoice.id);
      if (payment) {
        clientSession.payment = payment;
      }
    }
  }

  const selectedService = clientSession?.service || null;
  const selectedInvoice = clientSession?.invoice || null;
  const isPaid = selectedInvoice?.status === "paid";
  const isModalOpen = Boolean(clientSession?.modalOpen && selectedService);
  const paymentOptionsMarkup = paymentMethods
    .map(
      (method) =>
        `<option value="${method.value}">${escapeHtml(method.label)}</option>`
    )
    .join("");

  container.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section class="space-y-6">
        <div class="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div class="mb-5">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-rose-600">Client</p>
            <h2 class="mt-2 text-2xl font-semibold text-slate-900">Scanner le QR</h2>
            <p class="mt-1 text-sm text-slate-500">Le scan ouvre ensuite l’ecran de confirmation plein mobile.</p>
          </div>

          ${clientMessage ? createBanner(clientMessage, isPaid ? "success" : "neutral") : ""}

          <form id="scanForm" class="mt-5 space-y-4">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700" for="clientQrInput">QR scanne</label>
              <textarea
                id="clientQrInput"
                name="clientQrInput"
                rows="5"
                placeholder='{"invoice_id":"inv_123","amount":1500}'
                class="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
              >${escapeHtml(clientQrDraft)}</textarea>
            </div>
            <button
              type="submit"
              class="rounded-2xl bg-rose-900 px-5 py-3 font-semibold text-white transition hover:bg-rose-800"
            >
              Scanner et confirmer
            </button>
          </form>
        </div>

        <div class="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div class="mb-5">
            <h3 class="text-xl font-semibold text-slate-900">Services visibles</h3>
            <p class="text-sm text-slate-500">Tu peux aussi toucher un service pour previsualiser sa confirmation.</p>
          </div>
          <div id="clientGrid" class="grid gap-4 sm:grid-cols-2"></div>
          ${
            services.length === 0
              ? `
                <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aucun service disponible pour le moment.
                </div>
              `
              : ""
          }
        </div>
      </section>

      <section class="space-y-6">
        <div class="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <h3 class="text-xl font-semibold text-slate-900">Mode de paiement</h3>
          <p class="mt-2 text-sm text-slate-500">Apres scan, un modal plein ecran s ouvre avec le service et le prix.</p>
          <div class="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            ${selectedService ? `Service detecte: ${escapeHtml(selectedService.name)}` : "Scanner un QR pour afficher le service."}
          </div>
        </div>
      </section>
    </div>
  `;

  const scanForm = container.querySelector("#scanForm");
  const clientGrid = container.querySelector("#clientGrid");
  if (scanForm) {
    scanForm.addEventListener("submit", handleScanClientQr);
    const qrInput = scanForm.querySelector("#clientQrInput");
    qrInput.addEventListener("input", handleClientQrDraft);
  }
  services.forEach((service) => {
    clientGrid.appendChild(
      createServiceCard(service, handleSelectClientService, {
        label: selectedService?.id === service.id ? "Selectionne" : "Choisir",
        active: selectedService?.id === service.id,
      })
    );
  });

  if (isModalOpen) {
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 z-50 flex items-end justify-center bg-rose-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4";
    modal.innerHTML = `
      <div class="flex h-[100dvh] w-full max-w-[460px] flex-col overflow-hidden bg-rose-950 text-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] sm:h-auto sm:max-h-[92dvh] sm:rounded-[2.5rem]">
        <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.4em] text-rose-300">Confirmation mobile</p>
            <h3 class="mt-1 text-lg font-semibold">Validation du paiement</h3>
          </div>
          <button
            type="button"
            data-close-modal
            class="rounded-full border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Fermer
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="space-y-4">
            <div class="overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/5">
              ${
                selectedService.photo
                  ? `<img src="${escapeHtml(selectedService.photo)}" alt="${escapeHtml(selectedService.name)}" class="h-52 w-full object-cover" />`
                  : `<div class="flex h-52 items-center justify-center bg-gradient-to-br from-rose-700 via-fuchsia-700 to-rose-400 text-5xl font-bold text-white">${escapeHtml(
                      selectedService.name.charAt(0).toUpperCase()
                    )}</div>`
              }
            </div>
            <div class="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-slate-300">Service</span>
                <strong class="text-sm text-white">${escapeHtml(selectedService.name)}</strong>
              </div>
              <div class="mt-2 flex items-center justify-between gap-3">
                <span class="text-sm text-slate-300">Prix</span>
                <strong class="text-lg text-rose-300">${formatAmount(selectedService.price)}</strong>
              </div>
            </div>
            <div id="qrMount"></div>
            ${
              isPaid
                ? `
                  <div class="rounded-[1.6rem] border border-emerald-300/30 bg-emerald-400/10 p-4 text-emerald-100">
                    <p class="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200">Succes</p>
                    <h4 class="mt-2 text-lg font-semibold">Paiement confirme</h4>
                    <p class="mt-2 text-sm">Le QR est maintenant invalide.</p>
                    <div class="mt-4 grid gap-2 text-sm">
                      <div class="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                        <span>Methode</span>
                        <span class="font-semibold">${escapeHtml(
                          getPaymentMethodLabel(clientSession.payment?.method || "-")
                        )}</span>
                      </div>
                    </div>
                  </div>
                `
                : `
                  <form id="paymentForm" class="space-y-4 pb-2">
                    <div class="space-y-2">
                      <label class="text-sm font-medium text-slate-200" for="paymentMethod">Methode de paiement</label>
                      <select
                        id="paymentMethod"
                        name="paymentMethod"
                        class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-400/20"
                      >
                        ${paymentOptionsMarkup}
                      </select>
                    </div>
                    <button
                      type="submit"
                      class="w-full rounded-2xl bg-rose-300 px-5 py-3 font-semibold text-rose-950 transition hover:bg-rose-200"
                    >
                      Confirmer le paiement
                    </button>
                  </form>
                `
            }
          </div>
        </div>
      </div>
    `;

    container.appendChild(modal);

    const closeModalBtn = modal.querySelector("[data-close-modal]");
    closeModalBtn.addEventListener("click", closeClientModal);

    const modalPaymentForm = modal.querySelector("#paymentForm");
    if (modalPaymentForm) {
      modalPaymentForm.addEventListener("submit", handleClientPayment);
    }

    if (!isPaid) {
      const qrMount = modal.querySelector("#qrMount");
      renderQR(
        qrMount,
        generateQR({
          id: selectedInvoice?.id || "",
          total_amount: selectedInvoice?.total_amount || selectedService.price,
        }, getPaymentBaseUrl())
      );
    }
  }
}

export function renderApp() {
  if (!rootEl) {
    return;
  }

  document.body.style.overflow = clientSession?.modalOpen ? "hidden" : "";

  rootEl.innerHTML = `
    <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.2),_transparent_30%),linear-gradient(180deg,_#3b0a24_0%,_#1f0a17_100%)] text-slate-100">
      <div class="mx-auto max-w-7xl px-4 py-6">
        <div id="headerMount"></div>
        <main class="mt-6">
          <section id="viewMount"></section>
        </main>
      </div>
    </div>
  `;

  const headerMount = rootEl.querySelector("#headerMount");
  const viewMount = rootEl.querySelector("#viewMount");

  renderHeader(headerMount, handleNavigate, activeView);

  if (activeView === "salon") {
    renderSalonView(viewMount);
  } else {
    renderClientView(viewMount);
  }
}

export function initApp() {
  rootEl = document.querySelector("#app");

  if (!rootEl) {
    throw new Error("Le conteneur #app est introuvable.");
  }

  loadState();
  initializeClientSessionFromUrl();
  renderApp();

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      loadState();
      renderApp();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
