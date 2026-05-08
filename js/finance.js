import { generateId, getState, saveState } from "./app.js";
import { clearCart } from "./cart.js";

function getInvoiceByIdInternal(invoiceId) {
  return getState().invoices.find((invoice) => invoice.id === invoiceId) || null;
}

function validateMethod(method) {
  if (!["airtel", "orange", "afrimoney", "cash"].includes(method)) {
    throw new Error("Méthode de paiement invalide");
  }

  return method;
}

export function createInvoice(cart = []) {
  const state = getState();
  const snapshot = Array.isArray(cart) ? cart.map((item) => ({ ...item })) : [];

  if (snapshot.length === 0) {
    throw new Error("Panier vide");
  }

  const totalAmount = snapshot.reduce(
    (total, item) => total + Number(item.price || 0),
    0
  );

  const invoice = {
    id: generateId("inv"),
    total_amount: totalAmount,
    status: "pending",
  };

  const primaryItem = snapshot[0] || null;

  if (primaryItem) {
    invoice.service_id = primaryItem.service_id || primaryItem.id || null;
    invoice.service_name = primaryItem.name || null;
    invoice.service_photo = primaryItem.photo || "";
  }

  state.invoices.push(invoice);
  clearCart();
  saveState();

  return invoice;
}

export function getInvoices() {
  return getState().invoices;
}

export function getInvoiceById(invoiceId) {
  return getInvoiceByIdInternal(invoiceId);
}

export function markInvoicePaid(invoiceId) {
  const invoice = getInvoiceByIdInternal(invoiceId);

  if (!invoice) {
    throw new Error("Facture introuvable");
  }

  if (invoice.status === "paid") {
    throw new Error("Facture déjà payée");
  }

  invoice.status = "paid";
  saveState();

  return invoice;
}

export function createPayment(invoiceId, method) {
  const state = getState();
  const invoice = getInvoiceByIdInternal(invoiceId);

  if (!invoice) {
    throw new Error("Facture introuvable");
  }

  if (invoice.status === "paid") {
    throw new Error("Paiement déjà effectué");
  }

  validateMethod(method);

  const existingPayment = state.payments.find(
    (payment) => payment.invoice_id === invoiceId
  );

  if (existingPayment) {
    throw new Error("Un paiement existe déjà pour cette facture");
  }

  const payment = {
    id: generateId("pay"),
    invoice_id: invoice.id,
    amount: invoice.total_amount,
    method,
    status: "success",
  };

  state.payments.push(payment);
  markInvoicePaid(invoiceId);

  return payment;
}

export function getPayments() {
  return getState().payments;
}
