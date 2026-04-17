export default function Home() {
  const products = [
    { name: "Fresh Salmon", price: "$15/lb", image: "https://via.placeholder.com/200x150?text=Salmon" },
    { name: "Lobster Tails", price: "$25/lb", image: "https://via.placeholder.com/200x150?text=Lobster" },
    { name: "Shrimp", price: "$12/lb", image: "https://via.placeholder.com/200x150?text=Shrimp" },
    { name: "Tuna Steak", price: "$18/lb", image: "https://via.placeholder.com/200x150?text=Tuna" },
  ];

  return (
    <section>
      <h1>Welcome to Imperial Ocean Select</h1>
      <p>Fresh seafood delivered to your door</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '20px' }}>
        {products.map((product, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', width: '200px' }}>
            <img src={product.image} alt={product.name} style={{ width: '100%', height: '150px', objectFit: 'cover' }} />
            <h3>{product.name}</h3>
            <p>{product.price}</p>
            <button style={{ background: '#1e40af', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px' }}>Add to Cart</button>
          </div>
        ))}
      </div>
    </section>
  );
}