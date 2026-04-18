export default function Home() {
  const products = [
    { name: "King Crab Legs", price: "On Enquiry", image: "/images/king-crab.jpg" },
    { name: "Snow Crab Legs", price: "On Enquiry", image: "/images/snow-crab.jpg" },
    { name: "Tuna Toro", price: "On Enquiry", image: "/images/tuna-toro.jpg" },
    { name: "Squid", price: "On Enquiry", image: "/images/squid.jpg" },
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