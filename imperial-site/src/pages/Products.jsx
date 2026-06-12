const products = [
  {
    id: 1,
    name: "King Crab Legs",
    description: "Premium crab legs with a sweet, delicate flavour. Best served steamed, chilled, or as a centrepiece seafood platter item.",
    sku: "CRAB-KING-001",
    weight: "1 kg pack",
    unit_price: "On enquiry",
    image: "images/king_crab.png",
  },
  {
    id: 2,
    name: "Snow Crab Legs",
    description: "Tender snow crab legs with clean ocean flavour. A strong choice for hotpot, seafood boils, and chilled platters.",
    sku: "CRAB-SNOW-001",
    weight: "1 kg pack",
    unit_price: "On enquiry",
    image: "images/snow-crab.svg",
  },
  {
    id: 3,
    name: "Tuna Toro",
    description: "Rich tuna belly cut suited to sashimi-style service. Handle chilled and slice shortly before serving.",
    sku: "TUNA-TORO-001",
    weight: "Per portion",
    unit_price: "On enquiry",
    image: "images/tuna-toro.svg",
  },
  {
    id: 4,
    name: "Squid",
    description: "Cleaned squid suitable for grilling, stir-fry, hotpot, or deep-fried dishes. Mild flavour and versatile texture.",
    sku: "SQUID-001",
    weight: "1 kg pack",
    unit_price: "On enquiry",
    image: "images/squid.svg",
  },
];

export default function Products() {
  return (
    <section className="catalog-page">
      <div className="catalog-header">
        <h1 className="catalog-title">Products</h1>
        <p className="catalog-intro">
          Browse product details including descriptions, SKU, weight, and current price information.
        </p>
      </div>

      <div className="product-grid">
        {products.map((product) => (
          <article key={product.id} className="product-card">
            <div className="product-card__image-wrap">
              <img src={product.image} alt={product.name} className="product-card__image" />
            </div>
            <div className="product-card__content">
              <h2 className="product-card__name">{product.name}</h2>
              <p className="product-card__description">{product.description}</p>
              <ul className="product-card__facts">
                <li>
                  <span className="product-card__fact-label">SKU</span>
                  {product.sku}
                </li>
                <li>
                  <span className="product-card__fact-label">Weight</span>
                  {product.weight}
                </li>
                <li>
                  <span className="product-card__fact-label">Price</span>
                  {product.unit_price}
                </li>
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
