import { generateId, getState, saveState } from "./app.js";

function parsePrice(price) {
  const value = Number(price);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Prix invalide");
  }

  return value;
}

function validateName(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Nom de service invalide");
  }

  return name.trim();
}

function validatePhoto(photo, required = false) {
  if (typeof photo !== "string" || !photo.trim()) {
    if (required) {
      throw new Error("Photo du service obligatoire");
    }

    return "";
  }

  return photo.trim();
}

export function addService(name, price, photo) {
  const state = getState();
  const service = {
    id: generateId("srv"),
    name: validateName(name),
    price: parsePrice(price),
    photo: validatePhoto(photo, true),
  };

  state.services.push(service);
  saveState();

  return service;
}

export function updateService(id, data) {
  const state = getState();
  const service = state.services.find((item) => item.id === id);

  if (!service) {
    throw new Error("Service introuvable");
  }

  if (data.name !== undefined) {
    service.name = validateName(data.name);
  }

  if (data.price !== undefined) {
    service.price = parsePrice(data.price);
  }

  if (data.photo !== undefined) {
    service.photo = validatePhoto(data.photo, false);
  }

  saveState();

  return service;
}

export function deleteService(id) {
  const state = getState();
  const index = state.services.findIndex((item) => item.id === id);

  if (index < 0) {
    throw new Error("Service introuvable");
  }

  const removed = state.services.splice(index, 1)[0];
  saveState();

  return removed;
}

export function getServices() {
  return getState().services;
}

export function getServiceById(id) {
  return getState().services.find((item) => item.id === id) || null;
}
