import { Link } from "react-router";
import { recipes } from "../data/recipes";

export default function ChefRecipe() {
  return (
    <section className="recipe-page">
      <header className="recipe-hero">
        <p className="recipe-eyebrow">Chef&apos;s Recipe</p>
        <h1>Seafood recipes.</h1>
      </header>

      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <Link className="recipe-card" key={recipe.slug} to={`/chef-recipe/${recipe.slug}`}>
            <img className="recipe-image" src={recipe.image} alt={recipe.title} />
            <div className="recipe-card-content">
              <p className="recipe-product">{recipe.product}</p>
              <h2>{recipe.title}</h2>
              <span className="recipe-link">View Recipe</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
