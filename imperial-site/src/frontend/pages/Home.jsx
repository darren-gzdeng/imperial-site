import { Link } from "react-router";

const imagePath = (fileName) => `${import.meta.env.BASE_URL}images/home/${fileName}`;

const collections = [
  {
    name: "King Crab",
    note: "Premium",
    image: imagePath("king-crab.jpg"),
    path: "/products",
  },
  {
    name: "Snow Crab",
    note: "Delicate flavour",
    image: imagePath("snow-crab.jpg"),
    path: "/products",
  },
  {
    name: "Sashimi Cuts",
    note: "Delicately prepared",
    image: imagePath("sashimi.jpg"),
    path: "/seafood",
  },
  {
    name: "Squid",
    note: "Finest quality",
    image: imagePath("squid.jpg"),
    path: "/products",
  },
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <img
          className="home-hero-image"
          src={imagePath("hero-seafood.jpg")}
          alt="King crab, snow crab, tuna and squid served over ice"
        />
        <div className="home-hero-content">
          <p className="home-eyebrow">Imperial Ocean</p>
          <h1>
            Premium seafood
            <span>for every table.</span>
          </h1>
          <p className="home-hero-copy">Selected with care. Delivered fresh.</p>
          <div className="home-hero-actions">
            <Link to="/products" className="home-primary-link">
              Shop Selection
            </Link>
            <Link to="/about" className="home-secondary-link">
              Our Story
            </Link>
          </div>
        </div>
      </section>

      <section className="home-collections">
        <div className="home-section-heading">
          <p className="home-eyebrow">Our Selection</p>
          <h2>Discover the ocean's finest</h2>
        </div>

        <div className="home-collection-grid">
          {collections.map((collection) => (
            <Link key={collection.name} to={collection.path} className="home-tile">
              <img src={collection.image} alt={collection.name} />
              <div className="home-tile-caption">
                <p>{collection.note}</p>
                <h3>{collection.name}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>


    </div>
  );
}
