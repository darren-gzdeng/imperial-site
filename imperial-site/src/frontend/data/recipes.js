const imagePath = (fileName) => `${import.meta.env.BASE_URL}images/recipes/${fileName}`;

export const recipes = [
  {
    slug: "garlic-butter-calamari",
    product: "Squid Rings",
    title: "Garlic Butter Calamari",
    time: "10 min",
    image: imagePath("garlic-butter-calamari.jpg"),
    ingredients: ["Squid rings", "Garlic butter", "Lemon and parsley"],
    method: [
      "Pat the squid rings dry.",
      "Sear in a hot pan for 1-2 minutes.",
      "Toss with garlic butter, lemon and parsley.",
    ],
  },
  {
    slug: "wok-fried-squid-flower-ginger-scallion",
    product: "Squid Flower",
    title: "Wok-Fried Squid Flower with Ginger & Scallion",
    time: "8 min",
    image: imagePath("ginger-scallion-squid-flower.jpg"),
    ingredients: ["Squid flowers", "Ginger and spring onion", "Light soy sauce"],
    method: [
      "Heat oil in a wok, then cook ginger and spring onion until fragrant.",
      "Add squid flowers and stir-fry quickly until they curl.",
      "Finish with a small splash of light soy and serve hot.",
    ],
  },
  {
    slug: "crispy-calamari-aioli",
    product: "Crumbed Squid Rings",
    title: "Crispy Calamari & Aioli",
    time: "10 min",
    image: imagePath("crumbed-calamari.jpg"),
    ingredients: ["Crumbed squid rings", "Lemon", "Aioli"],
    method: [
      "Cook from frozen until crisp and golden.",
      "Drain briefly on paper towel.",
      "Serve hot with lemon wedges and aioli.",
    ],
  },
  {
    slug: "air-fried-salt-pepper-squid-flower-dipping-sauce",
    product: "Salt & Pepper Squid Flower",
    title: "Air-Fried Salt & Pepper Squid Flower with Dipping Sauce",
    time: "10 min",
    image: imagePath("salt-pepper-squid-flower.jpg"),
    ingredients: ["Crumbed salt and pepper squid flowers", "Cooking oil spray", "Chilli mayo dipping sauce"],
    method: [
      "Place frozen crumbed squid flowers in a single layer in the air fryer.",
      "Lightly spray with oil and cook until golden and crisp.",
      "Serve hot with chilled dipping sauce.",
    ],
  },
  {
    slug: "snow-crab-hotpot",
    product: "Snow Crab Legs",
    title: "Snow Crab Hotpot",
    time: "12 min",
    image: imagePath("snow-crab-legs.jpg"),
    ingredients: ["Snow crab legs", "Clear seafood broth", "Cabbage, mushrooms and tofu"],
    method: [
      "Bring the broth and vegetables to a gentle simmer.",
      "Add crab legs and heat through for 4-5 minutes.",
      "Serve from the pot with your favourite dipping sauce.",
    ],
  },
  {
    slug: "garlic-butter-king-crab",
    product: "Cooked Frozen King Crab Platter",
    title: "Garlic Butter King Crab",
    time: "10 min",
    image: imagePath("king-crab-platter.jpg"),
    ingredients: ["Cooked king crab", "Butter and garlic", "Lemon and parsley"],
    method: [
      "Melt butter with minced garlic over low heat.",
      "Add crab and warm gently, spooning the butter over it.",
      "Finish with lemon and parsley before serving.",
    ],
  },
];
