import { generateId, getState, saveState } from "./app.js";
import { getServiceById, getServices } from "./services.js";

function resolveService(service) {
  if (typeof service === "string") {
    return getServiceById(service);
  }

  if (service && typeof service === "object" && service.id) {
    return service;
  }

  return null;
}

export function addToCart(service) {
  const state = getState();
  const resolvedService = resolveService(service);

  if (!resolvedService) {
    throw new Error("Service introuvable");
  }

  const sourceService =
    getServices().find((item) => item.id === resolvedService.id) || resolvedService;

  const cartItem = {
    id: generateId("cart"),
    service_id: sourceService.id,
    name: sourceService.name,
    price: sourceService.price,
  };

  state.cart.push(cartItem);
  saveState();

  return cartItem;
}

export function removeFromCart(id) {
  const state = getState();
  const index = state.cart.findIndex((item) => item.id === id);

  if (index < 0) {
    throw new Error("Item du panier introuvable");
  }

  const removed = state.cart.splice(index, 1)[0];
  saveState();

  return removed;
}

export function getCart() {
  return getState().cart;
}

export function getTotal() {
  return getState().cart.reduce((total, item) => total + Number(item.price || 0), 0);
}

export function clearCart() {
  const state = getState();
  state.cart = [];
  saveState();
}
