import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, X } from "lucide-react";
import { addCartItem, getCartCount } from "../api/cartStorage";
import { getProducts } from "../api/productsApi";

const catalogProducts = [
  {
    id: 1,
    backendItem: "Raw Snow Crab Claws 400g/pkg",
    name: "Raw Snow Crab Claws",
    sku: "SNOW-CLAW-RAW-400",
    weight: "400g/pkg",
    unit_price: "On enquiry",
    image: "images/home/snow-crab.jpg",
    productType: "Raw Snow Crab",
    productCategory: "Claws",
    storageStatus: "Frozen",
    preparationMethod: "Raw",
    priceRange: "On enquiry",
  },
  {
    id: 2,
    backendItem: "Raw Snow Crab Legs 400g/pkg",
    name: "Raw Snow Crab Legs",
    sku: "SNOW-LEG-RAW-400",
    weight: "400g/pkg",
    unit_price: "On enquiry",
    image: "images/king_crab.png",
    productType: "Raw Snow Crab",
    productCategory: "Legs",
    storageStatus: "Frozen",
    preparationMethod: "Raw",
    priceRange: "On enquiry",
  },
  {
    id: 3,
    backendItem: "Raw Snow Crab Platter 800g/pkg",
    name: "Raw Snow Crab Platter",
    sku: "SNOW-PLATTER-RAW-800",
    weight: "800g/pkg",
    unit_price: "On enquiry",
    image: "images/snow-crab.svg",
    productType: "Raw Snow Crab",
    productCategory: "Platter",
    storageStatus: "Frozen",
    preparationMethod: "Raw",
    priceRange: "On enquiry",
  },
  {
    id: 4,
    backendItem: "Snow Crab Claws 400g/pkg",
    name: "Snow Crab Claws",
    sku: "SNOW-CLAW-400",
    weight: "400g/pkg",
    unit_price: "On enquiry",
    image: "images/snow-crab.svg",
    productType: "Snow Crab",
    productCategory: "Claws",
    storageStatus: "Frozen",
    preparationMethod: "Ready-to-cook",
    priceRange: "On enquiry",
  },
  {
    id: 5,
    backendItem: "Snow Crab Legs 400g/pkg",
    name: "Snow Crab Legs",
    sku: "SNOW-LEG-400",
    weight: "400g/pkg",
    unit_price: "On enquiry",
    image: "images/recipes/snow-crab-legs.jpg",
    productType: "Snow Crab",
    productCategory: "Legs",
    storageStatus: "Frozen",
    preparationMethod: "Ready-to-cook",
    priceRange: "On enquiry",
  },
];

const filterGroups = [
  {
    id: "productType",
    title: "Product Type",
    options: [
      { label: "Raw Snow Crab" },
      { label: "Snow Crab" },
    ],
  },
  {
    id: "productCategory",
    title: "Product Category",
    options: [
      { label: "Claws" },
      { label: "Legs" },
      { label: "Platter" },
    ],
  },
  {
    id: "storageStatus",
    title: "Storage Status",
    options: [{ label: "Frozen" }],
  },
  {
    id: "preparationMethod",
    title: "By Preparation Method",
    options: [
      { label: "Raw" },
      { label: "Ready-to-cook" },
    ],
  },
  {
    id: "priceRange",
    title: "By Price",
    type: "price",
  },
];

const initialOpenGroups = filterGroups.reduce((state, group) => {
  state[group.id] = false;
  return state;
}, {});

const formatPrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) ? `$${price.toFixed(2)}` : "On enquiry";
};

const parsePrice = (value) => {
  const price = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(price) ? price : 0;
};

const mergeBackendPrices = (backendProducts) => {
  const productsByItem = new Map(
    backendProducts.map((product) => [String(product.item || "").trim().toLowerCase(), product])
  );

  return catalogProducts.map((product) => {
    const backendProduct = productsByItem.get(product.backendItem.toLowerCase());

    if (!backendProduct) {
      return product;
    }

    return {
      ...product,
      backend_product_id: backendProduct.id,
      backend_item: backendProduct.item,
      sku: backendProduct.sku || product.sku,
      unit_price: formatPrice(backendProduct.retail_price),
      stock_quantity: backendProduct.stock_quantity,
    };
  });
};

const getOptionCount = (items, groupId, label) =>
  items.filter((product) => product[groupId] === label).length;

const isProductVisible = (product, selectedFilters) =>
  filterGroups.every((group) => {
    if (group.type === "price") {
      return true;
    }

    const selected = selectedFilters[group.id];
    return !selected?.length || selected.includes(product[group.id]);
  });

const isProductInPriceRange = (product, priceRange) => {
  const price = parsePrice(product.unit_price);
  const min = priceRange.from === "" ? null : Number(priceRange.from);
  const max = priceRange.to === "" ? null : Number(priceRange.to);

  if (min !== null && price < min) {
    return false;
  }

  if (max !== null && price > max) {
    return false;
  }

  return true;
};

