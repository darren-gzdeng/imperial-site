const CART_STORAGE_KEY = "imperial_cart";
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
