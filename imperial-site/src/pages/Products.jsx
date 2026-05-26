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

const styles = {
  page: {
    color: "#1b1d22",
  },
  header: {
    maxWidth: "760px",
    marginBottom: "34px",
  },
  title: {
    margin: "0 0 12px",
    fontSize: "2.75rem",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.06em",
  },
  intro: {
    margin: 0,
    color: "#5b5f66",
    fontSize: "1rem",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "22px",
  },
  card: {
    border: "1px solid #d9dde5",
    borderRadius: "8px",
    overflow: "hidden",
    background: "#ffffff",
  },
  imageWrap: {
    height: "190px",
    background: "#f5f6f8",
  },
  image: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  content: {
    padding: "18px",
  },
  productName: {
    margin: "0 0 8px",
    fontSize: "1.2rem",
    fontWeight: 600,
  },
  description: {
    minHeight: "88px",
    margin: "0 0 18px",
    color: "#5b5f66",
    fontSize: "0.92rem",
    lineHeight: 1.55,
  },
  facts: {
    display: "grid",
    gap: "10px",
    margin: 0,
    padding: 0,
    listStyle: "none",
    color: "#3f434a",
    fontSize: "0.9rem",
  },
  factLabel: {
    display: "inline-block",
    minWidth: "78px",
    color: "#6b7280",
    fontWeight: 600,
  },
};

export default function Products() {
  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Products</h1>
        <p style={styles.intro}>
          Browse product details including descriptions, SKU, weight, and current price information.
        </p>
      </div>

      <div style={styles.grid}>
        {products.map((product) => (
          <article key={product.id} style={styles.card}>
            <div style={styles.imageWrap}>
              <img src={product.image} alt={product.name} style={styles.image} />
            </div>
            <div style={styles.content}>
              <h2 style={styles.productName}>{product.name}</h2>
              <p style={styles.description}>{product.description}</p>
              <ul style={styles.facts}>
                <li>
                  <span style={styles.factLabel}>SKU</span>
                  {product.sku}
                </li>
                <li>
                  <span style={styles.factLabel}>Weight</span>
                  {product.weight}
                </li>
                <li>
                  <span style={styles.factLabel}>Price</span>
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