const sortProducts = (items, sortBy) => {
  if (sortBy === "Name") {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  return items;
};

export default function Products() {
  const [products, setProducts] = useState(catalogProducts);
  const [openGroups, setOpenGroups] = useState(initialOpenGroups);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [priceRange, setPriceRange] = useState({ from: "", to: "" });
  const [sortBy, setSortBy] = useState("Featured");
  const [productMessage, setProductMessage] = useState("");
  const [cartNotice, setCartNotice] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadProducts = async () => {
      try {
        const backendProducts = await getProducts();

        if (isMounted) {
          setProducts(mergeBackendPrices(backendProducts));
          setProductMessage("");
        }
      } catch {
        if (isMounted) {
          setProductMessage("Showing catalog items. Prices could not be loaded.");
        }
      }
    };

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    return sortProducts(
      products.filter((product) => isProductVisible(product, selectedFilters) && isProductInPriceRange(product, priceRange)),
      sortBy
    );
  }, [products, selectedFilters, priceRange, sortBy]);

  const highestPrice = useMemo(() => {
    return products.reduce((highest, product) => Math.max(highest, parsePrice(product.unit_price)), 0);
  }, [products]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleFilter = (groupId, label) => {
    setSelectedFilters((prev) => {
      const current = prev[groupId] || [];
      const next = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label];

      return {
        ...prev,
        [groupId]: next,
      };
    });
  };

  const handlePriceRangeChange = (field, value) => {
    setPriceRange((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddToCart = (product) => {
    if (Number(product.stock_quantity || 0) <= 0) {
      return;
    }

    addCartItem(product);
    setCartNotice({
      product,
      count: getCartCount(),
    });
  };

  return (
    <section className="catalog-page">
      <aside className="catalog-filters">
        <h1 className="catalog-filter-title">Filter:</h1>
        {filterGroups.map((group) => (
          <section key={group.id} className="catalog-filter-group">
            <button
              type="button"
              className="catalog-filter-toggle"
              aria-expanded={openGroups[group.id]}
              onClick={() => toggleGroup(group.id)}
            >
              <span>{group.title}</span>
              <span aria-hidden="true">{openGroups[group.id] ? "^" : "v"}</span>
            </button>
            {openGroups[group.id] && (
              group.type === "price" ? (
                <div className="catalog-price-filter">
                  <p>The highest price is ${highestPrice.toFixed(2)}</p>
                  <div className="catalog-price-inputs">
                    <label>
                      <span>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        placeholder="From"
                        value={priceRange.from}
                        onChange={(event) => handlePriceRangeChange("from", event.target.value)}
                      />
                    </label>
                    <label>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        placeholder="To"
                        value={priceRange.to}
                        onChange={(event) => handlePriceRangeChange("to", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="catalog-filter-options">
                  {group.options.map((option) => (
                    <label key={option.label} className="catalog-filter-option">
                      <input
                        type="checkbox"
                        checked={(selectedFilters[group.id] || []).includes(option.label)}
                        onChange={() => toggleFilter(group.id, option.label)}
                      />
                      <span>
                        {option.label} ({getOptionCount(products, group.id, option.label)})
                      </span>
                    </label>
                  ))}
                </div>
              )
            )}
          </section>
        ))}
      </aside>

      <div className="catalog-main">
        <div className="catalog-toolbar">
          <label className="catalog-sort">
            <span>Sort by:</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option>Featured</option>
              <option>Name</option>
            </select>
          </label>
          <span>{filteredProducts.length} products</span>
        </div>

        {productMessage && <p className="catalog-message">{productMessage}</p>}

        {filteredProducts.length === 0 ? (
          <p className="catalog-empty">No products match these filters.</p>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => {
              const isOutOfStock = Number(product.stock_quantity || 0) <= 0;

              return (
                <article key={product.id} className="product-card">
                  <div className="product-card__image-wrap">
                    <img src={product.image} alt={product.name} className="product-card__image" />
                  </div>
                  <div className="product-card__content">
                    <h2 className="product-card__name">{product.name}</h2>
                    <p className="product-card__weight">{product.weight}</p>
                    <p className="product-card__price">{product.unit_price}</p>
                    <button
                      type="button"
                      className="product-card__button"
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(product)}
                    >
                      {isOutOfStock ? "Out of stock" : "Add to cart"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {cartNotice && (
        <aside className="cart-added-panel" aria-live="polite">
          <div className="cart-added-panel__header">
            <div className="cart-added-panel__title">
              <Check size={18} strokeWidth={1.8} />
              <span>Item added to your cart</span>
            </div>
            <button
              type="button"
              className="cart-added-panel__close"
              aria-label="Close cart notice"
              onClick={() => setCartNotice(null)}
            >
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          <div className="cart-added-panel__item">
            <img src={cartNotice.product.image} alt={cartNotice.product.name} />
            <div>
              <h2>{cartNotice.product.name}</h2>
              <p>{cartNotice.product.weight}</p>
            </div>
          </div>

          <div className="cart-added-panel__subtotal">
            <span>Subtotal</span>
            <strong>{cartNotice.product.unit_price}</strong>
          </div>

          <Link to="/cart" className="cart-added-panel__cart-link">
            View my cart ({cartNotice.count})
          </Link>

          <button type="button" className="cart-added-panel__continue" onClick={() => setCartNotice(null)}>
            Continue shopping
          </button>
        </aside>
      )}
    </section>
  );
}
