const CART_STORAGE_KEY = "imperial_cart";
const DELIVERY_DATE_STORAGE_KEY = "imperial_delivery_date";
export const CART_UPDATED_EVENT = "imperial-cart-updated";

export function getCartItems() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function getCartCount() {
  return getCartItems().reduce((total, item) => total + Number(item.quantity || 0), 0);
}

export function saveCartItems(items) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function addCartItem(product) {
  const items = getCartItems();
  const existingItem = items.find((item) => item.id === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
    saveCartItems(items);
    return existingItem;
  }

  const cartItem = {
    id: product.id,
    product_id: product.backend_product_id || product.product_id || product.id,
    backend_item: product.backend_item || product.backendItem || product.name,
    name: product.name,
    image: product.image,
    unit_price: product.unit_price,
    quantity: 1,
  };

  saveCartItems([...items, cartItem]);
  return cartItem;
}

export function updateCartItemQuantity(productId, quantity) {
  const nextQuantity = Math.max(1, Number(quantity) || 1);
  const items = getCartItems().map((item) =>
    item.id === productId ? { ...item, quantity: nextQuantity } : item
  );

  saveCartItems(items);
  return items;
}

export function removeCartItem(productId) {
  const items = getCartItems().filter((item) => item.id !== productId);
  saveCartItems(items);
  return items;
}

export function clearCartItems() {
  saveCartItems([]);
}

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function getDefaultDeliveryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);

  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }

  return toDateKey(date);
}

export function getDeliveryDate() {
  const storedDate = localStorage.getItem(DELIVERY_DATE_STORAGE_KEY);
  return storedDate || getDefaultDeliveryDate();
}

export function saveDeliveryDate(deliveryDate) {
  localStorage.setItem(DELIVERY_DATE_STORAGE_KEY, deliveryDate);
}

export function formatDeliveryDate(deliveryDate) {
  const [year, month, day] = String(deliveryDate || getDefaultDeliveryDate()).split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
